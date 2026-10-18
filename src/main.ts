import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { buildServer } from './server.ts';
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

app.use('/sim', simRouter());

app.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({ event: 'listening', port: PORT, sha: process.env.GIT_SHA ?? 'dev' }));
});
