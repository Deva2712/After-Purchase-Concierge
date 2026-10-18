import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { buildServer } from './server.ts';
import { demoCustomer } from './identity.ts';
import { deleteCustomer } from './db.ts';
import { simRouter } from '../sim/agent.ts';

try { process.loadEnvFile(); } catch { /* no .env: rely on the process environment (ECS) */ }

const PORT = Number(process.env.PORT ?? 3001);

// ponytail: host '0.0.0.0' turns off the SDK's DNS-rebinding Host check; add allowedHosts once the public URL is known.
const app = createMcpExpressApp({ host: '0.0.0.0' });

// MCP Streamable HTTP, stateless: new server + transport for every request, both closed when the response ends.
app.all('/mcp', async (req, res) => {
  const server = buildServer();
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { void transport.close(); void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, sha: process.env.GIT_SHA ?? 'dev' });
});

// Privacy controls (FR-14): the same deletion as the delete_my_data tool, over HTTP. `customer` is the customer hash.
app.delete('/data', async (req, res) => {
  const { hash } = demoCustomer();
  if (req.query.customer !== hash) { res.status(404).json({ error: 'unknown customer' }); return; }
  try {
    res.json({ deleted: await deleteCustomer(hash) });
  } catch (err) {
    console.error(JSON.stringify({ event: 'delete_error', name: (err as Error).name }));
    res.status(502).json({ error: 'could not delete right now' });
  }
});

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#111}h1{font-size:24px}</style></head><body><h1>${title}</h1>${body}
<p><small>After-Purchase Concierge is a hackathon demonstration with invented products and a single demo customer. The Alexa+ surface is simulated.</small></p></body></html>`;

app.get('/privacy', (_req, res) => {
  res.type('html').send(page('Privacy policy', `
<p>The concierge stores the minimum it needs to help with a purchase: which product you asked about (kept for 24 hours), and any warranty claim, return or part order it filed for you (kept for 30 days). Your customer key is a hash of your email; logs contain IDs and hashes only, never names, emails, addresses or order contents.</p>
<p>Nothing is bought, returned, claimed or deleted without your explicit confirmation. A repeated confirmation never files the same action twice.</p>
<p>Order data comes from the merchant's Shopify store and is read, not copied. Troubleshooting steps come from the merchant's product manuals.</p>
<p>You can delete everything the concierge holds about you at any time by saying "delete my concierge data", or by calling <code>DELETE /data?customer=&lt;your customer key&gt;</code>. Actions already filed with the merchant stay with the merchant.</p>`));
});

app.get('/terms', (_req, res) => {
  res.type('html').send(page('Terms of use', `
<p>This service helps customers of one demonstration store troubleshoot a product and, with their confirmation, start a return, file a warranty claim or order a replacement part. It is provided as is for evaluation during a hackathon and makes no guarantee about the merchant's decisions, pickup times or delivery dates.</p>
<p>Eligibility for returns and warranty claims is computed from the merchant's published policy and the order date. The merchant has the final say.</p>
<p>Do not use the service for anything other than the demonstration products.</p>`));
});

app.use('/sim', simRouter());

app.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({ event: 'listening', port: PORT, sha: process.env.GIT_SHA ?? 'dev' }));
});
