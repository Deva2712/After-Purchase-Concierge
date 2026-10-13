# AGENTS.md

Guidance for Codex working in this repo.

## What this is

After-Purchase Concierge: a self-hosted MCP server for the Amazon Developer Hackathon (Alexa+ track, AWS Builder mini challenge), built to be an Alexa+ MCP add-on. Deadline 24 Oct 2026 00:30 IST; we treat 23 Oct 18:00 IST as the deadline. The deployment must stay up until judging ends on 20 Nov 2026. A merchant's customer says "Alexa, my blender stopped working"; we troubleshoot from the product manual, then pick and file the cheapest resolution (return, warranty claim, or part) with cards on the Echo Show.

The Alexa+ side is simulated. Amazon's MCP Toolkit is available to select partners only and US only, so we cannot register with real Alexa+. The hackathon rules allow a simulated Alexa+ experience in a web app. Our simulator at `/sim` is an ordinary MCP client of the server; the MCP server is the product and the required technology.

Read in this order when you need context: `docs/IMPLEMENTATION_PLAN.md` (what to do this week), `docs/ARCHITECTURE.md` (how it fits), `docs/SRS.md` (what must be true), `FRICTION_LOG.md` (what already went wrong).

## Stack

- Node 24+, TypeScript, ESM.
- MCP: `@modelcontextprotocol/server` v2, `@modelcontextprotocol/node`, `@modelcontextprotocol/express`, `@modelcontextprotocol/client` (simulator), `@modelcontextprotocol/ext-apps` (MCP Apps UI), `zod` v4. Stateless Streamable HTTP at `POST /mcp`, new `McpServer` per request. The v2 SDK is a beta: pin exact versions, no `^` ranges.
- AWS, region us-west-2: ECS Express Mode on Fargate (hosting; App Runner is closed to new customers), ECR, Bedrock Knowledge Base (manuals), Bedrock Converse (simulator agent), DynamoDB table `concierge`, S3 (PDFs). SDK v3 clients only.
- Shopify Admin GraphQL API against a development store. The app is created in the Dev Dashboard; the token comes from the client credentials grant and expires after 24 hours, so `src/shopify.ts` refreshes it.
- UI: vanilla JS, Vite + `vite-plugin-singlefile`, one HTML file per card in `ui/`.
- Simulator: `sim/`, vanilla JS page plus `sim/agent.ts`. Served by the same process at `/sim`.
- Tests: `node:test`. No jest, no vitest.
- Optional, only if Toolkit access is granted: `@alexa-ai/cli` (`alexa-ai`), `@alexa-ai/addon-local-inspector`, Alexa Add-on Agent Skill. macOS and Ubuntu only; use WSL on this Windows machine.

## Commands

```
npm run dev            # tsx watch src/main.ts on :3001; simulator at http://localhost:3001/sim
npm run build          # tsc + vite single-file build of ui/ into dist/
npm test               # node --test on test/*.test.ts: unit tests, no network
npm run test:e2e       # test/*.e2e.ts against BASE_URL (default localhost:3001) and the real store, KB and table
npm run test:cases     # the 20 utterances in test/cases.json through POST /sim/chat
npm run precompute     # scripts/precompute.ts: rebuild STEPS# cache from the Knowledge Base
npm run seed           # scripts/seed-shopify.ts: products, customer, fulfilled orders dated relative to today
npm run deploy         # docker build, push to ECR, update the ECS Express Mode service
npx @modelcontextprotocol/inspector http://localhost:3001/mcp
```

Environment variables: `SHOPIFY_STORE`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `KB_ID`, `TABLE_NAME`, `DEMO_CUSTOMER_EMAIL`, `MCP_URL`, `SIM_MODEL_ID`, `SIM_ACCESS_CODE`, `AWS_REGION`, `PORT`. Never commit them; `.env` is gitignored.

## Hard constraints (do not "optimise" these away)

The first group comes from the hackathon rules. The second comes from Alexa+; nothing enforces them in the simulator, but we keep them so the server is ready to onboard.

Hackathon
- MCP spec 2025-11-25 or later, Streamable HTTP only, and the repo must call it at runtime (imported and used, not just mentioned).
- The simulator reaches tools only through `MCP_URL` over HTTP. Never import `src/tools` from `sim/`. Never put tool names or a scripted flow in the agent's system prompt; routing comes from tool descriptions.
- Say "simulated Alexa+ experience" wherever the surface is described. Do not imply it is real Alexa+.
- MIT licence in a standard root `LICENSE` file so GitHub shows it in the About section.

