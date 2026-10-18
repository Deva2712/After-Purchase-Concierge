import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { shopify, type Order } from '../shopify.ts';
import { products, matchProducts, productIdForLineItem, normalize, speakDate } from '../products.ts';
import { demoCustomer } from '../identity.ts';
import { putSession } from '../db.ts';
import { runTool } from '../log.ts';

// ponytail: 5-minute in-memory cache of the demo customer's orders; one process, one customer.
let cache: { at: number; orders: Order[] } | undefined;
async function ordersFor(email: string): Promise<Order[]> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.orders;
  const orders = await shopify.findOrdersForCustomer(email);
  cache = { at: Date.now(), orders };
  return orders;
}

export type Candidate = { orderId: string; orderName: string; lineItemId: string; productId: string; title: string; purchaseDate: string; imageUrl?: string };

export function registerIdentifyProduct(server: McpServer) {
  server.registerTool(
    'identify_product',
    {
      title: 'Identify product',
      description: "Find which product the customer bought that they are talking about, from product words or an order number. Use this first, before troubleshoot or any resolution tool; it only knows this store's orders.",
      inputSchema: z.object({ query: z.string().min(1).describe('Product words or order number in the customer\'s own words, e.g. "blender" or "#1001"') }),
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => runTool('identify_product', {}, async () => {
      const { email, hash } = demoCustomer();
      const orders = await ordersFor(email);
      const wanted = new Set(matchProducts(query));
      const nq = normalize(query).replace(/^#/, '');
      const candidates: Candidate[] = [];
      for (const o of orders) {
        for (const li of o.lineItems) {
          const productId = productIdForLineItem(li);
          if (!productId) continue;
          const byOrder = nq.length >= 3 && normalize(o.name).replace(/^#/, '') === nq;
          if (byOrder || wanted.has(productId)) {
            candidates.push({ orderId: o.orderId, orderName: o.name, lineItemId: li.lineItemId, productId, title: products[productId].title, purchaseDate: o.processedAt.slice(0, 10), imageUrl: li.imageUrl });
          }
        }
      }
      if (candidates.length === 1) {
        const c = candidates[0];
        await putSession(hash, { lastProductId: c.productId, lastOrderId: c.orderId, lastLineItemId: c.lineItemId });
      }
      const text = candidates.length === 0
        ? `I couldn't find a ${query.trim()} among your recent orders from this store.`
        : candidates.length === 1
          ? `I found your ${candidates[0].title}, bought on ${speakDate(candidates[0].purchaseDate)}. What is it doing?`
          : `I found ${candidates.length} matching orders: ${candidates.map(c => `${c.title} from ${speakDate(c.purchaseDate)}`).join(', ')}. Which one do you mean?`;
      return { text, structuredContent: { candidates } };
    }),
  );
}
