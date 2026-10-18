// Seed the Shopify development store: products (one per demo product, one per part), the demo customer,
// and three fulfilled orders dated relative to today so each lands on a different policy branch.
// Re-runnable: earlier orders tagged concierge-demo are cancelled first. Run before and during judging.
import { shopify } from '../src/shopify.ts';
import { products } from '../src/products.ts';

try { process.loadEnvFile(); } catch { /* use the environment */ }

const TAG = 'concierge-demo';
const email = process.env.DEMO_CUSTOMER_EMAIL;
if (!email) throw new Error('DEMO_CUSTOMER_EMAIL is not set');

// Appendix A3: A problend900 34 days ago, B quietwave-h2 10 days ago, C swiftboil-k1 200 days ago.
const ORDERS: Array<{ productId: string; daysAgo: number }> = [
  { productId: 'problend900', daysAgo: 34 },
  { productId: 'quietwave-h2', daysAgo: 10 },
  { productId: 'swiftboil-k1', daysAgo: 200 },
];

type Variant = { id: string; sku: string | null };

async function ensureProduct(handle: string, title: string, price: number, sku: string): Promise<Variant> {
  const found = await shopify.gql<{ productByIdentifier: { id: string; variants: { nodes: Variant[] } } | null }>(
    `query($h: String!) { productByIdentifier(identifier: { handle: $h }) { id variants(first: 5) { nodes { id sku } } } }`,
    { h: handle },
  );
  if (found.productByIdentifier) return found.productByIdentifier.variants.nodes[0];
  const created = await shopify.gql<{ productSet: { product: { variants: { nodes: Variant[] } } | null; userErrors: Array<{ message: string }> } }>(
    `mutation($input: ProductSetInput!) { productSet(synchronous: true, input: $input) {
       product { id variants(first: 5) { nodes { id sku } } } userErrors { field message } } }`,
    {
      input: {
        handle, title, status: 'ACTIVE',
        productOptions: [{ name: 'Title', position: 1, values: [{ name: 'Default Title' }] }],
        variants: [{ optionValues: [{ optionName: 'Title', name: 'Default Title' }], price: price.toFixed(2), sku }],
      },
    },
  );
  if (created.productSet.userErrors.length) throw new Error(`productSet ${handle}: ${created.productSet.userErrors[0].message}`);
  console.log(`created product ${handle}`);
  return created.productSet.product!.variants.nodes[0];
}

async function ensureCustomer(): Promise<string> {
  const q = await shopify.gql<{ customers: { nodes: Array<{ id: string }> } }>(
    `query($q: String!) { customers(first: 1, query: $q) { nodes { id } } }`, { q: `email:${email}` });
  if (q.customers.nodes[0]) return q.customers.nodes[0].id;
  const c = await shopify.gql<{ customerCreate: { customer: { id: string } | null; userErrors: Array<{ message: string }> } }>(
    `mutation($input: CustomerInput!) { customerCreate(input: $input) { customer { id } userErrors { field message } } }`,
    { input: { email, firstName: 'Demo', lastName: 'Customer' } });
  if (c.customerCreate.userErrors.length) throw new Error(`customerCreate: ${c.customerCreate.userErrors[0].message}`);
  console.log('created demo customer');
  return c.customerCreate.customer!.id;
}

async function cancelOldDemoOrders(): Promise<number> {
  const r = await shopify.gql<{ orders: { nodes: Array<{ id: string; name: string; cancelledAt: string | null }> } }>(
    `query($q: String!) { orders(first: 50, query: $q) { nodes { id name cancelledAt } } }`, { q: `tag:${TAG}` });
  const open = r.orders.nodes.filter(o => !o.cancelledAt);
  for (const o of open) {
    const c = await shopify.gql<{ orderCancel: { orderCancelUserErrors: Array<{ message: string }>; userErrors: Array<{ message: string }> } }>(
      `mutation($id: ID!) { orderCancel(orderId: $id, reason: OTHER, refund: false, restock: false, notifyCustomer: false) {
         job { id } orderCancelUserErrors { field message } userErrors { field message } } }`,
      { id: o.id });
    const err = c.orderCancel.orderCancelUserErrors[0] ?? c.orderCancel.userErrors[0];
    if (err) console.warn(`could not cancel ${o.name}: ${err.message}`);
  }
  return open.length;
}

async function main() {
  const shop = await shopify.gql<{ shop: { currencyCode: string }; locations: { nodes: Array<{ id: string }> } }>(
    `{ shop { currencyCode } locations(first: 1) { nodes { id } } }`);
  const currency = shop.shop.currencyCode;
  const locationId = shop.locations.nodes[0]?.id;
  if (!locationId) throw new Error('store has no location');

  const variants: Record<string, Variant> = {};
  for (const [id, p] of Object.entries(products)) {
    variants[id] = await ensureProduct(id, p.title, p.price, id.toUpperCase());
    for (const part of p.parts) {
      await ensureProduct(`${id}-part-${part.sku.toLowerCase()}`, `${p.title} - ${part.name}`, part.price, part.sku);
    }
  }
  await ensureCustomer();
  const cancelled = await cancelOldDemoOrders();
  if (cancelled) console.log(`cancelled ${cancelled} earlier demo order(s)`);

  for (const o of ORDERS) {
    const p = products[o.productId];
    const processedAt = new Date(Date.now() - o.daysAgo * 86_400_000).toISOString();
    const r = await shopify.gql<{ orderCreate: { order: { id: string; name: string; processedAt: string } | null; userErrors: Array<{ field: string[]; message: string }> } }>(
      `mutation($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
         orderCreate(order: $order, options: $options) { order { id name processedAt } userErrors { field message } } }`,
      {
        order: {
          email,
          processedAt,
          tags: [TAG],
          financialStatus: 'PAID',
          lineItems: [{ variantId: variants[o.productId].id, quantity: 1 }],
          fulfillment: { locationId },
          transactions: [{ kind: 'SALE', status: 'SUCCESS', amountSet: { shopMoney: { amount: p.price.toFixed(2), currencyCode: currency } } }],
        },
        options: { inventoryBehaviour: 'BYPASS', sendReceipt: false },
      },
    );
    const err = r.orderCreate.userErrors[0];
    if (err) throw new Error(`orderCreate ${o.productId}: ${err.field?.join('.')} ${err.message}`);
    const order = r.orderCreate.order!;
    console.log(`${order.name}  ${o.productId}  ${order.processedAt.slice(0, 10)} (${o.daysAgo} days ago)  ${order.id}`);
  }
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); });
