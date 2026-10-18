// ui://concierge/steps.html: numbered steps from the manual with "It worked" / "Still broken" (FR-22).
import { App } from '@modelcontextprotocol/ext-apps';
import { el, clear } from './dom.ts';

type Step = { n: number; title: string; detail: string };
type StepsData = { productId: string; productTitle: string; steps: Step[]; source: { document: string; page: number }; symptomKey?: string };

const root = document.getElementById('root')!;
const app = new App({ name: 'concierge-steps', version: '0.1.0' });

function render(d: StepsData) {
  clear(root);
  root.append(
    el('h1', { class: 'title' }, d.productTitle),
    el('p', { class: 'sub' }, d.steps.length ? `From the product manual, page ${d.source.page}` : 'No steps found in the manual for this problem'),
    el('ol', { class: 'steps' }, ...d.steps.map(s => el('li', {},
      el('span', { class: 'n', 'aria-hidden': 'true' }, String(s.n)),
      el('div', {}, el('div', { class: 't' }, `Step ${s.n}: ${s.title}`), el('div', { class: 'd' }, s.detail)),
    ))),
  );
  const status = el('p', { class: 'status' }, '');
  const worked = el('button', { type: 'button' }, 'It worked') as HTMLButtonElement;
  const broken = el('button', { type: 'button', class: 'ghost' }, 'Still broken') as HTMLButtonElement;
  const report = async (ok: boolean) => {
    worked.disabled = broken.disabled = true;
    status.textContent = ok ? 'Noting that on your order…' : 'Checking your options…';
    try {
      const r = await app.callServerTool({ name: 'report_outcome', arguments: { productId: d.productId, worked: ok } });
      const text = (r.content as Array<{ type: string; text?: string }>).find(c => c.type === 'text')?.text ?? '';
      status.textContent = ok ? text : '';
    } catch {
      status.textContent = 'Sorry, that did not go through. Please say it instead.';
      worked.disabled = broken.disabled = false;
    }
  };
  worked.onclick = () => report(true);
  broken.onclick = () => report(false);
  root.append(el('div', { class: 'actions' }, worked, broken), status);
}

// Set the handler before connecting so the first tool result is never missed.
app.ontoolresult = result => {
  const sc = result.structuredContent as StepsData | undefined;
  if (sc && Array.isArray(sc.steps)) render(sc);
};
await app.connect();
