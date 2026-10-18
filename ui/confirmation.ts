// ui://concierge/confirmation.html: claim reference, return QR with pickup date, or part order (FR-24).
// The same view also explains a refusal or a pending confirmation, so the card is never blank.
import { App } from '@modelcontextprotocol/ext-apps';
import { el, clear, money, speakDate } from './dom.ts';

type Data = {
  productTitle?: string;
  claimRef?: string; nextStep?: string;
  returnName?: string; returnId?: string; qrPngDataUrl?: string; pickup?: { date: string; window: string };
  draftName?: string; part?: string; price?: number; eta?: string;
  refused?: boolean; reason?: string; needsConfirmation?: boolean; created?: boolean; deleted?: number;
};

const root = document.getElementById('root')!;
const app = new App({ name: 'concierge-confirmation', version: '0.1.0' });

function render(d: Data) {
  clear(root);
  const box = el('div', { class: 'confirm' });
  const left = el('div', {});
  box.append(left);
  if (d.claimRef) {
    left.append(el('h1', { class: 'title ok' }, d.created === false ? 'Claim already filed' : 'Warranty claim filed'),
      el('p', { class: 'sub' }, d.productTitle ?? ''), el('div', { class: 'ref' }, d.claimRef), el('p', { class: 'sub' }, d.nextStep ?? ''));
  } else if (d.returnName) {
    left.append(el('h1', { class: 'title ok' }, d.created === false ? 'Return already booked' : 'Return booked'),
      el('p', { class: 'sub' }, d.productTitle ?? ''), el('div', { class: 'ref' }, d.returnName),
      el('p', { class: 'sub' }, d.pickup ? `Pickup ${speakDate(d.pickup.date)}, ${d.pickup.window}. Show this code to the courier.` : ''));
    if (d.qrPngDataUrl) box.append(el('img', { class: 'qr', src: d.qrPngDataUrl, alt: `QR code for return ${d.returnName}` }));
  } else if (d.draftName) {
    left.append(el('h1', { class: 'title ok' }, d.created === false ? 'Part already ordered' : 'Part ordered'),
      el('p', { class: 'sub' }, d.productTitle ?? ''), el('div', { class: 'ref' }, `${d.part} · ${money(d.price ?? 0)}`),
      el('p', { class: 'sub' }, `Order ${d.draftName}. Arrives in ${d.eta}; a payment link is on its way by email.`));
  } else if (typeof d.deleted === 'number') {
    left.append(el('h1', { class: 'title ok' }, 'Data deleted'), el('p', { class: 'sub' }, `${d.deleted} record${d.deleted === 1 ? '' : 's'} removed from the concierge.`));
  } else if (d.refused) {
    left.append(el('h1', { class: 'title' }, 'Not available'), el('p', { class: 'sub' }, d.reason ?? 'That option is not available for this order.'));
  } else if (d.needsConfirmation) {
    left.append(el('h1', { class: 'title' }, 'Waiting for your confirmation'), el('p', { class: 'sub' }, 'Say yes to go ahead, or no to stop.'));
  } else {
    left.append(el('h1', { class: 'title' }, 'Done'));
  }
  const done = el('button', { type: 'button', class: 'ghost' }, 'Done') as HTMLButtonElement;
  done.onclick = () => { done.disabled = true; done.textContent = 'Thanks'; };
  root.append(box, el('div', { class: 'actions' }, done));
}

app.ontoolresult = result => render((result.structuredContent as Data | undefined) ?? {});
await app.connect();
