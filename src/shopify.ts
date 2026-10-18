// Shopify Admin GraphQL client. Token from the client credentials grant, cached in memory,
// refreshed 5 minutes before its 24-hour expiry (docs/IMPLEMENTATION_PLAN.md A4).
// No PII leaves this module in errors: messages carry status codes and Shopify's own wording only.

export type LineItem = {
  lineItemId: string;
  title: string;
  quantity: number;
  sku?: string;
  productHandle?: string;
  productId?: string;
  variantId?: string;
  imageUrl?: string;
};
export type Order = { orderId: string; name: string; processedAt: string; tags: string[]; lineItems: LineItem[] };
export type ReturnableLine = { fulfillmentLineItemId: string; lineItemId: string; quantity: number };

export class ShopifyError extends Error {
  override name = 'ShopifyError';
  status?: number;
  constructor(message: string, status?: number) { super(message); this.status = status; }
}

export type ShopifyDeps = {
  fetch?: typeof fetch;
  now?: () => number;
  store?: string;
  clientId?: string;
  clientSecret?: string;
  apiVersion?: string;
};

const REFRESH_MARGIN_MS = 5 * 60_000;

const ORDER_FIELDS = `
  id name processedAt cancelledAt tags
  lineItems(first: 10) { nodes { id title quantity sku product { id handle } variant { id } image { url } } }`;

type RawOrder = {
  id: string; name: string; processedAt: string; cancelledAt: string | null; tags: string[];
  lineItems: { nodes: Array<{ id: string; title: string; quantity: number; sku: string | null;
    product: { id: string; handle: string } | null; variant: { id: string } | null; image: { url: string } | null }> };
};

function toOrder(o: RawOrder): Order {
  return {
    orderId: o.id, name: o.name, processedAt: o.processedAt, tags: o.tags ?? [],
    lineItems: o.lineItems.nodes.map(li => ({
      lineItemId: li.id, title: li.title, quantity: li.quantity, sku: li.sku ?? undefined,
      productHandle: li.product?.handle, productId: li.product?.id, variantId: li.variant?.id, imageUrl: li.image?.url,
    })),
  };
}

