// Phase 2 tool tests (T2.15 to T2.20) through POST /mcp. Needs a running server with .env filled,
// a seeded store (npm run seed) and a filled steps cache (npm run precompute).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const READY = !!process.env.SHOPIFY_STORE && !!process.env.TABLE_NAME;
const skip = !READY && 'needs .env with SHOPIFY_STORE and TABLE_NAME, a seeded store and a precomputed cache';

type Text = { type: string; text?: string };
type Result = { content: Text[]; structuredContent?: Record<string, unknown>; isError?: boolean };

async function connect() {
  const client = new Client({ name: 'e2e-tools', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)));
  return client;
}
async function call(client: Client, name: string, args: Record<string, unknown>): Promise<Result & { ms: number }> {
  const t0 = Date.now();
  const r = (await client.callTool({ name, arguments: args })) as Result;
  return { ...r, ms: Date.now() - t0 };
}
const text = (r: Result) => r.content.find(c => c.type === 'text')?.text ?? '';

type Candidate = { orderId: string; lineItemId: string; productId: string; purchaseDate: string };
async function identify(client: Client, q: string): Promise<Candidate[]> {
  const r = await call(client, 'identify_product', { query: q });
  assert.equal(r.isError, undefined, text(r));
  return (r.structuredContent as { candidates: Candidate[] }).candidates;
}

test('T2.15 identify_product "blender" returns one candidate with order, line item, product and purchase date', { skip }, async () => {
  const client = await connect();
  try {
    const c = await identify(client, 'blender');
    assert.equal(c.length, 1);
    assert.ok(c[0].orderId && c[0].lineItemId && c[0].purchaseDate);
    assert.equal(c[0].productId, 'problend900');
  } finally { await client.close(); }
});

test('T2.16 identify_product "toaster" returns no candidates and a speakable sentence', { skip }, async () => {
  const client = await connect();
  try {
    const r = await call(client, 'identify_product', { query: 'toaster' });
    assert.deepEqual((r.structuredContent as { candidates: unknown[] }).candidates, []);
    assert.match(text(r), /couldn't find/i);
    assert.doesNotMatch(text(r), /at |Error|stack/);
  } finally { await client.close(); }
});

test('T2.17 troubleshoot with a known symptom returns cached steps with a source, fast', { skip }, async () => {
  const client = await connect();
  try {
    const r = await call(client, 'troubleshoot', { productId: 'problend900', symptom: "it won't turn on" });
    const sc = r.structuredContent as { steps: unknown[]; source: { document: string; page: number }; cached: boolean };
    assert.equal(r.isError, undefined, text(r));
    assert.ok(sc.steps.length >= 1 && sc.steps.length <= 4);
    assert.ok(sc.source.document && sc.source.page > 0);
    assert.equal(sc.cached, true, 'steps should come from the precomputed cache');
    assert.ok(r.ms < 500, `round trip ${r.ms} ms`);
  } finally { await client.close(); }
});

test('T2.18 troubleshoot with an unknown symptom still returns steps from the live Knowledge Base path', { skip }, async () => {
  const client = await connect();
  try {
    const r = await call(client, 'troubleshoot', { productId: 'problend900', symptom: 'it smells like burning' });
    const sc = r.structuredContent as { steps: unknown[]; cached: boolean };
    assert.equal(r.isError, undefined, text(r));
    assert.equal(sc.cached, false);
    assert.ok(sc.steps.length >= 1);
  } finally { await client.close(); }
});

test('T2.19 get_resolution_options ranks warranty, return and part for the three seeded orders', { skip }, async () => {
  const client = await connect();
  try {
    const expected: Array<[string, string, string]> = [
      ['blender', "won't turn on", 'warranty_claim'],
      ['headphones', 'no sound on one side', 'return'],
      ['kettle', "lid won't close", 'order_part'],
    ];
    for (const [q, symptom, top] of expected) {
      const [c] = await identify(client, q);
      const r = await call(client, 'get_resolution_options', { orderId: c.orderId, lineItemId: c.lineItemId, symptom });
      const options = (r.structuredContent as { options: Array<{ action: string; rank: number }> }).options;
      assert.equal(options[0].action, top, `${q}: ${text(r)}`);
      assert.equal(options[0].rank, 1);
    }
  } finally { await client.close(); }
});

test('T2.20 every tool has a short description and returns standalone text plus structuredContent', { skip }, async () => {
  const client = await connect();
  try {
    const { tools } = await client.listTools();
    assert.ok(tools.length >= 4);
    for (const t of tools) {
      const sentences = (t.description ?? '').split(/[.!?](?:\s|$)/).filter(s => s.trim().length > 0);
      assert.ok(sentences.length <= 2, `${t.name} description has ${sentences.length} sentences`);
    }
    const [c] = await identify(client, 'blender');
    const calls: Array<[string, Record<string, unknown>]> = [
      ['ping', {}],
      ['identify_product', { query: 'blender' }],
      ['troubleshoot', { productId: 'problend900', symptom: "won't turn on" }],
      ['get_resolution_options', { orderId: c.orderId, lineItemId: c.lineItemId }],
    ];
    for (const [name, args] of calls) {
      const r = await call(client, name, args);
      assert.ok(text(r).length > 0, `${name} has no text`);
      assert.equal(typeof r.structuredContent, 'object', `${name} has no structuredContent`);
    }
  } finally { await client.close(); }
});
