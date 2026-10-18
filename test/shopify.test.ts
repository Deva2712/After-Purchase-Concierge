import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShopify, ShopifyError } from '../src/shopify.ts';

const HOUR = 3_600_000;

function fakeShopify(orders: unknown[] = []) {
  const state = { clock: 1_000_000, tokenCalls: 0, gqlCalls: 0, lastToken: '' as string | null };
  const fetchFake: typeof fetch = async (url, init) => {
    const u = String(url);
    if (u.endsWith('/admin/oauth/access_token')) {
      state.tokenCalls += 1;
      assert.equal(init?.method, 'POST');
      assert.match(String(init?.body), /grant_type=client_credentials/);
      return Response.json({ access_token: `tok-${state.tokenCalls}`, expires_in: 86_400, scope: 'read_orders' });
    }
    state.gqlCalls += 1;
    state.lastToken = new Headers(init?.headers).get('x-shopify-access-token');
    return Response.json({ data: { orders: { nodes: orders } } });
  };
  const s = createShopify({ fetch: fetchFake, now: () => state.clock, store: 'demo', clientId: 'id', clientSecret: 'secret' });
  return { s, state };
}

test('T2.10 two API calls request the token once; after expiry the next call requests a new one', async () => {
  const { s, state } = fakeShopify();
  await s.findOrdersForCustomer('x@example.com');
  await s.findOrdersForCustomer('x@example.com');
  assert.equal(state.tokenCalls, 1);
  assert.equal(state.gqlCalls, 2);
  assert.equal(state.lastToken, 'tok-1');

  state.clock += 23 * HOUR + 56 * 60_000; // 4 minutes before the 24 h expiry: inside the 5-minute refresh margin
  await s.findOrdersForCustomer('x@example.com');
  assert.equal(state.tokenCalls, 2);
  assert.equal(state.lastToken, 'tok-2');
});

test('findOrdersForCustomer ignores cancelled orders and flattens line items', async () => {
  const raw = (id: string, cancelledAt: string | null) => ({
    id, name: `#${id}`, processedAt: '2026-09-16T10:00:00Z', cancelledAt, tags: ['concierge-demo'],
    lineItems: { nodes: [{ id: `li-${id}`, title: 'ProBlend 900 Blender', quantity: 1, sku: 'PB900',
      product: { id: 'p1', handle: 'problend900' }, variant: { id: 'v1' }, image: { url: 'https://cdn/x.png' } }] },
  });
  const { s } = fakeShopify([raw('1', null), raw('2', '2026-10-01T00:00:00Z')]);
  const orders = await s.findOrdersForCustomer('x@example.com');
  assert.equal(orders.length, 1);
  assert.equal(orders[0].orderId, '1');
  assert.deepEqual(orders[0].lineItems[0], {
    lineItemId: 'li-1', title: 'ProBlend 900 Blender', quantity: 1, sku: 'PB900',
    productHandle: 'problend900', productId: 'p1', variantId: 'v1', imageUrl: 'https://cdn/x.png',
  });
});

test('GraphQL errors and HTTP failures surface as ShopifyError without stack-trace prose', async () => {
  const bad: typeof fetch = async (url) => String(url).endsWith('/access_token')
    ? Response.json({ access_token: 't', expires_in: 86_400 })
    : Response.json({ errors: [{ message: 'Throttled' }] });
  const s = createShopify({ fetch: bad, store: 'demo', clientId: 'id', clientSecret: 'secret' });
  await assert.rejects(() => s.findOrdersForCustomer('x@example.com'), (e: Error) => e instanceof ShopifyError && e.message === 'Throttled');

  const down: typeof fetch = async () => new Response('nope', { status: 503 });
  const s2 = createShopify({ fetch: down, store: 'demo', clientId: 'id', clientSecret: 'secret' });
  await assert.rejects(() => s2.findOrdersForCustomer('x@example.com'), (e: ShopifyError) => e.status === 503);
});