export function createShopify(deps: ShopifyDeps = {}) {
  const rawFetch: typeof fetch = deps.fetch ?? ((input, init) => globalThis.fetch(input, init));
  // Network failures and timeouts become ShopifyError too, so every store problem speaks the same sentence.
  const doFetch: typeof fetch = async (input, init) => {
    try {
      return await rawFetch(input, init);
    } catch (e) {
      throw new ShopifyError(`network ${(e as Error).name}`);
    }
  };
  const now = deps.now ?? Date.now;
  const env = () => ({
    store: deps.store ?? process.env.SHOPIFY_STORE ?? '',
    clientId: deps.clientId ?? process.env.SHOPIFY_CLIENT_ID ?? '',
    clientSecret: deps.clientSecret ?? process.env.SHOPIFY_CLIENT_SECRET ?? '',
    apiVersion: deps.apiVersion ?? '2025-10',
  });
  let token: { value: string; expiresAt: number } | undefined;

  async function getToken(): Promise<string> {
    if (token && now() < token.expiresAt - REFRESH_MARGIN_MS) return token.value;
    const { store, clientId, clientSecret } = env();
    if (!store || !clientId || !clientSecret) throw new ShopifyError('Shopify is not configured');
    const r = await doFetch(`https://${store}.myshopify.com/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    });
    if (!r.ok) throw new ShopifyError(`token request failed with ${r.status}`, r.status);
    const j = (await r.json()) as { access_token: string; expires_in?: number };
    token = { value: j.access_token, expiresAt: now() + (j.expires_in ?? 86_400) * 1000 };
    return token.value;
  }

  async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const { store, apiVersion } = env();
    const r = await doFetch(`https://${store}.myshopify.com/admin/api/${apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-shopify-access-token': await getToken() },
      body: JSON.stringify({ query, variables }),
    });
    if (!r.ok) throw new ShopifyError(`request failed with ${r.status}`, r.status);
    const j = (await r.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (j.errors?.length) throw new ShopifyError(j.errors[0].message);
    if (!j.data) throw new ShopifyError('empty response');
    return j.data;
  }

  function userErrors(errs: Array<{ message: string }> | undefined) {
    if (errs?.length) throw new ShopifyError(errs[0].message);
  }

  return {
    gql,

    /** Non-cancelled orders for a customer email, newest first. */
    async findOrdersForCustomer(email: string): Promise<Order[]> {
      const d = await gql<{ orders: { nodes: RawOrder[] } }>(
        `query($q: String!) { orders(first: 20, query: $q, sortKey: PROCESSED_AT, reverse: true) { nodes { ${ORDER_FIELDS} } } }`,
        { q: `email:${email}` },
      );
      return d.orders.nodes.filter(o => !o.cancelledAt).map(toOrder);
    },

    async getOrder(orderId: string): Promise<Order | undefined> {
      const d = await gql<{ order: RawOrder | null }>(`query($id: ID!) { order(id: $id) { ${ORDER_FIELDS} } }`, { id: orderId });
      return d.order && !d.order.cancelledAt ? toOrder(d.order) : undefined;
    },

    async getReturnableFulfillments(orderId: string): Promise<ReturnableLine[]> {
      const d = await gql<{ returnableFulfillments: { nodes: Array<{ returnableFulfillmentLineItems: { nodes: Array<{ quantity: number; fulfillmentLineItem: { id: string; lineItem: { id: string } } }> } }> } }>(
        `query($id: ID!) { returnableFulfillments(orderId: $id, first: 10) { nodes {
           returnableFulfillmentLineItems(first: 20) { nodes { quantity fulfillmentLineItem { id lineItem { id } } } } } } }`,
        { id: orderId },
      );
      return d.returnableFulfillments.nodes.flatMap(f => f.returnableFulfillmentLineItems.nodes.map(n => ({
        fulfillmentLineItemId: n.fulfillmentLineItem.id, lineItemId: n.fulfillmentLineItem.lineItem.id, quantity: n.quantity,
      })));
    },

    async createReturn(orderId: string, fulfillmentLineItemId: string, reason: string): Promise<{ returnId: string; name: string }> {
      const d = await gql<{ returnCreate: { return: { id: string; name: string } | null; userErrors: Array<{ message: string }> } }>(
        `mutation($input: ReturnInput!) { returnCreate(returnInput: $input) { return { id name } userErrors { field message } } }`,
        { input: { orderId, returnLineItems: [{ fulfillmentLineItemId, quantity: 1, returnReason: 'DEFECTIVE', returnReasonNote: reason.slice(0, 255) }] } },
      );
      userErrors(d.returnCreate.userErrors);
      return { returnId: d.returnCreate.return!.id, name: d.returnCreate.return!.name };
    },

    async createDraftOrder(variantId: string, email?: string): Promise<{ draftOrderId: string; name: string }> {
      const d = await gql<{ draftOrderCreate: { draftOrder: { id: string; name: string } | null; userErrors: Array<{ message: string }> } }>(
        `mutation($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { id name } userErrors { field message } } }`,
        { input: { lineItems: [{ variantId, quantity: 1 }], tags: ['concierge-part'], ...(email ? { email } : {}) } },
      );
      userErrors(d.draftOrderCreate.userErrors);
      return { draftOrderId: d.draftOrderCreate.draftOrder!.id, name: d.draftOrderCreate.draftOrder!.name };
    },

    async findVariantBySku(sku: string): Promise<{ variantId: string; price: number; title: string } | undefined> {
      const d = await gql<{ productVariants: { nodes: Array<{ id: string; price: string; product: { title: string } }> } }>(
        `query($q: String!) { productVariants(first: 1, query: $q) { nodes { id price product { title } } } }`,
        { q: `sku:${sku}` },
      );
      const v = d.productVariants.nodes[0];
      return v ? { variantId: v.id, price: Number(v.price), title: v.product.title } : undefined;
    },
  };
}

export type Shopify = ReturnType<typeof createShopify>;
export const shopify: Shopify = createShopify();