Alexa+
- Round-trip tool response under 500 ms. `troubleshoot` must read precomputed steps from DynamoDB; the live Bedrock `Retrieve` path is the fallback only.
- UI resources are `ui://concierge/<view>.html`, `mimeType: RESOURCE_MIME_TYPE`, linked from the tool with `_meta.ui.resourceUri`. Cards must work on Small (10" and below) and Large (11" and above) frames.
- Every tool result needs `content[0].text` that stands alone for voice-only devices, plus `structuredContent` for the card.

Ours
- Write tools (`create_return`, `file_warranty_claim`, `order_part`, `delete_my_data`) require `confirmed: true`. Without it, return a non-error message asking for confirmation. Never remove this.
- Idempotency key on every write: `sha256(orderId + lineItemId + action)`. A repeated "yes" must not file twice.
- No PII in logs: IDs and hashes only.
- No account linking in this build; identity is `DEMO_CUSTOMER_EMAIL`. Do not start building OAuth unless `docs/IMPLEMENTATION_PLAN.md` cut list changes.

## Conventions

- One file per tool in `src/tools/`. The tool file validates input, calls one module (`shopify`, `kb`, `db`, `policy`), shapes `{ content, structuredContent }`. Business rules live in `src/policy.ts` only.
- `src/policy.ts` is pure (no imports of AWS or Shopify). Every branch has a test in `test/policy.test.ts`.
- Tool descriptions state when to use and when not to use the tool. Keep them under 2 sentences; the client's model reads them to decide routing.
- Errors to the customer are one speakable sentence with `isError: true`. Stack traces go to logs.
- Prefer stdlib (`node:test`, `node:crypto`, `fetch`) over new dependencies. Adding a dependency needs a one-line reason in the PR/commit.
- Mark deliberate shortcuts with a `// ponytail:` comment naming the ceiling and the upgrade path.
- Commit messages: imperative, under 72 chars, body says why.

## When you change tools

1. Update the tool file and its zod schema.
2. Update the tool table in `docs/ARCHITECTURE.md` section 4 and the matching FR in `docs/SRS.md`.
3. `npm test`, then `npm run build`, then `npm run deploy`.
4. Run the flow once in the simulator, in both frame sizes if the tool has a `ui://` resource.
5. Only if onboarded to real Alexa+: `alexa-ai deploy` (Alexa+ only refreshes tool definitions on deploy) and re-run `addon-local-inspector`.

## When any tooling misbehaves

Add an entry to `FRICTION_LOG.md` immediately (task, steps, expected, actual, severity, workaround, suggestion). This covers every tool we touch: MCP SDKs, AWS services, Shopify, and the Alexa+ Toolkit and its docs. It is worth up to 10% of the judging score. Record only what actually happened; do not write entries for steps nobody has tried.

## Submission requirements to keep in mind

- Product feedback is required for every tool, API or SDK used, and the AWS Builder entry needs the AWS services and how we used them described there.
- Demo video: under 3 minutes, English, public on YouTube or Vimeo, no third-party trademarks or copyrighted music. Use invented product names in demo data and cards, not real brands.
- Judges need testing instructions: simulator URL, access code, example utterances.
- Demo orders drift out of their return windows; `npm run seed` must be re-run before and during judging (9 to 20 Nov).

## Out of scope (do not build)

Technician booking, account linking/OAuth, Ring or Bee integration, multi-merchant support, non-English locales, PDF image extraction, a web dashboard, simulator features beyond what the demo needs. If asked, point at the cut list in `docs/IMPLEMENTATION_PLAN.md`.

## Optional: real Alexa+ onboarding

Only if MCP Toolkit access is granted, and never ahead of the submission work. The Amazon docs recommend onboarding through their Agent Skill running inside Codex. When it is installed, use it for `alexa-ai new mcp`, `addon.json` drafting, media validation, deploy, and for Local Inspector runs. Follow its phases; do not hand-edit what it generates unless the plan says so. Before anything npm-related touching `@alexa-ai/*`:
```
aws codeartifact login --tool npm --domain alexa-ai --repository npm-packages --domain-owner 372468808636 --region us-west-2 --namespace @alexa-ai --profile alexa-ai
```
(token lasts 12 hours).
