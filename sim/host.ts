// The simulated device: transcript, speech in and out, an Echo Show style frame that hosts the ui:// views
// as an MCP Apps host, and a panel listing every MCP tool call. Everything reaches the server through
// /sim/chat, /sim/resource and /sim/tool, which are backed by an MCP client of MCP_URL (docs/ARCHITECTURE.md section 15).
import { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge';
import { PostMessageTransport } from '@modelcontextprotocol/ext-apps';

type ToolCall = { name: string; arguments: Record<string, unknown>; ms: number; isError: boolean; text: string; structuredContent?: unknown; resourceUri?: string };
type Frame = 'small' | 'large' | 'voice';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const code = $<HTMLInputElement>('code');
const utt = $<HTMLInputElement>('utt');
const mic = $<HTMLButtonElement>('mic');
const speak = $<HTMLInputElement>('speak');
const stage = $('stage');
const device = $('device');
const screen = $('screen');
const idle = $('idle');
const transcript = $('transcript');
const calls = $<HTMLUListElement>('calls');

const sessionId = crypto.randomUUID();
let frame: Frame = 'small';
const resources = new Map<string, Promise<string>>();
let currentBridge: AppBridge | undefined;

code.value = new URLSearchParams(location.search).get('code') || localStorage.getItem('simCode') || '';

// ---------- transport to the server ----------
async function api<T>(path: string, body: unknown): Promise<T> {
  localStorage.setItem('simCode', code.value);
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sim-code': code.value }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.say || `HTTP ${r.status}`);
  return j as T;
}
function resource(uri: string): Promise<string> {
  let p = resources.get(uri);
  if (!p) {
    p = fetch(`/sim/resource?uri=${encodeURIComponent(uri)}`, { headers: { 'x-sim-code': code.value } }).then(r => {
      if (!r.ok) throw new Error(`resource ${r.status}`);
      return r.text();
    });
    resources.set(uri, p);
  }
  return p;
}

// ---------- transcript and speech ----------
function line(cls: 'u' | 'a', text: string) {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  transcript.append(d);
  d.scrollIntoView({ block: 'nearest' });
}
function say(text: string) {
  if (!text) return;
  line('a', text);
  if (speak.checked && 'speechSynthesis' in window) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    speechSynthesis.speak(u);
  }
}
function logCall(c: ToolCall) {
  const li = document.createElement('li');
  if (c.isError) li.classList.add('err');
  const name = document.createElement('code');
  name.textContent = c.name;
  const ms = document.createElement('span');
  ms.className = 'ms';
  ms.textContent = `${c.ms} ms`;
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = c.text.length > 90 ? `${c.text.slice(0, 90)}…` : c.text || '(no text)';
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify({ arguments: c.arguments, structuredContent: c.structuredContent }, null, 1);
  details.append(summary, pre);
  li.append(name, ms, details);
  calls.prepend(li);
}

// ---------- the device frame as an MCP Apps host ----------
function fitDevice() {
  const available = stage.clientWidth;
  const width = frame === 'large' ? 1300 : 1044; // frame size including the bezel
  const scale = Math.min(1, available / width);
  device.style.transform = `scale(${scale})`;
  stage.style.setProperty('--h', `${(frame === 'large' ? 820 : 620) * scale}px`);
  device.style.marginBottom = `${(frame === 'large' ? 820 : 620) * (scale - 1)}px`;
}

async function showCard(call: ToolCall) {
  if (frame === 'voice' || !call.resourceUri) return;
  const html = await resource(call.resourceUri);
  if (currentBridge) { try { await currentBridge.close(); } catch { /* already gone */ } }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.title = 'Alexa+ card (simulated)';
  screen.replaceChildren(iframe);
  idle.style.display = 'none';

  // Host context goes in the constructor: setHostContext() sends a notification, which needs a connected transport.
  const bridge = new AppBridge(null, { name: 'simulated-alexa-plus', version: '0.1.0' }, { serverTools: {} }, {
    hostContext: {
      displayMode: 'inline',
      availableDisplayModes: ['inline'],
      theme: 'dark',
      platform: 'web',
      locale: 'en-US',
      containerDimensions: { width: device.clientWidth, height: device.clientHeight },
      deviceCapabilities: { touch: true, hover: false },
    },
  });
  currentBridge = bridge;
  // A card button pressed: forward to the server through /sim/tool, then show whatever card that tool links.
  bridge.oncalltool = async params => {
    const res = await api<ToolCall>('/sim/tool', { sessionId, name: params.name, arguments: params.arguments ?? {} });
    logCall(res);
    setTimeout(() => { say(res.text); void showCard(res); }, 0);
    return { content: [{ type: 'text', text: res.text }], structuredContent: res.structuredContent as Record<string, unknown> | undefined, isError: res.isError };
  };
  // Deliver the tool result only after the view has initialised, so the first card is never blank.
  bridge.addEventListener('initialized', () => {
    console.log('[sim-host] view initialised, sending tool result for', call.name);
    void bridge.sendToolInput({ arguments: call.arguments });
    void bridge.sendToolResult({ content: [{ type: 'text', text: call.text }], structuredContent: call.structuredContent as Record<string, unknown> | undefined, isError: call.isError });
  });
  bridge.addEventListener('loggingmessage', p => console.log('[card]', p.level, JSON.stringify(p.data)));
  window.addEventListener('message', e => { if (e.source === iframe.contentWindow) console.log('[sim-host] <- card', JSON.stringify(e.data).slice(0, 160)); });
  await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
  console.log('[sim-host] bridge listening, loading', call.resourceUri);
  iframe.srcdoc = html;
}

