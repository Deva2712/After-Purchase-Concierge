// Bedrock Knowledge Base retrieval over the product manuals. Live path for troubleshoot on a cache miss,
// and the chunk source for scripts/precompute.ts.
import { BedrockAgentRuntimeClient, RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import type { Step, Source } from './db.ts';

const kb = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION ?? 'us-west-2' });

export type Chunk = { text: string; document: string; page?: number; score?: number };

/** Top chunks for a product, filtered by the productId metadata attribute from the .metadata.json sidecars. */
export async function retrieve(productId: string, query: string, numberOfResults = 4): Promise<Chunk[]> {
  const r = await kb.send(new RetrieveCommand({
    knowledgeBaseId: process.env.KB_ID,
    retrievalQuery: { text: query },
    retrievalConfiguration: {
      vectorSearchConfiguration: { numberOfResults, filter: { equals: { key: 'productId', value: productId } } },
    },
  }));
  return (r.retrievalResults ?? []).map(x => {
    const uri = x.location?.s3Location?.uri ?? '';
    const page = Number((x.metadata as Record<string, unknown> | undefined)?.['x-amz-bedrock-kb-document-page-number']);
    return { text: x.content?.text ?? '', document: uri.split('/').pop() ?? uri, page: Number.isFinite(page) ? page : undefined, score: x.score };
  });
}

const IMPERATIVE = /^(check|press|hold|unplug|plug|fill|clean|wipe|replace|make sure|switch|turn|reset|descale|remove|tighten|look|charge|put|lift|close|open|forget|keep|empty|rotate|add|stop|let|reduce|boil|pull|push|try|contact|on your|with the)/i;

/** Live fallback formatting: pick up to four instruction-like sentences from the chunks. Slower and rougher than the precomputed cache. */
export function chunksToSteps(chunks: Chunk[]): { steps: Step[]; source: Source } {
  const sentences = chunks.flatMap(c => c.text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z])/));
  const picked = sentences.filter(s => IMPERATIVE.test(s.trim()) && s.length > 20).slice(0, 4);
  const steps = (picked.length ? picked : sentences.slice(0, 4)).map((s, i) => ({
    n: i + 1,
    title: s.trim().split(/[,.:;]/)[0].split(' ').slice(0, 8).join(' '),
    detail: s.trim(),
  }));
  const top = chunks[0];
  return { steps, source: { document: top?.document ?? 'manual', page: top?.page ?? 0 } };
}

export async function retrieveSteps(productId: string, symptom: string): Promise<{ steps: Step[]; source: Source }> {
  const chunks = await retrieve(productId, symptom, 4);
  return chunksToSteps(chunks);
}
