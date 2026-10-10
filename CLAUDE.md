# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is

After-Purchase Concierge: an Alexa+ MCP add-on for the Amazon Developer Hackathon (Alexa+ track, AWS Builder mini challenge). Deadline 24 Oct 2026 00:30 IST; we treat 23 Oct 18:00 IST as the deadline. A merchant's customer says "Alexa, my blender stopped working"; we troubleshoot from the real manual, then pick and file the cheapest resolution (return, warranty claim, or part) with cards on the Echo Show.

Read in this order when you need context: `IMPLEMENTATION_PLAN.md` (what to do this week), `ARCHITECTURE.md` (how it fits), `SRS.md` (what must be true), `FRICTION_LOG.md` (what already went wrong).

## Stack

- Node 24+, TypeScript, ESM.
- MCP: `@modelcontextprotocol/server` v2, `@modelcontextprotocol/node`, `@modelcontextprotocol/express`, `@modelcontextprotocol/ext-apps` (MCP Apps UI), `zod` v4. Stateless Streamable HTTP at `POST /mcp`, new `McpServer` per request.
- AWS, region us-west-2: App Runner (hosting), Bedrock Knowledge Base (manuals), DynamoDB table `concierge`, S3 (PDFs). SDK v3 clients only.
- Shopify Admin GraphQL API against a development store.
- UI: vanilla JS, Vite + `vite-plugin-singlefile`, one HTML file per card in `ui/`.
- Tests: `node:test`. No jest, no vitest.
- Alexa tooling: `@alexa-ai/cli` (`alexa-ai`), `@alexa-ai/addon-local-inspector`, Alexa Add-on Agent Skill.

## Commands

```
npm run dev            # tsx watch src/main.ts on :3001
npm run build          # tsc + vite single-file build of ui/ into dist/
npm test               # node --test
npm run precompute     # scripts/precompute.ts: rebuild STEPS# cache from the Knowledge Base
npm run seed           # scripts/seed-shopify.ts: products, customer, fulfilled orders
npx @modelcontextprotocol/inspector http://localhost:3001/mcp
addon-local-inspector https://<app-runner-url>/mcp
alexa-ai deploy        # after ANY tool name/description/schema change; Alexa+ only refreshes on deploy
```

Daily before anything npm-related touching `@alexa-ai/*`:
```
aws codeartifact login --tool npm --domain alexa-ai --repository npm-packages --domain-owner 372468808636 --region us-west-2 --namespace @alexa-ai --profile alexa-ai
```
(token lasts 12 hours).

Environment variables: `SHOPIFY_STORE`, `SHOPIFY_TOKEN`, `KB_ID`, `TABLE_NAME`, `DEMO_CUSTOMER_EMAIL`, `AWS_REGION`, `PORT`. Never commit them; `.env` is gitignored.

## Hard constraints from Alexa+ (do not "optimise" these away)

- MCP spec 2025-11-25 or later, Streamable HTTP only. SSE transport is rejected.
- Round-trip tool response under 500 ms. `troubleshoot` must read precomputed steps from DynamoDB; the live Bedrock `Retrieve` path is the fallback only.
- UI resources are `ui://concierge/<view>.html`, `mimeType: RESOURCE_MIME_TYPE`, linked from the tool with `_meta.ui.resourceUri`. Cards must work on Small (10" and below) and Large (11" and above) frames.
- Every tool result needs `content[0].text` that stands alone for voice-only devices, plus `structuredContent` for the card.
- Write tools (`create_return`, `file_warranty_claim`, `order_part`, `delete_my_data`) require `confirmed: true`. Without it, return a non-error message asking for confirmation. Never remove this.
- Idempotency key on every write: `sha256(orderId + lineItemId + action)`. A repeated "yes" must not file twice.
- No PII in logs: IDs and hashes only.
- No account linking in this build; identity is `DEMO_CUSTOMER_EMAIL`. Do not start building OAuth unless `IMPLEMENTATION_PLAN.md` cut list changes.

## Conventions

- One file per tool in `src/tools/`. The tool file validates input, calls one module (`shopify`, `kb`, `db`, `policy`), shapes `{ content, structuredContent }`. Business rules live in `src/policy.ts` only.
- `src/policy.ts` is pure (no imports of AWS or Shopify). Every branch has a test in `test/policy.test.ts`.
- Tool descriptions state when to use and when not to use the tool. Keep them under 2 sentences; Alexa+ reads them to decide routing.
- Errors to the customer are one speakable sentence with `isError: true`. Stack traces go to logs.
- Prefer stdlib (`node:test`, `node:crypto`, `fetch`) over new dependencies. Adding a dependency needs a one-line reason in the PR/commit.
- Mark deliberate shortcuts with a `// ponytail:` comment naming the ceiling and the upgrade path.
- Commit messages: imperative, under 72 chars, body says why.

## When you change tools

1. Update the tool file and its zod schema.
2. Update the tool table in `ARCHITECTURE.md` section 4 and the matching FR in `SRS.md`.
3. `npm test`, then `npm run build`, then `alexa-ai deploy`.
4. Re-run `addon-local-inspector` if the tool has a `ui://` resource.

## When something in the Amazon tooling misbehaves

Add an entry to `FRICTION_LOG.md` immediately (task, steps, expected, actual, severity, workaround, suggestion). This is worth up to 10% of the judging score; it is not optional.

## Out of scope (do not build)

Technician booking, account linking/OAuth, Ring or Bee integration, multi-merchant support, non-English locales, PDF image extraction, a web dashboard. If asked, point at the cut list in `IMPLEMENTATION_PLAN.md`.

## Alexa Add-on Agent Skill

The Amazon docs recommend onboarding through their Agent Skill running inside Claude Code. When it is installed, use it for `alexa-ai new mcp`, `addon.json` drafting, media validation, deploy, and for Local Inspector runs. Follow its phases; do not hand-edit what it generates unless the plan says so.
