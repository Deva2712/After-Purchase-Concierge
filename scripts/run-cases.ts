// T4.1: run the utterances in test/cases.json through POST /sim/chat on BASE_URL and score them.
// Each case starts from a fresh sessionId and deleted customer data. Run `npm run seed` before a full pass,
// because return cases consume the returnable line item. Every case spends Bedrock tokens.
// Usage: npm run test:cases [-- --only <id>]
import { readFileSync } from 'node:fs';
import { demoCustomer } from '../src/identity.ts';
import { listRecords } from '../src/db.ts';

try { process.loadEnvFile(); } catch { /* use the environment */ }

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const CODE = process.env.SIM_ACCESS_CODE;
if (!CODE) throw new Error('SIM_ACCESS_CODE is not set');
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined;

type ToolCall = { name: string; arguments: Record<string, unknown>; ms: number; isError: boolean; text: string; structuredContent?: Record<string, unknown> };
type Case = {
  id: string; turns: string[]; expectTools: string[]; expectTopOption?: string; expectRecords?: Record<string, number>;
  expectText?: { tool: string; includes: string }; expectStructured?: { tool: string; path: string; equals: unknown };
  expectLastSayMatch?: string; expectNoTools?: boolean;
};
const cases = (JSON.parse(readFileSync(new URL('../test/cases.json', import.meta.url), 'utf8')) as Case[]).filter(c => !only || c.id === only);

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sim-code': CODE! }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path} ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}

/** Is `expected` an ordered subsequence of `actual`? */
function inOrder(actual: string[], expected: string[]): boolean {
  let i = 0;
  for (const a of actual) if (a === expected[i]) i += 1;
  return i === expected.length;
}

async function runCase(c: Case): Promise<string[]> {
  const failures: string[] = [];
  await post('/sim/tool', { sessionId: 'reset', name: 'delete_my_data', arguments: { confirmed: true } });
  const sessionId = crypto.randomUUID();
  const calls: ToolCall[] = [];
  let lastSay = '';
  for (const utterance of c.turns) {
    const r = await post<{ say: string; toolCalls: ToolCall[] }>('/sim/chat', { sessionId, utterance });
    calls.push(...r.toolCalls);
    lastSay = r.say;
  }
  const names = calls.map(k => k.name);
  if (c.expectNoTools && names.length) failures.push(`expected no tool calls, got ${names.join(', ')}`);
  if (!inOrder(names, c.expectTools)) failures.push(`tools ${names.join(' > ') || '(none)'} do not contain ${c.expectTools.join(' > ')} in order`);
  if (c.expectTopOption) {
    const first = calls.find(k => Array.isArray((k.structuredContent as { options?: unknown[] } | undefined)?.options));
    const top = (first?.structuredContent as { options: Array<{ action: string }> } | undefined)?.options[0]?.action;
    if (top !== c.expectTopOption) failures.push(`top option ${top ?? '(no options result)'} != ${c.expectTopOption}`);
  }
  if (c.expectText) {
    const k = calls.find(x => x.name === c.expectText!.tool);
    if (!k) failures.push(`${c.expectText.tool} was not called`);
    else if (!k.text.includes(c.expectText.includes)) failures.push(`${c.expectText.tool} text "${k.text.slice(0, 80)}" lacks "${c.expectText.includes}"`);
  }
  if (c.expectStructured) {
    const k = calls.find(x => x.name === c.expectStructured!.tool);
    const v = c.expectStructured.path.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown> | undefined)?.[p], k?.structuredContent);
    if (v !== c.expectStructured.equals) failures.push(`${c.expectStructured.tool}.${c.expectStructured.path} = ${JSON.stringify(v)} != ${JSON.stringify(c.expectStructured.equals)}`);
  }
  if (c.expectLastSayMatch && !new RegExp(c.expectLastSayMatch, 'i').test(lastSay)) failures.push(`last reply "${lastSay.slice(0, 100)}" does not match /${c.expectLastSayMatch}/`);
  if (c.expectRecords) {
    const { hash } = demoCustomer();
    for (const [type, n] of Object.entries(c.expectRecords)) {
      const items = type === 'SESSION' ? (await listRecords(hash, 'SESSION')) : await listRecords(hash, `${type}#`);
      if (items.length !== n) failures.push(`${type} records: ${items.length} != ${n}`);
    }
  }
  return failures;
}

let passed = 0;
const started = Date.now();
for (const c of cases) {
  const t0 = Date.now();
  let failures: string[];
  try { failures = await runCase(c); } catch (e) { failures = [`error: ${(e as Error).message}`]; }
  if (failures.length === 0) passed += 1;
  console.log(`${failures.length ? 'FAIL' : 'pass'}  ${c.id.padEnd(30)} ${((Date.now() - t0) / 1000).toFixed(1)}s${failures.length ? '\n      ' + failures.join('\n      ') : ''}`);
}
console.log(`\n${passed} of ${cases.length} passed in ${((Date.now() - started) / 1000).toFixed(0)}s against ${BASE}`);
process.exit(passed === cases.length ? 0 : 1);
