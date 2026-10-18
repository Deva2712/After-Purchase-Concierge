import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, daysBetween, describeOptions, type ResolveInput } from '../src/policy.ts';

const TODAY = '2026-10-20';
const daysAgo = (n: number) => new Date(Date.UTC(2026, 9, 20) - n * 86_400_000).toISOString().slice(0, 10);
const base: ResolveInput = { purchaseDate: daysAgo(10), today: TODAY, price: 89, returnWindowDays: 30, warrantyMonths: 12, parts: [] };
const top = (i: ResolveInput) => resolve(i).options[0];
const find = (i: ResolveInput, a: string) => resolve(i).options.find(o => o.action === a)!;

test('T2.1 purchase 30 days ago, 30-day window: return is eligible', () => {
  assert.equal(find({ ...base, purchaseDate: daysAgo(30) }, 'return').eligible, true);
  assert.equal(top({ ...base, purchaseDate: daysAgo(30) }).action, 'return');
});

test('T2.2 purchase 31 days ago: return ineligible, reason says how many days past', () => {
  const r = find({ ...base, purchaseDate: daysAgo(31) }, 'return');
  assert.equal(r.eligible, false);
  assert.match(r.reason, /1 day past the 30-day return window/);
  const r2 = find({ ...base, purchaseDate: daysAgo(34) }, 'return');
  assert.match(r2.reason, /4 days past/);
});

test('T2.3 last day of warranty eligible, one day after ineligible', () => {
  const lastDay = Math.floor(12 * 30.4); // 364
  assert.equal(find({ ...base, purchaseDate: daysAgo(lastDay) }, 'warranty_claim').eligible, true);
  const after = find({ ...base, purchaseDate: daysAgo(lastDay + 1) }, 'warranty_claim');
  assert.equal(after.eligible, false);
  assert.match(after.reason, /12-month warranty ended/);
});

test('T2.4 matching part under 20% of the price ranks first', () => {
  const i: ResolveInput = { ...base, price: 49, parts: [{ name: 'Lid seal', sku: 'S', price: 6, symptoms: ['lid-wont-close'] }], symptomKey: 'lid-wont-close' };
  const o = resolve(i).options;
  assert.equal(o[0].action, 'order_part');
  assert.equal(o[0].cost, 6);
  assert.deepEqual(o.map(x => x.action), ['order_part', 'return', 'warranty_claim', 'contact_merchant']);
});

test('T2.5 matching part at 20% or more: order is return, warranty, part', () => {
  const i: ResolveInput = { ...base, price: 90, parts: [{ name: 'Blade', sku: 'B', price: 18, symptoms: ['leaking'] }], symptomKey: 'leaking' };
  assert.deepEqual(resolve(i).options.map(x => x.action), ['return', 'warranty_claim', 'order_part', 'contact_merchant']);
});

test('T2.6 no part lists the symptom, or unknown symptom: no eligible part; return and warranty still ranked', () => {
  const parts = [{ name: 'Blade', sku: 'B', price: 5, symptoms: ['leaking'] }];
  for (const symptomKey of ['wont-turn-on', 'something-odd', undefined]) {
    const o = resolve({ ...base, parts, symptomKey }).options;
    assert.equal(o.find(x => x.action === 'order_part')!.eligible, false);
    assert.deepEqual(o.slice(0, 2).map(x => x.action), ['return', 'warranty_claim']);
  }
});

test('T2.7 everything expired and no part: top option is contact merchant', () => {
  const o = resolve({ ...base, purchaseDate: daysAgo(400) }).options;
  assert.equal(o[0].action, 'contact_merchant');
  assert.equal(o[0].eligible, true);
  assert.ok(o.slice(1).every(x => !x.eligible));
});

test('T2.8 purchase date in the future: contact merchant, no crash', () => {
  const o = resolve({ ...base, purchaseDate: '2027-01-01' }).options;
  assert.equal(o[0].action, 'contact_merchant');
  assert.equal(o.length, 4);
});

test('T2.9 every option has a non-empty one-sentence reason', () => {
  const cases: ResolveInput[] = [
    base,
    { ...base, purchaseDate: daysAgo(34) },
    { ...base, purchaseDate: daysAgo(400) },
    { ...base, purchaseDate: '2027-01-01' },
    { ...base, price: 49, parts: [{ name: 'Lid seal', sku: 'S', price: 6, symptoms: ['x'] }], symptomKey: 'x' },
  ];
  for (const c of cases) {
    const o = resolve(c).options;
    assert.equal(o.length, 4);
    assert.deepEqual(o.map(x => x.rank), [1, 2, 3, 4]);
    for (const x of o) {
      assert.ok(x.reason.trim().length > 0);
      assert.equal((x.reason.match(/\.\s/g) ?? []).length, 0, `more than one sentence: ${x.reason}`);
    }
  }
});

test('daysBetween ignores time of day and uses UTC calendar days', () => {
  assert.equal(daysBetween('2026-09-16T23:59:00Z', '2026-10-20T00:01:00Z'), 34);
  assert.equal(daysBetween('2026-10-20', '2026-10-20'), 0);
});

test('describeOptions speaks the top option, mentioning a missed return window first', () => {
  const blender = resolve({ ...base, purchaseDate: daysAgo(34) }).options;
  assert.equal(describeOptions(blender), '4 days past the 30-day return window, but about 11 months of warranty remain, so the merchant can repair or replace it at no cost. Shall I file the warranty claim?');
  const inWindow = resolve(base).options;
  assert.match(describeOptions(inWindow), /^Bought 10 days ago, inside the 30-day return window.*Shall I start the return\?$/);
  const expired = resolve({ ...base, purchaseDate: daysAgo(400) }).options;
  assert.match(describeOptions(expired), /Shall I pass this to the merchant\?$/);
});
