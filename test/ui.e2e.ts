// Phase 3 card tests (T3.9 to T3.12) through POST /mcp plus the built files. Needs `npm run build` and a running server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const VIEWS = ['ui://concierge/steps.html', 'ui://concierge/options.html', 'ui://concierge/confirmation.html'];
const MIME = 'text/html;profile=mcp-app';

async function connect() {
  const client = new Client({ name: 'e2e-ui', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)));
  return client;
}

test('T3.9 resources/list contains the three ui://concierge views', async () => {
  const client = await connect();
  try {
    const { resources } = await client.listResources();
    const uris = resources.map(r => r.uri);
    for (const v of VIEWS) assert.ok(uris.includes(v), `${v} missing from ${uris.join(', ')}`);
  } finally { await client.close(); }
});

test('T3.10 resources/read returns HTML with the MCP Apps mime type', async () => {
  const client = await connect();
  try {
    for (const uri of VIEWS) {
      const r = await client.readResource({ uri });
      const c = r.contents[0] as { mimeType?: string; text?: string };
      assert.equal(c.mimeType, MIME, uri);
      assert.match(c.text ?? '', /<!doctype html>/i, uri);
      assert.match(c.text ?? '', /<script/i, `${uri} has no inlined script`);
    }
  } finally { await client.close(); }
});

test('T3.11 the six card tools carry _meta.ui.resourceUri pointing at an existing resource', async () => {
  const client = await connect();
  try {
    const { tools } = await client.listTools();
    const expected: Record<string, string> = {
      troubleshoot: VIEWS[0], report_outcome: VIEWS[1], get_resolution_options: VIEWS[1],
      create_return: VIEWS[2], file_warranty_claim: VIEWS[2], order_part: VIEWS[2],
    };
    for (const [name, uri] of Object.entries(expected)) {
      const t = tools.find(x => x.name === name);
      assert.ok(t, `${name} not listed`);
      const meta = t._meta as { ui?: { resourceUri?: string } } | undefined;
      assert.equal(meta?.ui?.resourceUri, uri, name);
    }
  } finally { await client.close(); }
});

test('T3.12 each built card is one HTML file with no http(s) script, style or image loads', () => {
  for (const view of ['steps', 'options', 'confirmation']) {
    const path = `dist/ui/${view}.html`;
    assert.ok(existsSync(path), `${path} missing: run npm run build`);
    const html = readFileSync(path, 'utf8');
    assert.doesNotMatch(html, /<(script|link|img)[^>]+(src|href)="https?:\/\//i, `${view} loads something external`);
    assert.doesNotMatch(html, /@import\s+url\(\s*["']?https?:/i);
    assert.match(html, /<script[^>]*>[\s\S]{200,}<\/script>/, `${view} has no inlined script`);
  }
});
