// Simulated Alexa+ brain. An ordinary MCP client of MCP_URL plus a Bedrock Converse tool-use loop.
// Rules (CLAUDE.md): never import src/tools from here; no tool names or scripted flow in the system prompt.
import { Router, type Request, type Response, type NextFunction } from 'express';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { BedrockRuntimeClient, ConverseCommand, type Message, type Tool } from '@aws-sdk/client-bedrock-runtime';

const SYSTEM_PROMPT =
  'You are a voice assistant on a smart display. Use the available tools to help the customer. ' +
  'Keep every reply to one or two short spoken sentences. Before any action that files, orders, returns or deletes something, ' +
  'ask the customer to confirm, and only then call the tool with confirmed set to true.';

const MAX_TOOL_CALLS_PER_TURN = 5;
const MAX_TURNS_PER_SESSION = 30;
const HISTORY_TURNS = 10;

export type ToolCallRecord = {
  name: string;
  arguments: Record<string, unknown>;
  ms: number;
  isError: boolean;
  text: string;
  structuredContent?: unknown;
  resourceUri?: string;
};

type Session = { messages: Message[]; turns: number };
// ponytail: in-memory sessions, lost on restart; move to DynamoDB if a conversation must survive a deploy.
const sessions = new Map<string, Session>();

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-west-2' });

async function connectMcp(): Promise<Client> {
  const client = new Client({ name: 'alexa-plus-simulator', version: '0.1.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(process.env.MCP_URL ?? 'http://localhost:3001/mcp')));
  return client;
}

function resourceUriOf(meta: Record<string, unknown> | undefined): string | undefined {
  const ui = meta?.ui as { resourceUri?: string } | undefined;
  return ui?.resourceUri ?? (meta?.['ui/resourceUri'] as string | undefined);
}

export async function callTool(name: string, args: Record<string, unknown>): Promise<ToolCallRecord> {
  const client = await connectMcp();
  try {
    const t0 = Date.now();
    const result = await client.callTool({ name, arguments: args });
    const first = (result.content as Array<{ type: string; text?: string }> | undefined)?.find(c => c.type === 'text');
    return {
      name,
      arguments: args,
      ms: Date.now() - t0,
      isError: result.isError === true,
      text: first?.text ?? '',
      structuredContent: result.structuredContent,
    };
  } finally {
    await client.close();
  }
}

export async function chat(sessionId: string, utterance: string): Promise<{ say: string; toolCalls: ToolCallRecord[] }> {
  const session = sessions.get(sessionId) ?? { messages: [], turns: 0 };
  sessions.set(sessionId, session);
  if (session.turns >= MAX_TURNS_PER_SESSION) {
    return { say: 'This session has reached its limit. Please start a new one.', toolCalls: [] };
  }
  session.turns += 1;

  const client = await connectMcp();
  const toolCalls: ToolCallRecord[] = [];
  try {
    const listed = await client.listTools();
    const uriByTool = new Map(listed.tools.map(t => [t.name, resourceUriOf(t._meta as Record<string, unknown> | undefined)]));
    const tools = listed.tools.map(t => ({
      toolSpec: {
        name: t.name,
        description: t.description ?? t.name,
        // Bedrock needs a JSON Schema object with type "object", even for tools with no inputs.
        inputSchema: { json: t.inputSchema ?? { type: 'object', properties: {} } },
      },
    }) as Tool.ToolSpecMember);

    session.messages.push({ role: 'user', content: [{ text: utterance }] });
    // Keep the last N turns; Bedrock needs the history to start with a user message.
    session.messages = session.messages.slice(-HISTORY_TURNS * 2);
    while (session.messages[0]?.role !== 'user') session.messages.shift();

    let say = '';
    for (let i = 0; i <= MAX_TOOL_CALLS_PER_TURN; i++) {
      const out = await bedrock.send(new ConverseCommand({
        modelId: process.env.SIM_MODEL_ID,
        system: [{ text: SYSTEM_PROMPT }],
        messages: session.messages,
        toolConfig: tools.length ? { tools } : undefined,
        inferenceConfig: { maxTokens: 300, temperature: 0 },
      }));
      const reply = out.output?.message;
      if (!reply) break;
      session.messages.push(reply);
      say = reply.content?.filter(c => c.text).map(c => c.text).join(' ').trim() ?? '';

      const uses = reply.content?.filter(c => c.toolUse).map(c => c.toolUse!) ?? [];
      if (out.stopReason !== 'tool_use' || uses.length === 0 || i === MAX_TOOL_CALLS_PER_TURN) break;

      const results: Message['content'] = [];
      for (const use of uses) {
        const args = (use.input ?? {}) as Record<string, unknown>;
        const t0 = Date.now();
        const res = await client.callTool({ name: use.name!, arguments: args });
        const first = (res.content as Array<{ type: string; text?: string }> | undefined)?.find(c => c.type === 'text');
        toolCalls.push({
          name: use.name!,
          arguments: args,
          ms: Date.now() - t0,
          isError: res.isError === true,
          text: first?.text ?? '',
          structuredContent: res.structuredContent,
          resourceUri: uriByTool.get(use.name!),
        });
        results.push({
          toolResult: {
            toolUseId: use.toolUseId,
            content: [{ text: first?.text || '(no text)' }],
            status: res.isError ? 'error' : 'success',
          },
        });
      }
      session.messages.push({ role: 'user', content: results });
    }
    return { say: say || 'Sorry, I did not catch that.', toolCalls };
  } finally {
    await client.close();
  }
}

function requireCode(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.SIM_ACCESS_CODE;
  if (!expected) { res.status(503).json({ error: 'simulator not configured' }); return; }
  const given = req.header('x-sim-code') ?? (req.query.code as string | undefined);
  if (given !== expected) { res.status(401).json({ error: 'access code required' }); return; }
  next();
}

export function simRouter(): Router {
  const r = Router();
  r.get('/', (_req, res) => res.sendFile(new URL('./index.html', import.meta.url).pathname));
  r.use(requireCode);
  r.post('/chat', async (req, res) => {
    const { sessionId, utterance } = req.body ?? {};
    if (typeof sessionId !== 'string' || typeof utterance !== 'string') {
      res.status(400).json({ error: 'sessionId and utterance are required' }); return;
    }
    try {
      res.json(await chat(sessionId, utterance));
    } catch (err) {
      console.error(JSON.stringify({ event: 'sim_chat_error', name: (err as Error).name }));
      res.status(502).json({ say: 'Sorry, something went wrong on my side. Please try again.', toolCalls: [] });
    }
  });
  return r;
}
