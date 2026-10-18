// T4.5 and T4.6: delete_my_data needs confirmation, then removes every item for the customer; DELETE /data does the same over HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const READY = !!process.env.SHOPIFY_STORE && !!process.env.TABLE_NAME && !!process.env.DEMO_CUSTOMER_EMAIL;
const skip = !READY && 'needs .env with SHOPIFY_STORE, TABLE_NAME and DEMO_CUSTOMER_EMAIL';
const hash = () => createHash('sha256').update(process.env.DEMO_CUSTOMER_EMAIL!.trim().toLowerCase()).digest('hex').slice(0, 16);

type Result = { content: Array<{ type: string; text?: string }>; structuredContent?: Record<string, unknown>; isError?: boolean };

async function connect() {
  const client = new Client({ name: 'e2e-privacy', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)));
  return client;
}
const call = async (client: Client, name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as Result;

test('T4.5 delete_my_data without confirmed deletes nothing; with confirmed it deletes and a second call finds nothing', { skip }, async () => {
  const client = await connect();
  try {
    await call(client, 'identify_product', { query: 'blender' }); // writes the SESSION item
    const ask = await call(client, 'delete_my_data', {});
    assert.notEqual(ask.isError, true);
    assert.match(ask.content[0].text ?? '', /confirm/i);
    const first = await call(client, 'delete_my_data', { confirmed: true });
    assert.ok((first.structuredContent as { deleted: number }).deleted > 0, first.content[0].text);
    const second = await call(client, 'delete_my_data', { confirmed: true });
    assert.equal((second.structuredContent as { deleted: number }).deleted, 0);
  } finally { await client.close(); }
});

test('T4.6 DELETE /data?customer=<hash> deletes over HTTP; an unknown customer is 404', { skip }, async () => {
  const client = await connect();
  try {
    await call(client, 'identify_product', { query: 'blender' });
    const r = await fetch(`${BASE}/data?customer=${hash()}`, { method: 'DELETE' });
    assert.equal(r.status, 200);
    assert.ok(((await r.json()) as { deleted: number }).deleted > 0);
    const again = await fetch(`${BASE}/data?customer=${hash()}`, { method: 'DELETE' });
    assert.equal(((await again.json()) as { deleted: number }).deleted, 0);
  } finally { await client.close(); }
  const bad = await fetch(`${BASE}/data?customer=nobody`, { method: 'DELETE' });
  assert.equal(bad.status, 404);
});