// ---------- a turn ----------
async function send(utterance: string) {
  if (!utterance.trim()) return;
  line('u', utterance);
  utt.value = '';
  try {
    const r = await api<{ say: string; toolCalls: ToolCall[] }>('/sim/chat', { sessionId, utterance });
    for (const c of r.toolCalls) logCall(c);
    const card = [...r.toolCalls].reverse().find(c => c.resourceUri && !c.isError);
    if (card) await showCard(card);
    say(r.say);
  } catch (e) {
    line('a', (e as Error).message);
  }
}

$('ask').addEventListener('submit', e => { e.preventDefault(); void send(utt.value); });

// Speech input with the Web Speech API (Chrome and Edge); the text box is always the fallback.
type Recognition = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void; start(): void; stop(): void };
const SR = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition });
const Rec = SR.SpeechRecognition ?? SR.webkitSpeechRecognition;
if (!Rec) { mic.disabled = true; mic.title = 'Speech input needs Chrome or Edge; typing works everywhere.'; }
mic.addEventListener('click', () => {
  if (!Rec) return;
  const rec = new Rec();
  rec.lang = 'en-US';
  rec.interimResults = false;
  mic.classList.add('listening');
  mic.textContent = 'Listening…';
  rec.onresult = e => { void send(e.results[0][0].transcript); };
  rec.onend = () => { mic.classList.remove('listening'); mic.textContent = 'Mic'; };
  rec.onerror = () => rec.onend();
  rec.start();
});

for (const radio of document.querySelectorAll<HTMLInputElement>('input[name=frame]')) {
  radio.addEventListener('change', () => {
    frame = radio.value as Frame;
    device.className = frame;
    stage.className = `stage ${frame}`;
    fitDevice();
  });
}
window.addEventListener('resize', fitDevice);
fitDevice();

// Preview mode for checking the cards without a store or a Knowledge Base: /sim?code=…&preview=steps|options|confirmation[&frame=large].
// It renders a hard-coded sample through the real host bridge, which is how the T3.13 frame checks and screenshots are done.
const SAMPLES: Record<string, ToolCall> = {
  steps: { name: 'troubleshoot', arguments: { productId: 'problend900', symptom: "won't turn on" }, ms: 41, isError: false, resourceUri: 'ui://concierge/steps.html',
    text: 'The ProBlend 900 Blender manual, page 3, has 4 steps.',
    structuredContent: { productId: 'problend900', productTitle: 'ProBlend 900 Blender', symptomKey: 'wont-turn-on', source: { document: 'problend900.pdf', page: 3 }, steps: [
      { n: 1, title: 'Lock the jar', detail: 'Lift the jar off, put it back with the arrow at the unlock mark, and turn it clockwise until it clicks.' },
      { n: 2, title: 'Close the lid fully', detail: 'Press down on both sides of the lid until the tab sits in the handle slot and the power light turns white.' },
      { n: 3, title: 'Try another outlet', detail: 'Plug the blender into a different outlet that you know works.' },
      { n: 4, title: 'Reset the thermal cutout', detail: 'Unplug for 30 minutes, plug back in, then hold Pulse for 5 seconds until the light flashes twice.' },
    ] } },
  options: { name: 'get_resolution_options', arguments: {}, ms: 388, isError: false, resourceUri: 'ui://concierge/options.html',
    text: '4 days past the 30-day return window, but about 11 months of warranty remain. Shall I file the warranty claim?',
    structuredContent: { orderId: 'gid://shopify/Order/1', lineItemId: 'gid://shopify/LineItem/1', productId: 'problend900', productTitle: 'ProBlend 900 Blender', symptomKey: 'wont-turn-on', options: [
      { action: 'warranty_claim', eligible: true, rank: 1, reason: 'About 11 months of warranty remain, so the merchant can repair or replace it at no cost.', cost: 0 },
      { action: 'contact_merchant', eligible: true, rank: 2, reason: 'The merchant can also help directly if you prefer.', cost: 0 },
      { action: 'return', eligible: false, rank: 3, reason: '4 days past the 30-day return window.', cost: 0 },
      { action: 'order_part', eligible: false, rank: 4, reason: 'No replacement part covers this problem.', cost: 0 },
    ] } },
  confirmation: { name: 'create_return', arguments: {}, ms: 512, isError: false, resourceUri: 'ui://concierge/confirmation.html',
    text: 'Your return for the QuietWave H2 Headphones is booked.',
    structuredContent: { productTitle: 'QuietWave H2 Headphones', returnName: '#R1002', returnId: 'gid://shopify/Return/1', created: true, pickup: { date: '2026-10-22', window: '9am to 5pm' },
      qrPngDataUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges"><rect width="8" height="8" fill="#fff"/><path fill="#000" d="M0 0h3v3H0zM5 0h3v3H5zM0 5h3v3H0zM4 4h1v1H4zM6 5h1v1H6zM5 6h1v1H5zM7 7h1v1H7z"/></svg>') } },
};
const params = new URLSearchParams(location.search);
const preview = params.get('preview');
if (preview && SAMPLES[preview]) {
  const f = params.get('frame') as Frame | null;
  if (f) { frame = f; device.className = f; stage.className = `stage ${f}`; fitDevice(); (document.querySelector(`input[name=frame][value=${f}]`) as HTMLInputElement | null)?.click(); }
  speak.checked = false;
  logCall(SAMPLES[preview]);
  void showCard(SAMPLES[preview]).then(() => say(SAMPLES[preview].text));
}
