// Tiny DOM helpers shared by the cards. Text goes through textContent, never innerHTML, because step text comes from documents.
export function el(tag: string, attrs: Record<string, string> = {}, ...children: Array<Node | string>): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

export function clear(node: Element) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export const money = (n: number) => (n === 0 ? 'Free' : Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

export const speakDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
