// Merchant policy and matching helpers over config/products.json. Pure; unit tested in test/products.test.ts.
import catalog from '../config/products.json' with { type: 'json' };
import type { Part } from './policy.ts';

export type Symptom = { aliases: string[]; severity: 'low' | 'medium' | 'high' };
export type Product = {
  title: string;
  aliases: string[];
  price: number;
  returnWindowDays: number;
  warrantyMonths: number;
  manual: string;
  symptoms: Record<string, Symptom>;
  parts: Part[];
};

// ponytail: policy lives in a JSON file; move to Shopify metafields when there is more than one merchant.
export const products: Record<string, Product> = catalog as Record<string, Product>;

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[’'`]/g, '').replace(/[^a-z0-9#]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function aliasHits(text: string, aliases: string[]): boolean {
  const t = normalize(text);
  return aliases.some(a => {
    const n = normalize(a);
    return n.length >= 3 && (` ${t} `.includes(` ${n} `) || (t.length >= 3 && n.includes(t)));
  });
}

/** Product IDs whose title or aliases match the customer's words. */
export function matchProducts(query: string): string[] {
  return Object.entries(products).filter(([, p]) => aliasHits(query, [p.title, ...p.aliases])).map(([id]) => id);
}

/** Known symptom key for a product whose alias appears in the text; longest alias wins. */
export function matchSymptom(productId: string, text: string): string | undefined {
  const p = products[productId];
  if (!p) return undefined;
  const t = ` ${normalize(text)} `;
  let best: { key: string; len: number } | undefined;
  for (const [key, s] of Object.entries(p.symptoms)) {
    for (const a of [key.replace(/-/g, ' '), ...s.aliases]) {
      const n = normalize(a);
      if (n && (t.includes(` ${n} `) || normalize(text) === n) && (!best || n.length > best.len)) best = { key, len: n.length };
    }
  }
  return best?.key;
}

/** Map a Shopify line item to a productId: handle first (the seed sets handle = productId), then title. */
export function productIdForLineItem(li: { productHandle?: string; title: string }): string | undefined {
  if (li.productHandle && products[li.productHandle]) return li.productHandle;
  const t = normalize(li.title);
  return Object.entries(products).find(([, p]) => t.includes(normalize(p.title)))?.[0];
}

export function speakDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}
