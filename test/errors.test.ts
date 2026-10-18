// T4.3 and T4.4: when Shopify fails, a tool answers with one speakable sentence and isError, never a stack trace,
// and the server logs one JSON line per call with no PII. Runs in-process over InMemoryTransport with a fake fetch.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { buildServer } from '../src/server.ts';

const realFetch = globalThis.fetch;
const logs: string[] = [];
const realLog = console.log;
const realError = console.error;

type Result = { content: Array<{ type: string; text?: string }>; isError?: boolean };

async function call(name: string, args: Record<string, unknown>): Promise<Result> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildServer();
  const client = new Client({ name: 'unit', version: '0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return (await client.callTool({ name, arguments: args })) as Result;
  } finally {
    await client.close();
    await server.close();
  }
}

const token = () => Response.json({ access_token: 't', expires_in: 86_400 });

before(() => {
  process.env.DEMO_CUSTOMER_EMAIL = 'demo.customer@example.com';
  process.env.SHOPIFY_STORE = 'unit-test';
  process.env.SHOPIFY_CLIENT_ID = 'id';
  process.env.SHOPIFY_CLIENT_SECRET = 'secret';
  console.log = (line: unknown) => { logs.push(String(line)); };
  console.error = (line: unknown) => { logs.push(String(line)); };
});
after(() => { globalThis.fetch = realFetch; console.log = realLog; console.error = realError; });
beforeEach(() => { logs.length = 0; });

const speakable = (r: Result) => {
  const text = r.content[0]?.text ?? '';
  assert.equal(r.isError, true);
  assert.ok(text.length > 0 && text.length < 160, text);
  assert.doesNotMatch(text, /\bat \w+|Error:|https?:\/\/|\.ts:\d+|stack/i, text);
  assert.equal(text.split(/[.!?](\s|$)/).filter(s => s.trim()).length, 1, `more than one sentence: ${text}`);
};

test('T4.3 Shopify returns 500: one speakable sentence with isError, no stack trace or URL', async () => {
  globalThis.fetch = (async (url: string | URL | Request) => String(url).endsWith('/access_token') ? token() : new Response('boom', { status: 500 })) as typeof fetch;
  speakable(await call('identify_product', { query: 'blender' }));
});

test('T4.3 Shopify times out: same speakable sentence', async () => {
  globalThis.fetch = (async (url: string | URL | Request) => {
    if (String(url).endsWith('/access_token')) return token();
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  }) as typeof fetch;
  speakable(await call('get_resolution_options', { orderId: 'gid://shopify/Order/1', lineItemId: 'gid://shopify/LineItem/1' }));
});

test('T4.4 logs carry { tool, ms, ok } and never an email or @ sign', async () => {
  globalThis.fetch = (async (url: string | URL | Request) => String(url).endsWith('/access_token') ? token() : Response.json({ data: { orders: { nodes: [
    { id: 'gid://shopify/Order/1', name: '#1001', processedAt: '2026-09-16T10:00:00Z', cancelledAt: null, tags: [],
      lineItems: { nodes: [{ id: 'gid://shopify/LineItem/1', title: 'ProBlend 900 Blender', quantity: 1, sku: null, product: { id: 'p', handle: 'problend900' }, variant: null, image: null }] } },
  ] } } })) as typeof fetch;
  await call('ping', {});
  const r = await call('identify_product', { query: 'toaster' }); // no match, so no session write
  assert.notEqual(r.isError, true, r.content[0]?.text);

  const toolLines = logs.filter(l => l.startsWith('{')).map(l => JSON.parse(l) as Record<string, unknown>).filter(l => 'tool' in l && 'ok' in l);
  assert.ok(toolLines.length >= 2, `tool log lines: ${logs.join(' | ')}`);
  for (const l of toolLines) {
    assert.equal(typeof l.tool, 'string');
    assert.equal(typeof l.ms, 'number');
    assert.equal(typeof l.ok, 'boolean');
  }
  for (const l of logs) {
    assert.doesNotMatch(l, /@/, `log line contains an @: ${l}`);
    assert.doesNotMatch(l, /demo\.customer|Demo Customer/i, `log line contains the customer: ${l}`);
  }
});
