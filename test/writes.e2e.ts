// Phase 3 write-tool tests (T3.1 to T3.8) through POST /mcp. They change real data in the Shopify dev store
// and DynamoDB: run `npm run seed` first, and they call delete_my_data at the end.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const READY = !!process.env.SHOPIFY_STORE && !!process.env.TABLE_NAME;
const skip = !READY && 'needs .env with SHOPIFY_STORE and TABLE_NAME and a freshly seeded store';

type Text = { type: string; text?: string };
type Result = { content: Text[]; structuredContent?: Record<string, unknown>; isError?: boolean };
type Candidate = { orderId: string; lineItemId: string; productId: string };

async function connect() {
  const client = new Client({ name: 'e2e-writes', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)));
  return client;
}
async function call(client: Client, name: string, args: Record<string, unknown>): Promise<Result> {
  return (await client.callTool({ name, arguments: args })) as Result;
}
const text = (r: Result) => r.content.find(c => c.type === 'text')?.text ?? '';
const sc = <T,>(r: Result) => r.structuredContent as T;

async function line(client: Client, q: string): Promise<Candidate> {
  const r = await call(client, 'identify_product', { query: q });
  const [c] = sc<{ candidates: Candidate[] }>(r).candidates;
  assert.ok(c, `no order for ${q}: ${text(r)}`);
  return c;
}

after(async () => {
  if (!READY) return;
  const client = await connect();
  try { await call(client, 'delete_my_data', { confirmed: true }); } finally { await client.close(); }
});

test('T3.1 write tools without confirmed:true ask for confirmation and create nothing', { skip }, async () => {
  const client = await connect();
  try {
    await call(client, 'delete_my_data', { confirmed: true });
    const blender = await line(client, 'blender');
    const calls: Array<[string, Record<string, unknown>]> = [
      ['create_return', { orderId: blender.orderId, lineItemId: blender.lineItemId, reason: 'dead' }],
      ['file_warranty_claim', { orderId: blender.orderId, lineItemId: blender.lineItemId, symptom: 'dead' }],
      ['order_part', { orderId: blender.orderId, lineItemId: blender.lineItemId }],
      ['delete_my_data', {}],
    ];
    for (const [name, args] of calls) {
      for (const confirmed of [undefined, false]) {
        const r = await call(client, name, confirmed === undefined ? args : { ...args, confirmed });
        assert.notEqual(r.isError, true, `${name}: ${text(r)}`);
        assert.match(text(r), /confirm/i, name);
      }
    }
    const r = await call(client, 'delete_my_data', { confirmed: true });
    // Only the SESSION item written by identify_product may exist; no CLAIM, RETURN or PART records.
    assert.ok(sc<{ deleted: number }>(r).deleted <= 1, text(r));
  } finally { await client.close(); }
});

test('T3.2 + T3.3 file_warranty_claim confirmed creates one claim; the same call again returns the same reference', { skip }, async () => {
  const client = await connect();
  try {
    const blender = await line(client, 'blender');
    const args = { orderId: blender.orderId, lineItemId: blender.lineItemId, symptom: "won't turn on", confirmed: true };
    const first = await call(client, 'file_warranty_claim', args);
    assert.notEqual(first.isError, true, text(first));
    const ref = sc<{ claimRef: string; created: boolean }>(first);
    assert.match(ref.claimRef, /^CLM-\d{6}$/);
    assert.equal(ref.created, true);
    assert.ok(text(first).includes(ref.claimRef), 'the reference is spoken');

    const again = await call(client, 'file_warranty_claim', args);
    const ref2 = sc<{ claimRef: string; created: boolean }>(again);
    assert.equal(ref2.claimRef, ref.claimRef);
    assert.equal(ref2.created, false);
  } finally { await client.close(); }
});

test('T3.4 + T3.5 create_return on the in-window order returns an ID, QR and pickup; repeating it files nothing new', { skip }, async () => {
  const client = await connect();
  try {
    const hp = await line(client, 'headphones');
    const args = { orderId: hp.orderId, lineItemId: hp.lineItemId, reason: 'no sound on one side', confirmed: true };
    const first = await call(client, 'create_return', args);
    assert.notEqual(first.isError, true, text(first));
    const r1 = sc<{ returnId: string; qrPngDataUrl: string; pickup: { date: string }; created: boolean }>(first);
    assert.match(r1.returnId, /^gid:\/\/shopify\/Return\//);
    assert.match(r1.qrPngDataUrl, /^data:image\/png;base64,/);
    assert.match(r1.pickup.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(r1.created, true);

    const again = await call(client, 'create_return', args);
    const r2 = sc<{ returnId: string; created: boolean }>(again);
    assert.equal(r2.returnId, r1.returnId);
    assert.equal(r2.created, false);
  } finally { await client.close(); }
});

test('T3.6 create_return on the out-of-window order is refused with the reason and the next best option', { skip }, async () => {
  const client = await connect();
  try {
    const blender = await line(client, 'blender');
    const r = await call(client, 'create_return', { orderId: blender.orderId, lineItemId: blender.lineItemId, reason: 'dead', confirmed: true });
    assert.notEqual(r.isError, true, text(r));
    assert.equal(sc<{ refused: boolean }>(r).refused, true);
    assert.match(text(r), /past the 30-day return window/);
    assert.match(text(r), /warranty/);
  } finally { await client.close(); }
});

test('T3.7 order_part confirmed creates a draft order for the lid seal', { skip }, async () => {
  const client = await connect();
  try {
    const kettle = await line(client, 'kettle');
    await call(client, 'troubleshoot', { productId: kettle.productId, symptom: "lid won't close" });
    const r = await call(client, 'order_part', { orderId: kettle.orderId, lineItemId: kettle.lineItemId, confirmed: true });
    assert.notEqual(r.isError, true, text(r));
    const p = sc<{ draftOrderId: string; sku: string; price: number; created: boolean }>(r);
    assert.match(p.draftOrderId, /^gid:\/\/shopify\/DraftOrder\//);
    assert.equal(p.sku, 'SBK1-LIDSEAL');
    assert.equal(p.price, 6);
    const again = await call(client, 'order_part', { orderId: kettle.orderId, lineItemId: kettle.lineItemId, confirmed: true });
    assert.equal(sc<{ draftOrderId: string }>(again).draftOrderId, p.draftOrderId);
  } finally { await client.close(); }
});

test('T3.8 report_outcome worked:true resolves; worked:false returns the same ranked options as get_resolution_options', { skip }, async () => {
  const client = await connect();
  try {
    const blender = await line(client, 'blender');
    await call(client, 'troubleshoot', { productId: blender.productId, symptom: "won't turn on" });
    const ok = await call(client, 'report_outcome', { productId: blender.productId, worked: true });
    assert.equal(sc<{ resolved: boolean }>(ok).resolved, true);

    const bad = await call(client, 'report_outcome', { productId: blender.productId, worked: false, orderId: blender.orderId, lineItemId: blender.lineItemId });
    const direct = await call(client, 'get_resolution_options', { orderId: blender.orderId, lineItemId: blender.lineItemId, symptom: "won't turn on" });
    const actions = (r: Result) => sc<{ options: Array<{ action: string; eligible: boolean }> }>(r).options.map(o => `${o.action}:${o.eligible}`);
    assert.deepEqual(actions(bad), actions(direct));
    assert.equal(actions(bad)[0], 'warranty_claim:true');
  } finally { await client.close(); }
});
