import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { demoCustomer } from '../identity.ts';
import { getSession, putSession } from '../db.ts';
import { optionsForLine } from './get_resolution_options.ts';
import { runTool } from '../log.ts';
import { uiMeta } from '../ui.ts';

export function registerReportOutcome(server: McpServer) {
  server.registerTool(
    'report_outcome',
    {
      title: 'Report whether the fix worked',
      description: 'Record whether the troubleshooting steps fixed the product; when they did not, this also returns the ranked resolution options in the same call. Use after troubleshoot, not before.',
      inputSchema: z.object({
        productId: z.string().describe('productId from identify_product'),
        worked: z.boolean().describe('true if the customer says the steps fixed it'),
        orderId: z.string().optional().describe('orderId from identify_product, if known'),
        lineItemId: z.string().optional().describe('lineItemId from identify_product, if known'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      _meta: uiMeta('options'),
    },
    async ({ productId, worked, orderId, lineItemId }) => runTool('report_outcome', { productId, orderId }, async () => {
      const { hash } = demoCustomer();
      const session = await getSession(hash);
      await putSession(hash, { lastProductId: productId, lastOutcome: worked ? 'worked' : 'still-broken' });
      if (worked) {
        return { text: "Great, I'm glad that fixed it. I've noted it on your order.", structuredContent: { resolved: true, productId } };
      }
      const oid = orderId ?? session?.lastOrderId;
      const lid = lineItemId ?? session?.lastLineItemId;
      if (!oid || !lid) {
        return { text: "Sorry that didn't fix it. Let me find the order first so I can check your options.", structuredContent: { resolved: false, productId, needsOrder: true } };
      }
      const r = await optionsForLine(oid, lid, session?.lastSymptomText);
      if (!r.ok) return { text: r.text, isError: true };
      const { text, ok: _ok, ...rest } = r;
      return { text: `Sorry that didn't fix it. ${text}`, structuredContent: { resolved: false, orderId: oid, lineItemId: lid, ...rest } };
    }),
  );
}
