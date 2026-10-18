import { McpServer } from '@modelcontextprotocol/server';
import { registerPing } from './tools/ping.ts';

export const SERVER_INFO = { name: 'after-purchase-concierge', version: '0.1.0' };

// A fresh server per request: the transport is stateless (docs/ARCHITECTURE.md section 13).
export function buildServer(): McpServer {
  const server = new McpServer(SERVER_INFO);
  registerPing(server);
  return server;
}
