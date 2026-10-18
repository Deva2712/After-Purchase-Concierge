// T4.2: 95th percentile round trip of each read tool over 20 calls, against the budget in docs/ARCHITECTURE.md section 10.
// Measured from the client, so network time is included; run against BASE_URL=https://<service-url> after a deploy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const READY = !!process.env.SHOPIFY_STORE && !!process.env.TABLE_NAME;
const skip = !READY && 'needs .env with SHOPIFY_STORE and TABLE_NAME, a seeded store and a precomputed cache';
const N = 20;
const remote = /^https:/.test(BASE);
// Budgets are server-side targets; allow 150 ms of network when the target is a remote HTTPS URL.
const budget = (ms: number) => ms + (remote ? 150 : 0);

const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(0.95 * xs.length) - 1)];

async function timeCalls(name: string, args: Record<string, unknown>): Promise<number[]> {
  const client = new Client({ name: 'e2e-latency', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)));
  try {
    const times: number[] = [];
    await client.callTool({ name, arguments: args }); // warm-up
    for (let i = 0; i < N; i++) {
      const t0 = performance.now();
      const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Array<{ text?: string }> };
      assert.notEqual(r.isError, true, r.content[0]?.text);
      times.push(performance.now() - t0);
    }
    return times;
  } finally { await client.close(); }
}

test('T4.2 troubleshoot from the cache: p95 under 100 ms', { skip }, async () => {
  const t = await timeCalls('troubleshoot', { productId: 'problend900', symptom: "won't turn on" });
  console.log(`troubleshoot p95 ${p95(t).toFixed(0)} ms`);
  assert.ok(p95(t) < budget(100), `p95 ${p95(t).toFixed(0)} ms`);
});

test('T4.2 identify_product (cached orders): p95 under 400 ms', { skip }, async () => {
  const t = await timeCalls('identify_product', { query: 'blender' });
  console.log(`identify_product p95 ${p95(t).toFixed(0)} ms`);
  assert.ok(p95(t) < budget(400), `p95 ${p95(t).toFixed(0)} ms`);
});

test('T4.2 get_resolution_options: p95 under 500 ms (one Shopify read + policy)', { skip }, async () => {
  const idClient = new Client({ name: 'e2e-latency', version: '0.0.0' });
  await idClient.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)));
  const r = (await idClient.callTool({ name: 'identify_product', arguments: { query: 'blender' } })) as { structuredContent: { candidates: Array<{ orderId: string; lineItemId: string }> } };
  await idClient.close();
  const [c] = r.structuredContent.candidates;
  const t = await timeCalls('get_resolution_options', { orderId: c.orderId, lineItemId: c.lineItemId, symptom: "won't turn on" });
  console.log(`get_resolution_options p95 ${p95(t).toFixed(0)} ms`);
  assert.ok(p95(t) < budget(500), `p95 ${p95(t).toFixed(0)} ms`);
});
