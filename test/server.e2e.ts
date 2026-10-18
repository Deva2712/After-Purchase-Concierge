import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const MCP = `${BASE}/mcp`;

async function connect() {
  const client = new Client({ name: 'e2e', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP)));
  return client;
}

test('T1.1 GET /healthz returns 200 and a git SHA', async () => {
  const r = await fetch(`${BASE}/healthz`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.sha, 'string');
  assert.ok(body.sha.length > 0);
});

test('T1.2 initialize negotiates protocol 2025-11-25 or later', async () => {
  const client = await connect();
  try {
    const v = client.getNegotiatedProtocolVersion();
    assert.ok(v && v >= '2025-11-25', `negotiated ${v}`);
  } finally { await client.close(); }
});

test('T1.3 tools/list has ping and ping answers "concierge online"', async () => {
  const client = await connect();
  try {
    const { tools } = await client.listTools();
    assert.ok(tools.some(t => t.name === 'ping'));
    const r = await client.callTool({ name: 'ping', arguments: {} });
    const first = (r.content as Array<{ type: string; text?: string }>)[0];
    assert.equal(first.type, 'text');
    assert.equal(first.text, 'concierge online');
  } finally { await client.close(); }
});

test('T1.4 two raw calls with no session header both succeed (stateless)', async () => {
  for (let i = 0; i < 2; i++) {
    const r = await fetch(MCP, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: i + 1, method: 'tools/list', params: {} }),
    });
    assert.equal(r.status, 200, `call ${i + 1}: ${r.status} ${await r.text()}`);
    assert.equal(r.headers.get('mcp-session-id'), null);
  }
});
