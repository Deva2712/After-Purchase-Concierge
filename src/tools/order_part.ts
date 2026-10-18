import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { shopify } from '../shopify.ts';
import { products } from '../products.ts';
import { demoCustomer, idemKey } from '../identity.ts';
import { getRecord, putOnce } from '../db.ts';
import { optionsForLine } from './get_resolution_options.ts';
import { CONFIRM_TEXT } from './file_warranty_claim.ts';
import { runTool } from '../log.ts';
import { uiMeta } from '../ui.ts';

export type PartRecord = {
  type: 'PART'; draftOrderId: string; draftName: string; orderId: string; lineItemId: string; productId: string; productTitle: string;
  part: string; sku: string; price: number; eta: string;
};
const ETA = '3 to 5 days';

export function registerOrderPart(server: McpServer) {
  server.registerTool(
    'order_part',
    {
      title: 'Order a replacement part',
      description: 'Order the replacement part that fixes the problem, only after the customer has said yes. Do not use unless get_resolution_options listed an eligible part for this order line.',
      inputSchema: z.object({
        orderId: z.string(),
        lineItemId: z.string(),
        partSku: z.string().optional().describe('sku of the part from get_resolution_options; defaults to the eligible part'),
        confirmed: z.boolean().optional().describe('Must be true. Set it only after the customer explicitly agreed to order the part.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      _meta: uiMeta('confirmation'),
    },
    async ({ orderId, lineItemId, partSku, confirmed }) => runTool('order_part', { orderId }, async () => {
      // The confirmation check is the first statement, before any read or write (FR-15).
      if (confirmed !== true) return { text: CONFIRM_TEXT, structuredContent: { needsConfirmation: true, action: 'order_part' } };

      const r = await optionsForLine(orderId, lineItemId);
      if (!r.ok) return { text: r.text, isError: true };
      const opt = r.options.find(o => o.action === 'order_part')!;
      const sku = partSku ?? (opt.detail?.sku as string | undefined);
      const part = products[r.productId].parts.find(p => p.sku === sku);
      if (!opt.eligible || !part || part.sku !== opt.detail?.sku) {
        return { text: `I can't order a part for this. ${opt.eligible ? 'That part does not fit this problem.' : opt.reason} ${r.text}`, structuredContent: { refused: true, reason: opt.reason, options: r.options } };
      }

      const { email, hash } = demoCustomer();
      const idem = idemKey(orderId, lineItemId, `order_part:${part.sku}`);
      const done = (rec: PartRecord, created: boolean) => ({
        text: created
          ? `I've ordered the ${rec.part} for $${rec.price}; it arrives in ${rec.eta} and you'll get an email to complete the payment. The order reference is ${rec.draftName}.`
          : `That ${rec.part} is already on order as ${rec.draftName}, so nothing new was created.`,
        structuredContent: { draftOrderId: rec.draftOrderId, draftName: rec.draftName, part: rec.part, sku: rec.sku, price: rec.price, eta: rec.eta, orderId, lineItemId, productId: rec.productId, productTitle: rec.productTitle, created },
      });

      const existing = await getRecord<PartRecord>(hash, `PART#${idem}`);
      if (existing) return done(existing, false);

      const variant = await shopify.findVariantBySku(part.sku);
      if (!variant) return { text: "That part isn't in the store's catalogue yet, so the merchant will have to add it first.", isError: true };
      const { draftOrderId, name } = await shopify.createDraftOrder(variant.variantId, email);
      const record: PartRecord = {
        type: 'PART', draftOrderId, draftName: name, orderId, lineItemId, productId: r.productId, productTitle: r.productTitle,
        part: part.name, sku: part.sku, price: part.price, eta: ETA,
      };
      const { created, record: saved } = await putOnce(hash, `PART#${idem}`, record as unknown as Record<string, unknown>);
      return done(saved as unknown as PartRecord, created);
    }),
  );
}
