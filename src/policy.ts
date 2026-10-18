// Decision engine. Pure: no I/O, no AWS, no Shopify. Every branch is covered in test/policy.test.ts.
// Rules: docs/SRS.md FR-18 to FR-21; docs/ARCHITECTURE.md section 5.

export type Part = { name: string; sku: string; price: number; symptoms: string[] };

export type ResolveInput = {
  purchaseDate: string | Date;
  today: string | Date;
  price: number;
  returnWindowDays: number;
  warrantyMonths: number;
  parts: Part[];
  symptomKey?: string;
};

export type Action = 'return' | 'warranty_claim' | 'order_part' | 'contact_merchant';

export type Option = {
  action: Action;
  eligible: boolean;
  rank: number;
  reason: string;
  cost: number;
  detail?: Record<string, unknown>;
};

const DAY_MS = 86_400_000;
const DAYS_PER_MONTH = 30.4;
const CHEAP_PART_SHARE = 0.2;

function utcMidnight(d: string | Date): number {
  const date = new Date(d);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Whole calendar days between two dates in UTC, time of day ignored. */
export function daysBetween(from: string | Date, to: string | Date): number {
  return Math.floor((utcMidnight(to) - utcMidnight(from)) / DAY_MS);
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

export function resolve(input: ResolveInput): { options: Option[] } {
  const days = daysBetween(input.purchaseDate, input.today);
  const warrantyDays = input.warrantyMonths * DAYS_PER_MONTH;

  if (days < 0) {
    // Data error: the order is dated in the future. Nothing can be computed; hand over to the merchant.
    const reason = 'The purchase date on this order is in the future, so I cannot check the return or warranty terms.';
    return { options: ranked([
      { action: 'contact_merchant', eligible: true, reason: 'The merchant can check this order by hand.', cost: 0 },
      { action: 'return', eligible: false, reason, cost: 0 },
      { action: 'warranty_claim', eligible: false, reason, cost: 0 },
      { action: 'order_part', eligible: false, reason, cost: 0 },
    ]) };
  }

  const returnOk = days <= input.returnWindowDays;
  const ret: Draft = {
    action: 'return', eligible: returnOk, cost: 0,
    reason: returnOk
      ? `Bought ${plural(days, 'day')} ago, inside the ${input.returnWindowDays}-day return window, so a full refund is available.`
      : `${plural(days - input.returnWindowDays, 'day')} past the ${input.returnWindowDays}-day return window.`,
    detail: { daysSincePurchase: days, returnWindowDays: input.returnWindowDays },
  };

  const warrantyOk = days <= warrantyDays;
  const monthsLeft = Math.round((warrantyDays - days) / DAYS_PER_MONTH);
  const war: Draft = {
    action: 'warranty_claim', eligible: warrantyOk, cost: 0,
    reason: warrantyOk
      ? (monthsLeft >= 1 ? `About ${plural(monthsLeft, 'month')} of warranty remain, so the merchant can repair or replace it at no cost.`
                         : 'The warranty ends in the next few days, so a claim should be filed now.')
      : `The ${input.warrantyMonths}-month warranty ended ${plural(Math.ceil(days - warrantyDays), 'day')} ago.`,
    detail: { monthsRemaining: Math.max(0, monthsLeft), warrantyMonths: input.warrantyMonths },
  };

  const part = input.symptomKey
    ? input.parts.filter(p => p.symptoms.includes(input.symptomKey!)).sort((a, b) => a.price - b.price)[0]
    : undefined;
  const prt: Draft = part
    ? { action: 'order_part', eligible: true, cost: part.price,
        reason: `A replacement ${part.name.toLowerCase()} costs ${money(part.price)} and fixes this without sending anything back.`,
        detail: { name: part.name, sku: part.sku, price: part.price } }
    : { action: 'order_part', eligible: false, cost: 0, reason: 'No replacement part covers this problem.' };

  const anyOther = returnOk || warrantyOk || !!part;
  const contact: Draft = {
    action: 'contact_merchant', eligible: true, cost: 0,
    reason: anyOther ? 'The merchant can also help directly if you prefer.' : 'Outside the return window and the warranty, but the merchant can still advise on a repair.',
  };

  const cheapPartFirst = !!part && part.price < CHEAP_PART_SHARE * input.price;
  const order: Draft[] = cheapPartFirst ? [prt, ret, war, contact] : [ret, war, prt, contact];
  return { options: ranked(order) };
}

type Draft = Omit<Option, 'rank'>;

/** Eligible options keep their given order and come first; ineligible ones follow in the same order. */
function ranked(drafts: Draft[]): Option[] {
  const eligible = drafts.filter(d => d.eligible);
  const rest = drafts.filter(d => !d.eligible);
  return [...eligible, ...rest].map((d, i) => ({ ...d, rank: i + 1 }));
}

function money(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

const VERBS: Record<Action, string> = {
  return: 'start the return',
  warranty_claim: 'file the warranty claim',
  order_part: 'order it',
  contact_merchant: 'pass this to the merchant',
};

/** One or two spoken sentences: why the top option, and the question that asks for confirmation. */
export function describeOptions(options: Option[]): string {
  const top = options[0];
  const ret = options.find(o => o.action === 'return');
  const lead = top.action !== 'return' && ret && !ret.eligible && !ret.reason.startsWith('The purchase date')
    ? `${ret.reason.replace(/\.$/, '')}, but ${top.reason.charAt(0).toLowerCase()}${top.reason.slice(1)}`
    : top.reason;
  return `${lead} Shall I ${VERBS[top.action]}?`;
}
