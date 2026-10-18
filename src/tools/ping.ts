import type { McpServer } from '@modelcontextprotocol/server';
import { logCall } from '../log.ts';

// Health probe through the MCP path. Phase 1 tests depend on it; keep it.
export function registerPing(server: McpServer) {
  server.registerTool(
    'ping',
    {
      description: 'Check that the concierge is online. Do not use it for any customer request.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const t0 = Date.now();
      logCall('ping', t0, true);
      return { content: [{ type: 'text', text: 'concierge online' }], structuredContent: { ok: true } };
    },
  );
}
