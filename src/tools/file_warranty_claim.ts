import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { demoCustomer, idemKey } from '../identity.ts';
import { putOnce } from '../db.ts';
import { optionsForLine } from './get_resolution_options.ts';
import { runTool } from '../log.ts';
import { uiMeta } from '../ui.ts';

export const CONFIRM_TEXT = 'Please confirm with the customer before I do this.';
export const NEXT_STEP = 'The merchant replies within 2 business days with a repair or replacement decision.';

/** Short, speakable, deterministic reference derived from the idempotency key: the same claim always has the same number. */
export const claimRefFor = (idem: string) => `CLM-${String(parseInt(idem.slice(0, 8), 16) % 1_000_000).padStart(6, '0')}`;

export type ClaimRecord = {
  type: 'CLAIM'; claimRef: string; orderId: string; lineItemId: string; productId: string; symptom: string; status: string; nextStep: string;
};

export function registerFileWarrantyClaim(server: McpServer) {
  server.registerTool(
    'file_warranty_claim',
    {
      title: 'File a warranty claim',
      description: 'File a warranty claim with the merchant for one order line, only after the customer has said yes. Do not use when the return option is eligible or the warranty has ended; get_resolution_options says which.',
      inputSchema: z.object({
        orderId: z.string(),
        lineItemId: z.string(),
        symptom: z.string().min(1).describe("The problem in the customer's words"),
        confirmed: z.boolean().optional().describe('Must be true. Set it only after the customer explicitly agreed to file the claim.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      _meta: uiMeta('confirmation'),
    },
    async ({ orderId, lineItemId, symptom, confirmed }) => runTool('file_warranty_claim', { orderId }, async () => {
      // The confirmation check is the first statement, before any read or write (FR-15).
      if (confirmed !== true) return { text: CONFIRM_TEXT, structuredContent: { needsConfirmation: true, action: 'warranty_claim' } };

      const r = await optionsForLine(orderId, lineItemId, symptom);
      if (!r.ok) return { text: r.text, isError: true };
      const opt = r.options.find(o => o.action === 'warranty_claim')!;
      if (!opt.eligible) {
        // Refuse with the reason and the next best option (FR-17).
        return { text: `I can't file a warranty claim: ${opt.reason} ${r.text}`, structuredContent: { refused: true, reason: opt.reason, options: r.options } };
      }

      const { hash } = demoCustomer();
      const idem = idemKey(orderId, lineItemId, 'warranty_claim');
      const record: ClaimRecord = {
        type: 'CLAIM', claimRef: claimRefFor(idem), orderId, lineItemId, productId: r.productId, symptom: symptom.slice(0, 200),
        status: 'submitted', nextStep: NEXT_STEP,
      };
      const { created, record: saved } = await putOnce(hash, `CLAIM#${idem}`, record as unknown as Record<string, unknown>);
      const c = saved as unknown as ClaimRecord;
      const text = created
        ? `Done. Your warranty claim for the ${r.productTitle} is filed under reference ${c.claimRef}. ${c.nextStep}`
        : `That claim is already filed under reference ${c.claimRef}, so nothing new was created. ${c.nextStep}`;
      return { text, structuredContent: { claimRef: c.claimRef, nextStep: c.nextStep, status: c.status, orderId, lineItemId, productId: r.productId, productTitle: r.productTitle, created } };
    }),
  );
}
