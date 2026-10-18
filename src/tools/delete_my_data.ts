import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { demoCustomer } from '../identity.ts';
import { deleteCustomer } from '../db.ts';
import { CONFIRM_TEXT } from './file_warranty_claim.ts';
import { runTool } from '../log.ts';

export function registerDeleteMyData(server: McpServer) {
  server.registerTool(
    'delete_my_data',
    {
      title: 'Delete my concierge data',
      description: "Delete everything the concierge has stored about the customer (session, claims, returns and part orders it filed), only after the customer has said yes. Do not use for cancelling an order or a return.",
      inputSchema: z.object({
        confirmed: z.boolean().optional().describe('Must be true. Set it only after the customer explicitly agreed to delete their data.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ confirmed }) => runTool('delete_my_data', {}, async () => {
      // The confirmation check is the first statement, before any read or write (FR-15).
      if (confirmed !== true) return { text: CONFIRM_TEXT, structuredContent: { needsConfirmation: true, action: 'delete_my_data' } };
      const deleted = await deleteCustomer(demoCustomer().hash);
      const text = deleted === 0
        ? 'There was nothing stored about you, so nothing was deleted.'
        : `Done. I deleted ${deleted} ${deleted === 1 ? 'record' : 'records'} from the concierge; anything already filed with the merchant stays with the merchant.`;
      return { text, structuredContent: { deleted } };
    }),
  );
}
