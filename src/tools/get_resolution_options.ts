import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { shopify } from '../shopify.ts';
import { products, matchSymptom, productIdForLineItem } from '../products.ts';
import { demoCustomer } from '../identity.ts';
import { getSession } from '../db.ts';
import { resolve, describeOptions, type Option } from '../policy.ts';
import { runTool } from '../log.ts';

export type LineOptions =
  | { ok: true; options: Option[]; productId: string; productTitle: string; symptomKey?: string; purchaseDate: string; text: string }
  | { ok: false; text: string };

/** Shared by get_resolution_options and report_outcome: options for one order line, computed by the policy. */
export async function optionsForLine(orderId: string, lineItemId: string, symptom?: string): Promise<LineOptions> {
  const order = await shopify.getOrder(orderId);
  if (!order) return { ok: false, text: "I can't find that order in the store." };
  const li = order.lineItems.find(l => l.lineItemId === lineItemId) ?? order.lineItems[0];
  const productId = li && productIdForLineItem(li);
  if (!productId) return { ok: false, text: "I can't match that item to a product I know." };
  const p = products[productId];
  const session = await getSession(demoCustomer().hash);
  const symptomKey = (symptom && matchSymptom(productId, symptom)) || session?.lastSymptomKey;
  const { options } = resolve({
    purchaseDate: order.processedAt,
    today: new Date(),
    price: p.price,
    returnWindowDays: p.returnWindowDays,
    warrantyMonths: p.warrantyMonths,
    parts: p.parts,
    symptomKey,
  });
  return { ok: true, options, productId, productTitle: p.title, symptomKey, purchaseDate: order.processedAt.slice(0, 10), text: describeOptions(options) };
}

export function registerGetResolutionOptions(server: McpServer) {
  server.registerTool(
    'get_resolution_options',
    {
      title: 'Resolution options',
      description: 'Rank the ways to resolve a product problem for one order line (return, warranty claim, replacement part, or contact the merchant) with a reason for each. Use after troubleshooting has failed; it files nothing.',
      inputSchema: z.object({
        orderId: z.string().describe('orderId from identify_product'),
        lineItemId: z.string().describe('lineItemId from identify_product'),
        symptom: z.string().optional().describe("The problem in the customer's words, if known"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ orderId, lineItemId, symptom }) => runTool('get_resolution_options', { orderId }, async () => {
      const r = await optionsForLine(orderId, lineItemId, symptom);
      if (!r.ok) return { text: r.text, isError: true };
      const { text, ok: _ok, ...rest } = r;
      return { text, structuredContent: { orderId, lineItemId, ...rest } };
    }),
  );
}
