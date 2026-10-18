import { z } from 'zod';
import QRCode from 'qrcode';
import type { McpServer } from '@modelcontextprotocol/server';
import { shopify } from '../shopify.ts';
import { speakDate } from '../products.ts';
import { demoCustomer, idemKey } from '../identity.ts';
import { getRecord, putOnce } from '../db.ts';
import { optionsForLine } from './get_resolution_options.ts';
import { CONFIRM_TEXT } from './file_warranty_claim.ts';
import { runTool } from '../log.ts';
import { uiMeta } from '../ui.ts';

export type ReturnRecord = {
  type: 'RETURN'; returnId: string; returnName: string; orderId: string; lineItemId: string; productId: string; productTitle: string;
  reason: string; pickup: { date: string; window: string }; qrPngDataUrl: string; status: string;
};

/** Two days out, skipping weekends. ponytail: no carrier integration; the pickup is simulated. */
export function pickupDate(from = new Date()): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + 2);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function registerCreateReturn(server: McpServer) {
  server.registerTool(
    'create_return',
    {
      title: 'Start a return',
      description: 'Start a return for one order line in the store and book a pickup, only after the customer has said yes. Do not use outside the return window; get_resolution_options says whether a return is eligible.',
      inputSchema: z.object({
        orderId: z.string(),
        lineItemId: z.string(),
        reason: z.string().min(1).describe("Why it is coming back, in the customer's words"),
        confirmed: z.boolean().optional().describe('Must be true. Set it only after the customer explicitly agreed to the return.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      _meta: uiMeta('confirmation'),
    },
    async ({ orderId, lineItemId, reason, confirmed }) => runTool('create_return', { orderId }, async () => {
      // The confirmation check is the first statement, before any read or write (FR-15).
      if (confirmed !== true) return { text: CONFIRM_TEXT, structuredContent: { needsConfirmation: true, action: 'return' } };

      const r = await optionsForLine(orderId, lineItemId, reason);
      if (!r.ok) return { text: r.text, isError: true };
      const opt = r.options.find(o => o.action === 'return')!;
      if (!opt.eligible) {
        // Refuse with the reason and the next best option (FR-17). describeOptions already leads with the missed window.
        return { text: `I can't start a return. ${r.text}`, structuredContent: { refused: true, reason: opt.reason, options: r.options } };
      }

      const { hash } = demoCustomer();
      const idem = idemKey(orderId, lineItemId, 'return');
      const done = (rec: ReturnRecord, created: boolean) => ({
        text: created
          ? `Your return for the ${rec.productTitle} is booked. A courier will collect it on ${speakDate(rec.pickup.date)} between 9 and 5; show the QR code on screen or quote return ${rec.returnName}.`
          : `That return is already booked as ${rec.returnName}, with pickup on ${speakDate(rec.pickup.date)}, so nothing new was created.`,
        structuredContent: { returnId: rec.returnId, returnName: rec.returnName, qrPngDataUrl: rec.qrPngDataUrl, pickup: rec.pickup, orderId, lineItemId, productId: rec.productId, productTitle: rec.productTitle, created },
      });

      // ponytail: check-then-act plus a conditional put. Sequential repeats are safe; two simultaneous "yes" calls are not a voice scenario.
      const existing = await getRecord<ReturnRecord>(hash, `RETURN#${idem}`);
      if (existing) return done(existing, false);

      const line = (await shopify.getReturnableFulfillments(orderId)).find(l => l.lineItemId === lineItemId);
      if (!line) {
        return { text: "That item isn't marked as delivered, or was already returned, so I can't start a return; the merchant can help directly.", structuredContent: { refused: true, reason: 'not returnable' } };
      }
      const { returnId, name } = await shopify.createReturn(orderId, line.fulfillmentLineItemId, reason);
      const record: ReturnRecord = {
        type: 'RETURN', returnId, returnName: name, orderId, lineItemId, productId: r.productId, productTitle: r.productTitle,
        reason: reason.slice(0, 200), pickup: { date: pickupDate(), window: '9am to 5pm' },
        qrPngDataUrl: await QRCode.toDataURL(`${returnId}|${name}`, { margin: 1, width: 240 }), status: 'open',
      };
      const { created, record: saved } = await putOnce(hash, `RETURN#${idem}`, record as unknown as Record<string, unknown>);
      return done(saved as unknown as ReturnRecord, created);
    }),
  );
}
