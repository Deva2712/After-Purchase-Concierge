import { ShopifyError } from './shopify.ts';

// One JSON line per tool call: { tool, ms, ok, ...ids }. Never log names, emails, addresses or order contents.
export function logCall(tool: string, startedAt: number, ok: boolean, ids: Record<string, string | undefined> = {}) {
  console.log(JSON.stringify({ tool, ms: Date.now() - startedAt, ok, ...ids }));
}

export type ToolOut = { text: string; structuredContent?: Record<string, unknown>; isError?: boolean };

/** Shape a tool result and turn any thrown error into one speakable sentence with isError: true. */
export async function runTool(tool: string, ids: Record<string, string | undefined>, fn: () => Promise<ToolOut>) {
  const t0 = Date.now();
  try {
    const out = await fn();
    logCall(tool, t0, !out.isError, ids);
    return {
      content: [{ type: 'text' as const, text: out.text }],
      structuredContent: out.structuredContent,
      ...(out.isError ? { isError: true } : {}),
    };
  } catch (err) {
    const e = err as Error;
    logCall(tool, t0, false, { ...ids, error: e.name });
    console.error(JSON.stringify({ tool, error: e.name, message: String(e.message).slice(0, 200) }));
    return { content: [{ type: 'text' as const, text: speakable(e) }], isError: true };
  }
}

// One sentence each (CLAUDE.md: errors to the customer are one speakable sentence).
function speakable(e: Error): string {
  if (e instanceof ShopifyError) return "I can't reach the store right now, please try again in a minute.";
  if (/Dynamo|Bedrock|ResourceNotFound|AccessDenied|Credentials/i.test(e.name + e.message)) return "I can't reach my records right now, please try again in a minute.";
  return 'Something went wrong on my side, please try again.';
}
