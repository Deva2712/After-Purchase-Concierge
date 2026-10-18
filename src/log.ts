// One JSON line per tool call: { tool, ms, ok, ...ids }. Never log names, emails, addresses or order contents.
export function logCall(tool: string, startedAt: number, ok: boolean, ids: Record<string, string | undefined> = {}) {
  console.log(JSON.stringify({ tool, ms: Date.now() - startedAt, ok, ...ids }));
}
