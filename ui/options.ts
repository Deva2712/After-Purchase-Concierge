// ui://concierge/options.html: ranked resolutions with the reason and price, one "Choose" per eligible option (FR-23).
// Choosing asks for an on-screen confirmation first, then calls the write tool with confirmed: true.
import { App } from '@modelcontextprotocol/ext-apps';
import { el, clear, money } from './dom.ts';

type Action = 'return' | 'warranty_claim' | 'order_part' | 'contact_merchant';
type Option = { action: Action; eligible: boolean; rank: number; reason: string; cost: number; detail?: { name?: string; sku?: string } };
type OptionsData = { orderId: string; lineItemId: string; productId: string; productTitle: string; symptomKey?: string; options: Option[]; resolved?: boolean };

const LABEL: Record<Action, string> = { return: 'Return for a full refund', warranty_claim: 'Warranty claim', order_part: 'Replacement part', contact_merchant: 'Contact the merchant' };
const VERB: Record<Action, string> = { return: 'Start the return', warranty_claim: 'File the claim', order_part: 'Order the part', contact_merchant: '' };

const root = document.getElementById('root')!;
const app = new App({ name: 'concierge-options', version: '0.1.0' });

function toolCall(d: OptionsData, o: Option): { name: string; arguments: Record<string, unknown> } {
  const base = { orderId: d.orderId, lineItemId: d.lineItemId, confirmed: true };
  const symptom = d.symptomKey?.replace(/-/g, ' ') ?? 'not working';
  if (o.action === 'return') return { name: 'create_return', arguments: { ...base, reason: symptom } };
  if (o.action === 'warranty_claim') return { name: 'file_warranty_claim', arguments: { ...base, symptom } };
  return { name: 'order_part', arguments: { ...base, partSku: o.detail?.sku } };
}

function render(d: OptionsData) {
  clear(root);
  if (d.resolved) {
    root.append(el('h1', { class: 'title ok' }, 'Glad that fixed it'), el('p', { class: 'sub' }, `Noted on your ${d.productTitle} order.`));
    return;
  }
  const status = el('p', { class: 'status' }, '');
  const list = el('div', { class: 'options' });
  for (const o of d.options) {
    const row = el('div', { class: `opt${o.eligible && o.rank === 1 ? ' top' : ''}${o.eligible ? '' : ' off'}` });
    const name = o.action === 'order_part' && o.detail?.name ? `${LABEL[o.action]}: ${o.detail.name}` : LABEL[o.action];
    row.append(el('div', {},
      el('div', { class: 'name' }, `${o.eligible && o.rank === 1 ? 'Recommended: ' : ''}${name}`),
      el('div', { class: 'why' }, o.reason),
      el('div', { class: 'cost' }, o.eligible ? money(o.cost) : 'Not available'),
    ));
    if (o.eligible && VERB[o.action]) {
      const choose = el('button', { type: 'button', class: o.rank === 1 ? '' : 'ghost' }, 'Choose') as HTMLButtonElement;
      choose.onclick = () => confirm(d, o, row, choose, status);
      row.append(choose);
    }
    list.append(row);
  }
  root.append(el('h1', { class: 'title' }, 'What would you like to do?'), el('p', { class: 'sub' }, d.productTitle), list, status);
}

function confirm(d: OptionsData, o: Option, row: HTMLElement, choose: HTMLButtonElement, status: HTMLElement) {
  choose.replaceWith(el('span', {}, ''));
  const yes = el('button', { type: 'button' }, VERB[o.action]) as HTMLButtonElement;
  const back = el('button', { type: 'button', class: 'ghost' }, 'Back') as HTMLButtonElement;
  const ask = el('div', { class: 'actions' }, el('div', { class: 'name' }, `${VERB[o.action]}?`), yes, back);
  row.append(ask);
  back.onclick = () => render(d);
  yes.onclick = async () => {
    yes.disabled = back.disabled = true;
    status.textContent = 'Working on it…';
    try {
      const r = await app.callServerTool(toolCall(d, o));
      status.textContent = (r.content as Array<{ type: string; text?: string }>).find(c => c.type === 'text')?.text ?? '';
    } catch {
      status.textContent = 'Sorry, that did not go through. Please say it instead.';
      yes.disabled = back.disabled = false;
    }
  };
}

app.ontoolresult = result => {
  const sc = result.structuredContent as OptionsData | undefined;
  if (sc && (Array.isArray(sc.options) || sc.resolved)) render(sc);
};
await app.connect();
