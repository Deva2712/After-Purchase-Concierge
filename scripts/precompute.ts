// Build the STEPS# cache: for every (product, known symptom) pair, retrieve manual chunks from the Knowledge Base,
// ask a Bedrock model for strict JSON steps with the source page, validate, and store in DynamoDB.
// This is how `troubleshoot` stays well under the 500 ms budget. Re-run after any manual change.
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { retrieve } from '../src/kb.ts';
import { putSteps, type Step, type Source } from '../src/db.ts';
import { products } from '../src/products.ts';

try { process.loadEnvFile(); } catch { /* use the environment */ }

// ponytail: Retrieve + Converse instead of RetrieveAndGenerate so a plain model ID works (no modelArn/inference-profile ARN juggling).
const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-west-2' });
const MODEL = process.env.PRECOMPUTE_MODEL_ID ?? process.env.SIM_MODEL_ID;
if (!MODEL) throw new Error('SIM_MODEL_ID (or PRECOMPUTE_MODEL_ID) is not set');

const SYSTEM = 'You turn excerpts from a product manual into troubleshooting steps for a voice assistant. Answer with JSON only, no prose and no code fences.';

function prompt(title: string, symptom: string, aliases: string[], chunks: Array<{ text: string; document: string; page?: number }>): string {
  const excerpts = chunks.map((c, i) => `[${i + 1}] (document: ${c.document}, page: ${c.page ?? 'unknown'})\n${c.text}`).join('\n\n');
  return `Product: ${title}\nProblem: ${symptom} (customers also say: ${aliases.join('; ')})\n\nManual excerpts:\n${excerpts}\n\n` +
    'Return {"steps":[{"title":"...","detail":"..."}],"source":{"document":"...","page":N}} with 1 to 4 steps taken only from the excerpts, ' +
    'in the order the manual gives them. "title" is 2 to 6 words. "detail" is one or two short sentences that sound natural when spoken aloud, ' +
    'with no step numbers. "source" is the document and page the steps came from.';
}

function parse(text: string): { steps: Step[]; source: Source } | undefined {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return undefined;
  let j: { steps?: Array<{ title?: unknown; detail?: unknown }>; source?: { document?: unknown; page?: unknown } };
  try { j = JSON.parse(m[0]); } catch { return undefined; }
  if (!Array.isArray(j.steps) || j.steps.length < 1 || j.steps.length > 4) return undefined;
  if (!j.steps.every(s => typeof s.title === 'string' && typeof s.detail === 'string' && s.detail.length > 0)) return undefined;
  const page = Number(j.source?.page);
  if (typeof j.source?.document !== 'string' || !Number.isFinite(page)) return undefined;
  return {
    steps: j.steps.map((s, i) => ({ n: i + 1, title: String(s.title).trim(), detail: String(s.detail).trim() })),
    source: { document: j.source.document, page },
  };
}

async function generate(productId: string, symptomKey: string): Promise<{ steps: Step[]; source: Source }> {
  const p = products[productId];
  const aliases = p.symptoms[symptomKey].aliases;
  const chunks = await retrieve(productId, `${p.title} ${symptomKey.replace(/-/g, ' ')}: ${aliases.slice(0, 3).join(', ')}`, 6);
  if (chunks.length === 0) throw new Error(`no chunks for ${productId}/${symptomKey}: is the Knowledge Base synced with the metadata sidecars?`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const out = await bedrock.send(new ConverseCommand({
      modelId: MODEL,
      system: [{ text: SYSTEM }],
      messages: [{ role: 'user', content: [{ text: prompt(p.title, symptomKey.replace(/-/g, ' '), aliases, chunks) }] }],
      inferenceConfig: { maxTokens: 800, temperature: 0 },
    }));
    const text = out.output?.message?.content?.map(c => c.text ?? '').join('') ?? '';
    const parsed = parse(text);
    if (parsed) return parsed;
    console.warn(`attempt ${attempt} for ${productId}/${symptomKey} was not valid JSON steps`);
  }
  throw new Error(`could not get valid steps for ${productId}/${symptomKey} after 3 attempts`);
}

async function main() {
  let ok = 0;
  const failures: string[] = [];
  for (const [productId, p] of Object.entries(products)) {
    for (const symptomKey of Object.keys(p.symptoms)) {
      try {
        const r = await generate(productId, symptomKey);
        await putSteps(productId, symptomKey, r);
        ok += 1;
        console.log(`${productId}/${symptomKey}: ${r.steps.length} steps from ${r.source.document} p.${r.source.page}`);
      } catch (e) {
        failures.push(`${productId}/${symptomKey}: ${(e as Error).message}`);
      }
    }
  }
  console.log(`stored ${ok} STEPS# items`);
  if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); });
