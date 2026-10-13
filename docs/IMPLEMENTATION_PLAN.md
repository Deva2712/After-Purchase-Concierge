# After-Purchase Concierge: Phase-wise Implementation Plan

Alexa+ track, Amazon Developer Hackathon ("Build, Ship, Shape"). Idea A1 from `Amazon_Hackathon_Idea_Analysis.docx` (score 8.25, best Alexa+ pick). Mini challenge: AWS Builder.

| Item | Value |
|---|---|
| Plan written | 10 Oct 2026 |
| Revised | 11 Oct 2026 (after checking the official rules and the Amazon and AWS docs; see "What changed") |
| Hard deadline | 24 Oct 2026, 00:30 IST (23 Oct, 12:00 pm Pacific) |
| Working deadline | 23 Oct 2026, 18:00 IST |
| Days available | 12 |
| Feature freeze | 18 Oct 2026, 22:00 IST |
| Judging period | 9 to 20 Nov 2026. The deployment must stay up until 20 Nov. |
| Winners announced | On or around 3 Dec 2026 |

## The one-sentence pitch

"Alexa, my blender stopped working." Alexa+ walks the customer through the fix from the product manual on the Echo Show; if that fails it picks the cheapest path that solves the problem (return if in window, else warranty claim, else replacement part) and files it, all in under a minute, no app opened.

## What changed on 11 Oct

| Was | Now | Why |
|---|---|---|
| Real Alexa+ through the MCP Toolkit is the plan; a simulated web app is the fallback | The simulated Alexa+ web app is the demo surface; real Alexa+ onboarding is an optional extra | Amazon's docs say the MCP Toolkit is "available to select partners only" and US only. The hackathon rules do not require it: they ask for a self-hosted MCP server and explicitly allow simulating the Alexa+ experience in a web app. |
| Host on AWS App Runner | Host on Amazon ECS Express Mode (Fargate) | App Runner closed to new customers on 30 Apr 2026. |
| Shopify custom app created in the store admin, static `SHOPIFY_TOKEN` | App created in the Shopify Dev Dashboard, token fetched with the client credentials grant and refreshed | Admin-created custom apps can no longer be created since 1 Jan 2026; client credentials tokens expire after 24 hours. |
| Server up through 24 Oct | Server up through 20 Nov | The rules require the project to be available for testing until the judging period ends. |
| Hackathon AWS credits assumed possible | Budget is the roughly USD 50 of AWS credits we already have | Hackathon credit requests closed on 7 Oct. Hosting until 20 Nov could use all of it, so gate G4 checks the real cost after two days. |
| Friction log is about the Alexa tooling | Friction log covers every tool we actually touch: MCP SDK, MCP Apps SDK, Bedrock, ECS Express Mode, Shopify, and the Toolkit access gating | We may never get to use the Alexa tooling. |

## Rules for the whole build

1. One persona, one flow, three products. Everything else is cut.
2. The MCP server is the product and the required technology: spec 2025-11-25 or later, Streamable HTTP, called at runtime in the repo. The simulator is only the client that shows it working. Nothing in the server may depend on the simulator.
3. Every phase ends with something that runs end to end, even if ugly.
4. Friction log entries are written the moment friction happens, not at the end (optional, up to 10% judging bonus).
5. Nothing destructive (return, claim, part order) happens without an explicit confirmation turn.
6. Keep the Alexa+ hard constraints (500 ms, standalone voice text, Small and Large frames) even though no Alexa+ host enforces them here. They are what makes the server ready to onboard, and the judges are Alexa solutions architects.

## What the judges score (from the official rules)

Stage one is pass or fail: the project fits the theme and reasonably applies the required technology. Stage two is four equally weighted criteria: Tech Implementation, Design, Potential Impact, Quality of the Idea. The friction log bonus (up to 10%) is assessed in stage one and applied in stage two.

The rules name what counts as creative for Alexa+: an agentic workflow that orchestrates across services, state kept across sessions, purchasing, media support such as cards, MCP Apps, Agent Skills. They name "basic MCP wrapper around an existing API" and "single-turn Q&A bot" as obvious. So the video and the description lead with the decision engine and the manual-based troubleshooting, not with "we call Shopify".

For AWS Builder the rules name "single Bedrock call" and "S3 for storage" as obvious and multi-service pipelines as creative. We use Bedrock Knowledge Bases, Bedrock Converse (the simulator's agent), DynamoDB, S3 Vectors and ECS; each integration is documented in the README and in the product feedback answer.

## How testing works

Every phase below has a Tests table. A phase is not done until every row in its table passes. Test IDs are `T<phase>.<n>` so a failure can be named in `PROGRESS.md` and the friction log.

| Command | What it runs | Needs |
|---|---|---|
| `npm test` | Unit tests: pure logic and anything that can use a fake `fetch`. Fast, no network. Files `test/*.test.ts`. | nothing |
| `npm run test:e2e` | Integration tests against a running server and the real Shopify store, Knowledge Base and table. Files `test/*.e2e.ts`. Targets `BASE_URL` (default `http://localhost:3001`). | `.env`, `SIM_ACCESS_CODE` |
| `npm run test:cases` | The 20 utterances in `test/cases.json`, sent through `POST /sim/chat`. | same as e2e, spends Bedrock tokens |

Rules
- Run e2e locally first, then again with `BASE_URL=https://<service-url>` after each deploy. Both must pass.
- Tests that file a return or a claim change real data in the Shopify dev store and DynamoDB. They run against a dedicated test order where possible, call `delete_my_data` at the end, and `npm run seed` restores the store afterwards.
- Rows marked "manual" are checks a person does and ticks off; everything else is a command with a pass or fail result.
- Keep each suite small. A phase's suite covers what that phase built and nothing else; a test that does not catch a real way the phase could be broken is not written.

## How optimisation works

Every phase also has an Optimise step. The order inside a phase is always: build, get the Tests table green, then optimise, then run the same tests again.

- Optimise only after the phase's tests pass, never before.
- Time-box it: at most 45 minutes per phase. When the time is up, stop.
- Measure first. Write the number down before and after (ms, KB, seconds, dollars). Keep a change only if the number improved and the tests still pass; otherwise revert it.
- No new features and no new dependencies in an Optimise step.

## How to run this plan with Claude

The plan is written so that someone who has never seen the project can finish it by doing one phase at a time with Claude Code. Nothing outside this file, `CLAUDE.md`, `docs/ARCHITECTURE.md` and `docs/SRS.md` is needed.

Start each phase with this prompt, changing only the number:

```
Read CLAUDE.md and docs/IMPLEMENTATION_PLAN.md. Do Phase <N> only.
Follow its tasks top to bottom and build to the contracts in the Appendix.
Stop at every [HUMAN] step and ask me for what you need.
Write the phase's tests as you build, not after.
When every row of the phase's Tests table passes, do the Optimise step and re-run the tests.
Then update PROGRESS.md, add any friction log entries, and commit.
Do not start the next phase.
```

The loop inside every phase

1. Check "Needs before starting". If anything is missing, stop and get it; do not work around it.
2. Do the tasks in the order written. Tasks marked `[HUMAN]` need a person (creating an account, clicking in a console, speaking into a microphone, judging how something looks). Everything else Claude can do.
3. Write each test in the Tests table next to the code it checks. Run it. A test that has never been seen to fail is not trusted: break the code once on purpose, see the test go red, then restore it.
4. When the whole table is green locally, deploy and run it again against the deployed URL.
5. Do the Optimise step, then run the table again.
6. Tick the task boxes in this file, write the phase's line in `PROGRESS.md`, commit with the message given in the phase.
7. If a test cannot be made to pass in 45 minutes, follow the phase's "If a test fails" list. If that does not fix it, write a friction log entry, take the fallback named there, and say so in `PROGRESS.md`.

Rules that keep this safe to follow blindly

- Never start phase N+1 while a row in phase N's table is red, unless that row's fallback was taken and recorded.
- Never change a contract in the Appendix without changing the docs that state it (`ARCHITECTURE.md` section 4, the matching FR in `SRS.md`) in the same commit.
- Never put a secret in a file that is committed. Secrets live only in `.env` and in the deployed service's configuration.
- When this plan and an SDK's current documentation disagree about an import name or a function signature, the SDK documentation wins. When they disagree about behaviour (what a tool returns, what must be confirmed), this plan wins.
- Dates are targets. If a phase finishes late, the next phase starts late; the feature freeze and the working deadline do not move. Cut from the cut list instead.

`PROGRESS.md` format, one line per working session:

```
2026-10-12 | Phase 1 | T1.1-T1.6 green locally, T1.7 red (deploy role) | next: fix task role, rerun T1.7
```

## Decision gates

Each gate has a date, a question, and a default that is taken without discussion if the answer is not clearly "yes" by then.

| Gate | By | Question | If yes | If no (default) |
|---|---|---|---|---|
| G1 Manuals | 11 Oct | Do we have real manufacturer manuals we are allowed to redistribute in a public repo and show on video? | Use them | Write our own 2 to 4 page text PDF manual for each of the three invented products and commit them in `manuals/`. We own them, a judge can rebuild the Knowledge Base from the repo, and no brand appears in the video. Say "product manuals", not "manufacturer manuals", everywhere. |
| G2 Vector store | 13 Oct | Does Knowledge Base quick create offer S3 Vectors in us-west-2? | Use it | OpenSearch Serverless, and re-check the cost at G4 |
| G3 Backdated orders | 13 Oct | Can the seed script create Shopify orders with a past `processedAt` date and mark them fulfilled? | Purchase date comes from Shopify | Purchase date comes from `config/demo-orders.json` (days-ago per order), read by `src/shopify.ts`. Mark it with a `// ponytail:` comment. |
| G4 Hosting cost | 13 Oct, 22:00 IST | After 48 hours of the Phase 1 service running, is the projected AWS spend to 20 Nov at least USD 10 below the credits we have (about USD 50)? | Stay on ECS Express Mode | Move the same container image to AWS Lambda with a Function URL and the Lambda Web Adapter, add a 5-minute scheduled ping to `/healthz`, delete the ECS service and load balancer. Re-run T1.1 to T1.9. |
| G5 Agent model | 16 Oct | Does the small model set in `SIM_MODEL_ID` pick the right tool in the Phase 2 flow three times out of three? | Keep it | Switch `SIM_MODEL_ID` to the next larger Claude model on Bedrock; change nothing else |
| G6 Feature freeze | 18 Oct, 22:00 IST | Is every Phase 3 test green? | Go to Phase 4 | Cut what is red: first `order_part` (FR-12 is "should"), then speech input, then the Large frame polish. Never cut `confirmed: true`, idempotency or the voice-only text. |
| G7 Toolkit access | 18 Oct | Has Amazon granted MCP Toolkit access? | Do the optional section after Phase 4 | Stop asking; the plan is unchanged |

## Phase overview

| Phase | Dates | Goal | Done when |
|---|---|---|---|
| 0. Accounts and environment | 11 Oct | Every account and credential works | Shopify Admin API returns products, Bedrock model access works, pinned SDK versions install |
| 1. Skeleton, deployed | 11 to 13 Oct | Hello-world MCP server on a public HTTPS URL, called by the simulator | Typing "ping" in the deployed simulator returns text that came through `POST /mcp` |
| 2. Data and decision engine | 13 to 16 Oct | Real orders, product manuals, policy logic | `identify_product`, `troubleshoot`, `get_resolution_options` work on real data with tests passing |
| 3. Experience | 16 to 18 Oct | MCP Apps cards, write actions, simulator polish | Full demo flow runs in the simulator with cards in both frame sizes |
| 4. Hardening | 19 to 20 Oct | Reliable, fast, private | 20-case test set green, latency budget met, privacy controls done |
| 5. Packaging | 21 Oct | Repo a judge can run | README, licence, diagram, setup, product feedback and friction log drafted |
| 6. Video | 22 Oct | Under 3 minutes, public | Uploaded and link verified from an incognito window |
| 7. Submit | 23 Oct | Submitted by 18:00 IST | Devpost confirmation email received |
| 8. Keep alive | 24 Oct to 20 Nov | Judges can test whenever they choose | Weekly check passes; service deleted after 20 Nov |

Critical path: none of it depends on Amazon granting anything. The first risky step is the ECS Express Mode deploy in Phase 1; do it on day one with the hello-world server.

---

## Phase 0: Accounts and environment (11 Oct)

Goal: remove every "can I even do this?" question before writing product code.

Needs before starting: a machine with admin rights, a card or credits on an AWS account, an email address for the Shopify and demo customer accounts, write access to the GitHub repo.

Tasks (top to bottom)
- [ ] `[HUMAN]` AWS account, region us-west-2. Create an IAM user with programmatic access and a named CLI profile (`aws configure --profile concierge`). Set a billing alarm at USD 40 and note the current credit balance in `PROGRESS.md`.
- [ ] `[HUMAN]` Bedrock console, us-west-2: confirm access to one small Claude model (used by the precompute step and by the simulator's agent; this becomes `SIM_MODEL_ID`) and the Titan text embeddings model the Knowledge Base will use. Open the Knowledge Base "quick create" screen and note whether S3 Vectors is offered (gate G2). Do not create the Knowledge Base yet.
- [ ] `[HUMAN]` Shopify: in the Dev Dashboard, create the development store from the Dev stores page (not from the Shopify admin: the store and the app must be in the same organization or the token call fails with `shop_not_permitted`). Create the app in the same Dev Dashboard (admin-created custom apps no longer exist). On the app version select these scopes: `read_orders`, `write_orders`, `read_customers`, `write_customers`, `read_products`, `write_products`, `write_returns`, `write_draft_orders`, plus the fulfilment scope the seed script turns out to need. The three `write_` scopes for orders, customers and products exist only so `scripts/seed-shopify.ts` can create the demo data. Release the version and install the app on the dev store. Copy the client ID and client secret.
- [ ] `[HUMAN]` Install Node 24+, Docker Desktop, the AWS CLI v2 and the GitHub CLI.
- [ ] Create `.env` (gitignored) with the values known so far: `AWS_REGION=us-west-2`, `AWS_PROFILE=concierge`, `SHOPIFY_STORE`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `DEMO_CUSTOMER_EMAIL`, `SIM_MODEL_ID`, `SIM_ACCESS_CODE` (any long random string), `PORT=3001`. The Appendix lists every variable and the phase that fills it.
- [ ] Get an Admin API token with the client credentials grant (`POST https://<store>.myshopify.com/admin/oauth/access_token` with `grant_type=client_credentials`, `client_id`, `client_secret`) and confirm a GraphQL call with the `X-Shopify-Access-Token` header answers. Log anything that does not match the docs in the friction log.
- [ ] `npm init`, TypeScript, ESM. Check the current MCP SDK v2 versions (`npm view @modelcontextprotocol/server dist-tags`). v2 is still a beta, so every `@modelcontextprotocol/*` package is pinned to an exact version in `package.json` (no `^`). Add the npm scripts named in the Appendix, even if some only print "not built yet".
- [ ] Manuals (gate G1, default): write one text PDF manual per demo product in the Appendix's demo data table, 2 to 4 pages each, with a troubleshooting section that covers every symptom listed for that product and a warranty page. Save as `manuals/<productId>.pdf` with a `manuals/<productId>.pdf.metadata.json` sidecar: `{ "metadataAttributes": { "productId": "<productId>", "docType": "manual" } }`.
- [ ] Repo: MIT licence in a standard `LICENSE` file at the root (GitHub must detect it and show it in the About section), `.gitignore`, `.env.example`, `PROGRESS.md`. `FRICTION_LOG.md` already exists.
- [ ] `[HUMAN]` Join the hackathon Discord. Ask once whether participants can get MCP Toolkit access; log the answer and the response time in the friction log. Do not wait for it.

Hands to the next phase: a filled `.env`, a repo that installs, three manual PDFs, a Shopify store and app that answer, a Bedrock model that answers.

Commit: `Set up repo, tooling and demo manuals`

Tests

| ID | How to run | Pass when |
|---|---|---|
| T0.1 | `node --version` and `docker --version` | Node is 24 or later; Docker responds |
| T0.2 | `aws sts get-caller-identity --profile <profile> --region us-west-2` | Prints our account ID |
| T0.3 | `aws bedrock-runtime converse --model-id <SIM_MODEL_ID> --messages '[{"role":"user","content":[{"text":"Say ok"}]}]' --region us-west-2` | Returns a text reply, not an access error |
| T0.4 | `curl -X POST https://<store>.myshopify.com/admin/oauth/access_token -d grant_type=client_credentials -d client_id=... -d client_secret=...` | JSON with `access_token`, and `scope` lists all five scopes |
| T0.5 | GraphQL `{ shop { name } }` with the token from T0.4 | Returns the store name (products are seeded in Phase 2) |
| T0.6 | `npm ci` then `npm ls @modelcontextprotocol/server` | Installs cleanly; the version shown is the exact pinned one |
| T0.7 | Manual: open the three manual PDFs and select a sentence of text | Text is selectable in all three (not scans); each has a troubleshooting section and a warranty page |
| T0.8 | Manual: open the GitHub repo page | The About section shows "MIT license" |
| T0.9 | `git status --short` and `git grep -n SHOPIFY_CLIENT_SECRET` | `.env` is not listed as tracked; the only match is the name in `.env.example` and the docs, never a value |

If a test fails
- T0.3 access error: the model needs enabling in the Bedrock console for us-west-2, or the model ID needs the region inference profile prefix shown in the console. Copy the ID from the console, do not type it from memory.
- T0.4 `shop_not_permitted`: the store was not created from the Dev Dashboard's Dev stores page, or the app is not installed on it. Recreate the store there.
- T0.4 returns a token but a scope is missing: release a new app version with the scope and approve the update on the store.
- T0.6 fails on a `@modelcontextprotocol/*` package: the pinned version does not exist; re-read `dist-tags` and pin what is published.

Optimise (after T0.1 to T0.8 pass)
- Put T0.2 to T0.5 into one script, `npm run check:env`, so the daily start is one command instead of four. Measure: time to confirm the environment is healthy.
- Write `.env.example` with every variable name and no values, so setup on a second machine is a copy and fill.
- Re-run: T0.1 to T0.6.

Done when
- The Shopify dev store answers an Admin API call made with a client credentials token.
- A Bedrock `Converse` call from the CLI profile returns text.
- `npm ci` installs the pinned MCP packages.

---

## Phase 1: Skeleton, deployed (11 to 13 Oct)

Goal: the thinnest possible server at a public HTTPS URL, with the thinnest possible simulator calling it.

Needs before starting: Phase 0 tests green; `.env` filled; Docker running.

Tasks (top to bottom)
- [ ] Add dependencies, exact versions for the MCP packages: `@modelcontextprotocol/server`, `@modelcontextprotocol/node`, `@modelcontextprotocol/express`, `@modelcontextprotocol/client`, `@modelcontextprotocol/ext-apps`, `zod` v4, `express`, `cors`, `@aws-sdk/client-bedrock-runtime`; dev: `typescript`, `tsx`, `vite`, `vite-plugin-singlefile`. Open the `examples/basic-server-vanillajs` template in the `modelcontextprotocol/ext-apps` repo and copy its import names and transport wiring; do not trust the names in this plan over the template.
- [ ] `src/server.ts`: `buildServer()` returns a new `McpServer` with one tool, `ping`, whose result is `{ content: [{ type: "text", text: "concierge online" }] }`.
- [ ] `src/main.ts`: Express app. `app.all("/mcp")` builds a server with `buildServer()` and a new Streamable HTTP transport with no session ID generator for every request (stateless), and closes both when the response ends. `GET /healthz` returns 200 and `{ ok: true, sha }`, where `sha` comes from the `GIT_SHA` environment variable set at build time.
- [ ] Write `test/server.e2e.ts` (T1.1 to T1.4) now and get it green locally with `npm run dev` running.
- [ ] `sim/agent.ts`, to the `/sim` contract in the Appendix: checks the access code; opens an MCP client to `MCP_URL` over Streamable HTTP; calls `tools/list` and converts each tool's input schema into a Bedrock `Converse` `toolConfig` entry; loops (model reply, if it asks for a tool then `tools/call` and feed the result text back) until the model answers in text or 5 tool calls have been made; returns `{ say, toolCalls }`. The system prompt is the generic one in the Appendix.
- [ ] `sim/index.html`: one page, no framework. A code field, a text box, a transcript. It posts to `/sim/chat` and prints `say`. No device frame yet.
- [ ] Mount the simulator from `src/main.ts`: `GET /sim`, `POST /sim/chat`. Set `MCP_URL=http://localhost:3001/mcp` locally.
- [ ] Write `test/sim.e2e.ts` (T1.5, T1.6) and get it green locally.
- [ ] `Dockerfile`: Node 24, `npm ci`, `npm run build`, `CMD node dist/main.js`, `EXPOSE 3001`, `ARG GIT_SHA` passed into `ENV GIT_SHA`.
- [ ] `[HUMAN]` once: create the ECR repository, the two IAM roles ECS Express Mode asks for (`ecsTaskExecutionRole`, `ecsInfrastructureRoleForExpressServices`) and a task role allowed `bedrock:InvokeModel`, `bedrock:Retrieve`, `bedrock:RetrieveAndGenerate` and DynamoDB access to the table `concierge`. Claude can do this with the AWS CLI if the profile has IAM rights; otherwise a person does it in the console from the commands Claude prints.
- [ ] Push the image and create the ECS Express Mode service: minimum 1 task, maximum 1, health check path `/healthz`, port 3001, the environment variables from `.env` (secrets from Secrets Manager), `MCP_URL` set to the service's own public `/mcp` URL. Record the service URL in `PROGRESS.md` and as `BASE_URL` in `.env`.
- [ ] `npm run deploy`: one script that builds the image with the current git SHA, pushes it and updates the service, then waits until `/healthz` reports the new SHA.
- [ ] Friction log: every step above that did not match its docs.
- [ ] Note the time; gate G4 (hosting cost) is checked 48 hours from now.

Hands to the next phase: a public HTTPS URL, a one-command deploy, a simulator that can call any tool the server lists, and the e2e test harness.

Commit: `Add stateless MCP server, simulator skeleton and deploy`

Tests

| ID | How to run | Pass when |
|---|---|---|
| T1.1 | `npm run test:e2e` (`test/server.e2e.ts`) | `GET /healthz` returns 200 and a git SHA |
| T1.2 | same file | MCP `initialize` over `POST /mcp` succeeds and negotiates protocol version 2025-11-25 or later |
| T1.3 | same file | `tools/list` contains `ping`; `tools/call ping` returns `content[0].text` equal to "concierge online" |
| T1.4 | same file | Two calls in a row with no session header both succeed (stateless) |
| T1.5 | `test/sim.e2e.ts` | `POST /sim/chat` without the access code returns 401 |
| T1.6 | same file | `POST /sim/chat` with the code and "ping" returns a reply containing "concierge online" and one tool call named `ping` |
| T1.7 | `BASE_URL=https://<service-url> npm run test:e2e` | T1.1 to T1.6 pass against the deployed service, over HTTPS |
| T1.8 | `npx @modelcontextprotocol/inspector https://<service-url>/mcp` (manual) | Inspector connects and lists `ping` |
| T1.9 | Change the ping text, run `npm run deploy`, call `/healthz` | The SHA changes and the new text is returned, with one command |

If a test fails
- T1.2 or T1.3 returns 406 or an empty body: the request needs the header `Accept: application/json, text/event-stream`; use the SDK's client in the test instead of raw `fetch`.
- T1.4 fails on the second call: a server or transport is being reused across requests; build both inside the request handler.
- T1.6 calls no tool: print the `toolConfig` sent to Bedrock; the tool's input schema must be a JSON Schema object with `type: "object"`, even for a tool with no inputs.
- T1.6 access denied from Bedrock locally: the shell is not using the `concierge` profile; on the deployed service, the task role is missing `bedrock:InvokeModel`.
- T1.7 passes locally but the deployed simulator cannot reach the tools: `MCP_URL` on the service still points at localhost.
- Deploy never becomes healthy: the container is not listening on `0.0.0.0:3001`, or the health check path is not `/healthz`.

Optimise (after T1.1 to T1.9 pass)
- Record the baseline: round-trip time of `ping` through the deployed `/mcp`, 20 calls. This is the floor every later tool is compared against.
- Image size and deploy time: multi-stage `Dockerfile`, slim Node base image, `npm ci --omit=dev` in the final stage. Measure: image MB and seconds from `npm run deploy` to the new SHA on `/healthz`.
- Simulator: list tools once per session, not on every turn. Measure: time of the second turn.
- Re-run: `BASE_URL=https://<service-url> npm run test:e2e`.

Done when
- Typing "ping" in the deployed simulator returns "concierge online", and the server log shows the call arrived at `POST /mcp`.
- MCP Inspector pointed at the public `/mcp` URL lists the tool.
- A redeploy is one command.

Risks
- ECS Express Mode is new to us: this is why it is done on day one with a hello-world image. Fallback: a single small EC2 instance behind Caddy for HTTPS.
- MCP SDK v2 import names differ from this plan: follow the ext-apps template, not this document.

---

## Phase 2: Data and decision engine (13 to 16 Oct)

Goal: the intelligence. Real orders from Shopify, real troubleshooting steps from the manuals, deterministic policy logic that picks the cheapest resolution.

Needs before starting: Phase 1 tests green against the deployed URL; the three manuals in `manuals/`; gates G1 and G2 decided.

Build order (the task list below has the detail for each step)
1. `config/products.json` from the demo data table in the Appendix. No code depends on anything else yet.
2. `src/policy.ts` and `test/policy.test.ts` together, test first. This needs no network and no accounts, so it can be finished and green (T2.1 to T2.9) before anything else in this phase exists.
3. Spike for gate G3, 30 minutes at most: one throwaway script that creates a single Shopify order with a `processedAt` 40 days in the past and marks it fulfilled. Record the result in `PROGRESS.md` and take the gate's default if it does not work.
4. `src/shopify.ts` with its fake-`fetch` unit test (T2.10), then `scripts/seed-shopify.ts`, then T2.11.
5. `[HUMAN]` Create the S3 bucket, upload `manuals/` (PDFs and sidecars), create the Knowledge Base with quick create, sync it, ask it "blender does not start" in the console. Put its ID in `.env` as `KB_ID` and on the deployed service.
6. `[HUMAN]` or Claude with the CLI: create the DynamoDB table `concierge` (on-demand, keys `pk` and `sk`, TTL attribute `ttl`). Put `TABLE_NAME=concierge` in `.env` and on the service.
7. `src/db.ts`, `src/kb.ts`, then `scripts/precompute.ts`; run it; T2.12 to T2.14.
8. The three read tools, one file each in `src/tools/`, registered in `src/server.ts`, to the tool contracts in `ARCHITECTURE.md` section 4. Remove `ping` from nothing: keep it, the Phase 1 tests use it.
9. `test/tools.e2e.ts` (T2.15 to T2.20), locally, then deploy and run against `BASE_URL`.
10. Try the flow in the simulator by typing. Gate G5 is judged here.

Tasks
- [ ] Shopify: 3 products with prices, a demo customer, 3 orders placed on chosen dates so the demo has one order inside the return window, one just outside it but under warranty, one with a cheap replacement part. Mark orders as fulfilled (returns require a fulfilled line item). The seed script must be re-runnable, because order dates drift out of their windows between now and 20 Nov (see Phase 8).
- [ ] `src/shopify.ts`: GraphQL client that holds the access token in memory and refreshes it before expiry. Functions: `findOrdersForCustomer(email)`, `getOrder(id)`, `getReturnableFulfillments(orderId)`, `createReturn(orderId, fulfillmentLineItemId, reason)`, `createDraftOrder(variantId)`.
- [ ] `config/products.json`: per product, `returnWindowDays`, `warrantyMonths`, `knownSymptoms[]`, `parts[]` (name, variantId, price), `manualS3Key`. Shopify does not model warranty, so this is the merchant policy file. (`ponytail:` JSON file; move to Shopify metafields when more than one merchant.)
- [ ] Knowledge Base: S3 bucket `concierge-manuals-<acct>` with the 3 manuals and warranty PDFs. Bedrock Knowledge Base, quick create, S3 data source, S3 Vectors store. Sync. Test in the console: "blender motor does not start".
- [ ] `src/kb.ts`: `retrieveSteps(productName, symptom)` using `RetrieveCommand` from `@aws-sdk/client-bedrock-agent-runtime`, `numberOfResults: 4`, with a metadata filter on product.
- [ ] `scripts/precompute.ts`: for each product x knownSymptom, call `RetrieveAndGenerateCommand` with a strict prompt that outputs JSON `{ steps: [{ title, detail }], source: { document, page } }`, and store in DynamoDB. This is how `troubleshoot` stays under the 500 ms round-trip limit. Live `Retrieve` remains the fallback for unknown symptoms.
- [ ] DynamoDB table `concierge` (on-demand), PK `pk`, SK `sk`. Item types: `STEPS#<product>#<symptom>`, `CLAIM#<id>`, `RETURN#<id>`, `PART#<id>`, `SESSION#<customer>` (last identified product, for follow-up turns).
- [ ] `src/policy.ts`, pure function, no I/O:
  `resolve({ purchaseDate, today, returnWindowDays, warrantyMonths, parts, symptomSeverity }) -> RankedOptions`. Ranking among eligible options (FR-19): a matching part first when its price is under 20% of the product price; otherwise return, then warranty claim, then part, then "contact merchant". Ineligible options are still returned, ranked last, with the reason. Each option carries a one-line reason Alexa can speak ("4 days past the 30-day return window, but 11 months of warranty remain").
- [ ] Tools wired: `identify_product`, `troubleshoot`, `get_resolution_options`. All read-only in this phase.
- [ ] Tests with `node:test`: `policy.test.ts` covers window boundary days (day 30 vs day 31), warranty expiry, no parts, all-expired. One integration test that hits the deployed `/mcp` with `tools/list` and `tools/call identify_product`.

Tests

Decision engine, `npm test` (`test/policy.test.ts`)

| ID | Case | Pass when |
|---|---|---|
| T2.1 | Purchase 30 days ago, 30-day window | Return is eligible |
| T2.2 | Purchase 31 days ago, 30-day window | Return is ineligible and its reason says how many days past |
| T2.3 | Last day of warranty, then one day after | Eligible, then ineligible |
| T2.4 | Matching part priced under 20% of the product | Part ranks first |
| T2.5 | Matching part priced at 20% or more | Order is return, warranty, part |
| T2.6 | No part lists the symptom; unknown symptom | No part option offered; return and warranty still ranked |
| T2.7 | Everything expired, no part | Top option is contact merchant |
| T2.8 | Purchase date in the future | Contact merchant, no crash |
| T2.9 | Any input above | Every option, eligible or not, has a non-empty one-sentence `reason` |

Shopify, Knowledge Base and cache

| ID | How to run | Pass when |
|---|---|---|
| T2.10 | `npm test` (`test/shopify.test.ts`, fake `fetch`) | Two API calls request the token once; after the fake clock passes expiry, the next call requests a new token |
| T2.11 | `npm run seed` twice, then `test/shopify.e2e.ts` | Exactly 3 orders for the demo customer, each with a fulfilled line item; the second seed run did not duplicate them |
| T2.12 | `test/kb.e2e.ts` | `retrieveSteps` for the blender and "won't turn on" returns at least one chunk, and every chunk's `productId` is the blender's (the filter works) |
| T2.13 | `npm run precompute`, then `test/steps.e2e.ts` | Every product and symptom pair in `config/products.json` has a `STEPS#` item with 1 to 4 steps and a source document and page |
| T2.14 | Manual: open the source page named in one `STEPS#` item | The steps really are on that page of the manual |

Tools, `npm run test:e2e` (`test/tools.e2e.ts`), through `POST /mcp`

| ID | Call | Pass when |
|---|---|---|
| T2.15 | `identify_product` "blender" | One candidate with `orderId`, `lineItemId`, `productId`, `purchaseDate` |
| T2.16 | `identify_product` "toaster" (not owned) | Empty `candidates` and a speakable sentence; no stack trace |
| T2.17 | `troubleshoot` with a known symptom | Steps and source returned; logged server time under 150 ms |
| T2.18 | `troubleshoot` with an unknown symptom | Still returns steps from the live Knowledge Base path |
| T2.19 | `get_resolution_options` for each of the 3 orders | Top option is return for the in-window order, warranty claim for the out-of-window order, part for the cheap-part order |
| T2.20 | Every tool in `tools/list` | Result has non-empty `content[0].text` and a `structuredContent` object; description is two sentences or fewer |

If a test fails
- T2.1 or T2.2 off by one: days since purchase must be whole calendar days in UTC, computed from dates with the time stripped. Day 30 is inside a 30-day window; day 31 is outside.
- T2.11 creates duplicates: the seed script must cancel earlier demo orders (found by the tag `concierge-demo`) before creating new ones, and `findOrdersForCustomer` must ignore cancelled orders.
- T2.11 orders are not returnable later: the line items are not fulfilled; fulfil them in the seed script and check `returnableFulfillments` returns them.
- T2.12 returns chunks from another product: the `.metadata.json` sidecars were not uploaded next to the PDFs, or the Knowledge Base was not re-synced after uploading them.
- T2.13 a step list is empty or not JSON: tighten the precompute prompt, ask for JSON only, and retry that pair up to three times before failing loudly. Never store a malformed item.
- T2.17 over 150 ms: the tool is calling Bedrock on a cache hit, or creating a client per request.
- T2.19 wrong top option: check the order's purchase date first (gate G3), then the product's entry in `config/products.json`, then the policy.
- The simulator picks the wrong tool: fix the tool descriptions (when to use, when not to), not the simulator prompt. Then gate G5.

Hands to the next phase: three read tools working on real data through the deployed `/mcp`, a seed script that can rebuild the store, a filled steps cache, and a policy with full tests.

Commit: one per build-order step that leaves the tests green, for example `Add policy engine with boundary tests`, `Add Shopify client and seed script`, `Add Knowledge Base retrieval and steps cache`, `Add identify, troubleshoot and options tools`.

Optimise (after T2.1 to T2.20 pass)
- Measure server time per tool from the logs, 20 calls each, and work only on the slowest one.
- `identify_product`: one GraphQL query that asks only for the fields the tool returns; cache the customer's orders in memory for 5 minutes. Measure: first call and repeat call in ms.
- AWS SDK and Shopify clients created once at module load, not per request, so connections are reused. Measure: `troubleshoot` time on the second call.
- `troubleshoot`: one DynamoDB `GetItem` on the cache hit path, nothing else.
- Precompute prompt: tighten until each step's `detail` is one or two short sentences that sound right when spoken. Measure: longest step in words.
- Re-run: `npm test` and `npm run test:e2e`.

Done when
- In the simulator: "my blender won't turn on" -> `identify_product` returns the blender order -> `troubleshoot` returns the manual's reset steps with a source page -> `get_resolution_options` ranks "warranty claim" first for the out-of-window order.
- `npm test` is green.

Risks
- KB retrieval quality is poor on a scanned PDF: pick manuals that are text PDFs, not scans.
- Shopify `returnCreate` fails: check `userErrors`, confirm the line item is fulfilled and unrefunded and the app has `write_returns`.

---

## Phase 3: Experience (16 to 18 Oct)

Goal: the demo moment. Cards in an Echo Show frame, and the write actions that make the flow real.

Needs before starting: Phase 2 tests green against the deployed URL; `npm run seed` just run, so all three orders are fresh and returnable.

Build order (the task list below has the detail for each step)
1. `report_outcome` and the three write tools plus `delete_my_data`, with no UI. Write `test/writes.e2e.ts` alongside (T3.1 to T3.8). The idempotency record and the `confirmed` check go in first, before the Shopify call, and are tested first.
2. The three card HTML files in `ui/`, built by `npm run build` into `dist/`. Develop each one by opening it in a browser with a hard-coded sample of its `structuredContent`, so the layout is finished before any host is involved.
3. Register the cards as `ui://` resources and link them from their tools. `test/ui.e2e.ts` (T3.9 to T3.12).
4. Simulator device frame: `GET /sim/resource` and `POST /sim/tool` from the Appendix contract, the sandboxed iframe host, the Small and Large toggle, the voice-only toggle.
5. Tool-call side panel.
6. Speech in and out, last, because everything before it can be tested by typing.
7. `[HUMAN]` T3.13 to T3.18 in the deployed simulator. These need eyes, ears and a microphone.
8. Gate G6 at 18 Oct 22:00 IST.

Tasks
- [ ] Three MCP Apps views, each a single HTML file built by Vite with `vite-plugin-singlefile`, vanilla JS, no framework:
  1. `ui://concierge/steps.html`: numbered troubleshooting steps, product image, "It worked" and "Still broken" buttons that call `callServerTool` with `report_outcome`.
  2. `ui://concierge/options.html`: ranked resolution options with the reason line and price, one "Choose" button per option.
  3. `ui://concierge/confirmation.html`: return QR code (generated server side with the `qrcode` package) or claim reference, pickup date, "Done".
- [ ] Register with `registerAppTool` / `registerAppResource` from `@modelcontextprotocol/ext-apps/server`; `_meta.ui.resourceUri` on each tool; `mimeType: RESOURCE_MIME_TYPE`.
- [ ] Write tools, each requiring `confirmed: true` in its input and refusing otherwise (the agent gets a clear "ask the customer to confirm" message): `create_return`, `file_warranty_claim`, `order_part`. Each writes a DynamoDB record and, for return and part, calls Shopify. Idempotency key = `orderId + lineItemId + action` so a repeated voice command cannot double-file.
- [ ] `report_outcome(worked: boolean)` records whether the fix worked and, if not, returns the resolution options directly so the flow continues in one tool call.
- [ ] Simulator, full version:
  - A device frame that renders the tool's `ui://` view in a sandboxed iframe, acting as an MCP Apps host (start from `examples/basic-host` in the ext-apps repo). It reads the resource before delivering the tool result, and forwards `callServerTool` from the card to the server.
  - A Small (10" and below) and Large (11" and above) frame toggle, and a voice-only toggle that hides the screen so the flow runs on `content[0].text` alone.
  - Microphone in and speech out with the browser's Web Speech API, with the text box kept as the fallback.
  - A side panel listing each tool call with its server time in ms, so the video can show the real MCP traffic.
- [ ] Check every card by hand in both frames: 48 px touch targets, 4.5:1 contrast, no horizontal scroll, no blank card on first call.
- [ ] Run the full flow by voice in the deployed simulator. Time it. Target under 60 seconds from "my blender stopped working" to the return QR code.
- [ ] 18 Oct 22:00 IST: feature freeze. Anything not working is cut, not fixed tomorrow.

Tests

Write tools, `npm run test:e2e` (`test/writes.e2e.ts`)

| ID | Call | Pass when |
|---|---|---|
| T3.1 | Each write tool without `confirmed: true` | `isError` is false, the text asks for confirmation, and no DynamoDB record or Shopify object was created |
| T3.2 | `file_warranty_claim` confirmed | A `CLAIM#` item exists and a claim reference is returned |
| T3.3 | The same call again | Same reference; still exactly one `CLAIM#` item |
| T3.4 | `create_return` confirmed on the in-window order | Return ID, QR data URL and pickup date returned; the return exists when queried from Shopify |
| T3.5 | The same call again | Same return ID; Shopify still has one return for the line item |
| T3.6 | `create_return` confirmed on the out-of-window order | Refused with the reason and the next best option; nothing created |
| T3.7 | `order_part` confirmed | A draft order exists in Shopify with the part variant; a `PART#` item exists |
| T3.8 | `report_outcome` with `worked: true`, then `false` | First returns `resolved: true`; second returns the same ranked options as `get_resolution_options` |

Cards, `npm run test:e2e` (`test/ui.e2e.ts`) plus `npm run build`

| ID | Check | Pass when |
|---|---|---|
| T3.9 | `resources/list` | Contains the three `ui://concierge/*.html` URIs |
| T3.10 | `resources/read` on each | Returns HTML with the MCP Apps mime type |
| T3.11 | Tool definitions | `troubleshoot`, `report_outcome`, `get_resolution_options` and the three write tools each carry `_meta.ui.resourceUri` pointing at an existing resource |
| T3.12 | Built files in `dist/` | Each card is one HTML file with no `http://` or `https://` script, style or image loads |

Simulator, manual, in the deployed build

| ID | Check | Pass when |
|---|---|---|
| T3.13 | Each of the 3 cards in the Small frame and the Large frame | No horizontal scroll, no blank card on first call, text readable, buttons at least 48 px |
| T3.14 | Tap "Still broken" on the steps card | The options card appears; the tool-call panel shows `report_outcome` |
| T3.15 | Full blender flow by voice | Ends on the confirmation card; under 60 seconds from the first utterance |
| T3.16 | Same flow in voice-only mode | Completes with speech alone, including the claim reference |
| T3.17 | Say "yes" twice at the confirmation step | One claim only (same reference spoken) |
| T3.18 | After the headphones return flow, open the Shopify admin | The return is listed on the order |

If a test fails
- T3.1 creates a record anyway: the `confirmed` check must be the first statement in the tool, before any read or write.
- T3.3 or T3.5 creates a second record: the `IDEM#<hash>` item must be written with a condition that it does not already exist, and on a condition failure the tool reads and returns the existing record instead of erroring.
- T3.4 `returnCreate` returns `userErrors`: the line item is not fulfilled, was already returned by an earlier test run, or the app lacks `write_returns`. Run `npm run seed` and try again before changing code.
- T3.10 wrong mime type: use the `RESOURCE_MIME_TYPE` constant exported by the ext-apps package, never a typed string.
- T3.12 finds an external load: a font, icon or image URL crept into a card; inline it.
- T3.13 blank card on first call: the host must read the `ui://` resource and finish loading the iframe before it delivers the tool result, and the card must set its result handler before it connects.
- T3.14 button does nothing: the card's tool call is not reaching `POST /sim/tool`; check the iframe sandbox allows scripts and the host bridge is forwarding `callServerTool`.
- T3.15 over 60 seconds: count the tool calls in the side panel. More than 4 means the agent is re-identifying the product; `identify_product` must write the session and later tools must read it.
- Speech does not work in the browser: use Chrome or Edge; if it still fails, the text box is the fallback and the demo is typed.

Hands to the next phase: the complete flow, in the deployed simulator, by voice and by touch, with every write confirmed and idempotent.

Commit: `Add write tools with confirmation and idempotency`, `Add MCP Apps cards`, `Add simulator device frame and speech`.

Optimise (after T3.1 to T3.18 pass)
- Card weight: inline SVG instead of image files, one shared CSS block, product image resized to the size it is shown at. Measure: KB per built card and time from tool result to card visible.
- Simulator reply time: cap the model's output tokens, send only the last few turns as history, and read the three `ui://` resources once at session start. Measure: seconds from end of utterance to start of speech.
- QR code: generate once when the return is created and store it with the `RETURN#` record, so a repeated call does not regenerate it.
- Whole flow: remove any turn that is not needed. Measure: seconds and number of tool calls from "my blender stopped working" to the confirmation card (target under 60 seconds, 4 tool calls).
- Re-run: `npm run test:e2e`, then T3.13 to T3.17 by hand.

Done when
- The full flow runs by voice in the simulator with cards at each step, in both frame sizes and in voice-only mode.
- A real return exists in the Shopify dev store admin after the demo run.

---

## Phase 4: Hardening (19 to 20 Oct)

Goal: it never embarrasses you on camera or in front of a judge who clicks around.

Needs before starting: gate G6 passed or its cuts recorded; no new features from here on.

Build order
1. `test/cases.json` (schema in the Appendix) and its runner behind `npm run test:cases`. Run it once and write down the score before changing anything.
2. Error handling and its unit test (T4.3), then the log test (T4.4). Both run with fakes, no network.
3. Privacy: `delete_my_data`, `DELETE /data`, the `/privacy` and `/terms` pages (T4.5, T4.6).
4. Simulator turn cap (T4.7).
5. Latency test (T4.2) against the deployed service.
6. `[HUMAN]` T4.8 and T4.9.
7. Fix failures in this order: anything that files something wrongly, then crashes, then wrong tool choice, then slowness, then wording.

Tasks
- [ ] 20-case test set in `test/cases.json` (utterance, expected tool, expected top option), run through `POST /sim/chat`. Covers: each product x 2 symptoms, each policy branch, unknown product, unknown symptom, double confirmation, "cancel", "what did you just file?".
- [ ] Latency: log per-tool server time; `troubleshoot` from precomputed steps under 150 ms, policy under 10 ms, Shopify calls under 400 ms. The ECS service runs a minimum of 1 task, so there is no cold start.
- [ ] Error handling: every tool returns a short, speakable error (`isError: true`) rather than a stack trace. Shopify down -> "I can't reach the store right now, try again in a minute."
- [ ] Privacy: no order contents or emails in logs (log IDs only); `DELETE /data?customer=<id>` plus `delete_my_data` tool that wipes the customer's DynamoDB items; privacy policy page states retention (30 days) and that nothing is bought or returned without confirmation.
- [ ] Abuse and cost: the simulator spends Bedrock tokens, so it stays behind `SIM_ACCESS_CODE` and caps turns per session. Tool descriptions rewritten against what actually works.
- [ ] Re-run the 20 cases; fix only blockers.

Tests

| ID | How to run | Pass when |
|---|---|---|
| T4.1 | `BASE_URL=https://<service-url> npm run test:cases`, twice | 20 of 20 both times: the expected tool was called and the expected top option returned |
| T4.2 | `test/latency.e2e.ts`: each read tool 20 times | 95th percentile under the budget in `ARCHITECTURE.md` section 10 |
| T4.3 | `npm test` (`test/errors.test.ts`): Shopify fake returns 500, then times out | Tool returns `isError: true` with one sentence; no stack trace or URL in the text |
| T4.4 | `npm test` (`test/logs.test.ts`): run one flow with stdout captured | No log line contains the demo email, an `@`, a customer name or an address; every tool call logged `{ tool, ms, ok }` |
| T4.5 | `test/privacy.e2e.ts`: `delete_my_data` without, then with, `confirmed` | Nothing deleted the first time; second time the count is above zero and a query for the customer returns no items |
| T4.6 | same file: `DELETE /data?customer=<id>` | Same result over HTTP |
| T4.7 | `test/sim.e2e.ts`: more turns than the cap in one session | The simulator answers politely that the session limit is reached and makes no Bedrock call |
| T4.8 | Manual: read CloudWatch logs for one full demo run | IDs and hashes only |
| T4.9 | Manual: restart the service, then call `troubleshoot` at once | First call after restart still answers; note the time |
| T4.10 | `git grep -nE "shpat_|shpss_|AKIA|client_secret="` | No matches in the repo |

If a test fails
- T4.1 a case passes on one run and fails on the next: the tool descriptions are ambiguous between two tools. Make each description say when not to use it. If it still flips, take gate G5's default (larger model).
- T4.1 fails because a case expects a write that an earlier case already made: the runner must call `delete_my_data` and use a fresh `sessionId` before every case, and `npm run seed` before every full run.
- T4.2 over budget only on the first call: that is connection setup; warm the clients at startup with one cheap call each.
- T4.4 finds an email in the logs: something is logging a whole Shopify response or a whole error object. Log IDs and `error.name` only.
- T4.5 leaves items behind: the delete must page through the query results; a single query returns at most 1 MB.

Hands to the next phase: a deployed build that passes all 20 cases twice, with the code frozen.

Commit: `Add 20-case regression set`, `Harden errors, logs and privacy controls`. Tag the commit that passes T4.1 twice as `demo-ready`.

Optimise (after T4.1 to T4.10 pass)
- Routing: for any case in `test/cases.json` that passed only on a retry, rewrite that tool's description (when to use, when not to) rather than the simulator's prompt. Measure: cases passing first time, out of 20.
- Latency: from T4.2, fix only tools whose 95th percentile is over budget.
- Cost: right-size the task to the smallest CPU and memory that still passes T4.2; set CloudWatch log retention to 14 days. Measure: dollars per day in the billing console.
- Re-run: `npm run test:cases` twice and `test/latency.e2e.ts`. This is the last code optimisation; after the freeze only blockers are touched.

Done when
- 20 of 20 cases pass twice in a row on the deployed server.
- No PII in CloudWatch logs for a full demo run.

---

## Phase 5: Packaging (21 Oct)

Tasks
- [ ] README: what it does, 90-second architecture tour, exact run steps (`npm ci`, env vars, `npm run dev`, open `/sim`), where the required technology is called in code (link to `src/main.ts` for the MCP server entry point and transport, `src/server.ts` for tool and `ui://` registration, `sim/agent.ts` for the MCP client, `src/kb.ts` for Bedrock, `src/db.ts` for DynamoDB). State plainly that the Alexa+ surface is simulated and why, and that the server is a standard Streamable HTTP MCP server any client can call.
- [ ] Testing instructions for judges: the simulator URL, the access code, three utterances to try, and the MCP Inspector command against the public `/mcp` URL.
- [ ] Architecture diagram PNG exported from `ARCHITECTURE.md` (Mermaid or Excalidraw), naming every AWS service for the AWS Builder judges.
- [ ] Product feedback, one block per tool we used (MCP TypeScript SDK v2, MCP Apps SDK, Alexa+ MCP Toolkit docs, Bedrock Knowledge Bases, Bedrock Converse, DynamoDB, ECS Express Mode). The form asks five things for each: what we used it for, what worked well, what needs work, how onboarding felt, would we build with it again and why. The AWS Builder entry requires the AWS services and how we used them to be described in this answer, not only in the README.
- [ ] Friction log cleaned, dated, severity-rated. Each entry: task, steps, expected, actual, severity, workaround, actionable suggestion.
- [ ] Optional feature requests, each with why it matters and a priority (critical, important, nice-to-have). The first one is public or hackathon access to the MCP Toolkit.
- [ ] Repo public with the MIT `LICENSE` visible in the GitHub About section. If it must be private instead: invite `testing@devpost.com` and the GitHub users `chris-trag`, `knmeiss`, `giolaq`, `anishamalde`, `mosesroth`, `emersonsklar` on submission day (invitations expire after 7 days).

Tests

| ID | How to run | Pass when |
|---|---|---|
| T5.1 | Fresh `git clone` into an empty folder, follow only the README, time it | `tools/list` answers locally in under 15 minutes |
| T5.2 | In that clone: `npm test` | Green with no `.env` present |
| T5.3 | `gh api repos/<owner>/<repo>/license --jq .license.spdx_id` | Prints `MIT` |
| T5.4 | Manual: click every file link in the README | Each opens the code it claims (MCP entry point, tool registration, MCP client, Bedrock, DynamoDB) |
| T5.5 | Manual: follow the judge testing instructions from a logged-out browser | Simulator opens with the access code; the three example utterances work |
| T5.6 | Manual: read the product feedback draft | One block per tool with all five answers; the AWS services and how they are used are named |
| T5.7 | Manual: read every friction log entry | Each has all eight fields and describes something that actually happened |

Optimise (after T5.1 to T5.7 pass)
- Setup time: remove or script any README step that slowed T5.1. Measure: minutes from clone to `tools/list`.
- Repo weight: delete unused files, dead code and any dependency nothing imports. Measure: entries in `dependencies`, and that `npm test` still passes.
- README: cut it until the first screen says what it does, shows the diagram and gives the run command.
- Re-run: T5.1 and T5.2 in a fresh clone.

Done when a stranger can clone, set the env vars and reach `tools/list` in under 15 minutes.

---

## Phase 6: Video (22 Oct)

Script (under 2:59, English narration, captions on, no copyrighted music, no third-party trademarks: use invented product names on screen, not real brands).

| Time | On screen |
|---|---|
| 0:00 to 0:20 | Blender dies on camera. "Alexa, my blender stopped working." The simulated Echo Show shows step 1 from the manual. A caption says "Simulated Alexa+ experience, real MCP server". |
| 0:20 to 0:45 | The problem in one line: manuals, return windows and warranty forms are three separate chores, so people return things a two-minute fix would have saved. |
| 0:45 to 1:45 | Full flow: steps card, "still broken", options card says "4 days past the return window, but under warranty", claim filed, confirmation card. Then the second product: return inside window, QR code, and the return appearing in the Shopify admin. The tool-call panel is visible throughout. |
| 1:45 to 2:20 | Architecture diagram: simulated Alexa+ (Bedrock Converse agent, MCP client) -> our Streamable HTTP MCP server on ECS Express Mode -> Shopify Admin API, Bedrock Knowledge Base over the product manuals, DynamoDB. Say each name. Show MCP Inspector listing the same tools from the public URL. |
| 2:20 to 2:45 | Trust: confirm before any action, source page shown on every step, delete-my-data. Voice-only mode for an Echo Dot. |
| 2:45 to 2:59 | Who it helps: any merchant on Alexa+, fewer avoidable returns. The server is ready to onboard to Alexa+ as an add-on. |

Screen-record the deployed simulator, not a local build and not slides. Upload public to YouTube, check from a logged-out browser.

Tests (all manual)

| ID | Check | Pass when |
|---|---|---|
| T6.1 | Before recording: `npm run seed`, then `BASE_URL=https://<service-url> npm run test:e2e` | Green, so the recording starts from clean data |
| T6.2 | Video length | Under 3:00 |
| T6.3 | Open the link in an incognito window | Plays without sign-in; visibility is Public |
| T6.4 | Watch once with sound off | Captions carry the story; "simulated Alexa+ experience" is on screen |
| T6.5 | Watch for brands and music | No real product brands, no third-party logos, no copyrighted music |
| T6.6 | Checklist against the script | Shows the MCP server being called (tool-call panel), every AWS service named, confirmation before a write, delete-my-data |

Optimise (after T6.1 to T6.6 pass)
- Cut every pause longer than a second and any shot where nothing changes on screen. Measure: seconds saved, and that the strongest moment (the options card with the spoken reason) lands inside the first 60 seconds.
- Check that text on the cards is readable at 720p on a phone; zoom the recording if not.
- Re-run: T6.2 to T6.6 on the final upload.

---

## Phase 7: Submit (23 Oct, by 18:00 IST)

- [ ] Devpost form: description, repo link, video link, track Alexa+, mini challenge AWS Builder, product feedback (including the AWS services), testing instructions with the simulator URL and access code, friction log entries, optional feature requests.
- [ ] Re-seed the Shopify orders so the dates sit in the right windows.
- [ ] Re-invite reviewers to the repo if private.
- [ ] Confirm the server answers `tools/list` and the simulator loads from a fresh network.
- [ ] Submit. Screenshot the confirmation.

Tests

| ID | How to run | Pass when |
|---|---|---|
| T7.1 | `npm run seed`, then `BASE_URL=https://<service-url> npm run test:e2e` and `npm run test:cases` from a different network (phone hotspot) | All green |
| T7.2 | Manual: open every link in the Devpost draft from a logged-out browser | Repo, video and simulator all open |
| T7.3 | Manual: read the form against the rules list | Description, repo, video, track, mini challenge, product feedback with AWS services, testing instructions, friction log are all filled |
| T7.4 | Manual: check the inbox | Devpost confirmation email received before 18:00 IST |

Optimise (before the final submit)
- Save the Devpost form as a draft on 22 Oct with everything filled, so 23 Oct is a review and a click, not writing. Measure: time spent in the form on submission day.
- Read the description as a judge skimming: the first two sentences must say what it does and that the MCP server is real.
- Re-run: T7.2 and T7.3.

---

## Phase 8: Keep alive (24 Oct to 20 Nov)

The rules require the project to stay available, free of charge, until the judging period ends on 20 Nov. Judges may test at any time between 9 and 20 Nov.

- [ ] Leave the ECS service at 1 task. Do not scale to zero.
- [ ] Demo data drifts: an order placed "inside the 30-day window" on 20 Oct is outside it by 20 Nov. Re-run `npm run seed` on 8 Nov (the day before judging opens) and again on 14 Nov, or make the seed script date orders relative to today and schedule it weekly.
- [ ] Shopify token: confirm the refresh still works; dev stores and their apps must not be deleted or paused.
- [ ] Weekly check: `/healthz`, one full flow in the simulator, the AWS bill.
- [ ] Do not push to the default branch after the deadline unless something is down; the submission is frozen.
- [ ] After 20 Nov: delete the ECS service, load balancer, Knowledge Base, vector store and table.

Tests (run weekly, and on 8 and 14 Nov after re-seeding)

| ID | How to run | Pass when |
|---|---|---|
| T8.1 | `BASE_URL=https://<service-url> npm run test:e2e` | Green. T2.19 is the drift check: the three orders still land on return, warranty claim and part |
| T8.2 | Manual: one full flow in the simulator with the judges' access code | Ends on the confirmation card |
| T8.3 | Manual: AWS billing console | Spend is on track to stay inside the credits through 20 Nov |

Optimise (once, on 24 Oct)
- Cost only, no code: delete old images from ECR, delete anything created during development that the demo does not use, and confirm the task size chosen in Phase 4 is still in place. Measure: dollars per day before and after.
- Schedule the re-seed so it does not depend on remembering.
- Re-run: T8.1 and T8.2.

Cost: an ECS Express Mode service is one Fargate task plus an Application Load Balancer, roughly USD 35 to 45 a month, so about USD 50 to 60 for 11 Oct to 20 Nov, plus a few dollars of Bedrock usage. This is an estimate; the billing alarm from Phase 0 is the control.

---

## Optional: real Alexa+ onboarding (only if Toolkit access arrives)

Not required for submission. Do this only after the feature freeze and only if access has been granted; it never displaces Phases 4 to 7.

- [ ] The Alexa tooling supports macOS and Ubuntu only. On this Windows machine, run it inside WSL.
- [ ] Alexa developer account: complete the profile, set the preferred marketplace to US and the device language to en-US.
- [ ] CodeArtifact login (token lasts 12 hours), then install the CLI:
  ```
  aws codeartifact login --tool npm --domain alexa-ai --repository npm-packages --domain-owner 372468808636 --region us-west-2 --namespace @alexa-ai --profile alexa-ai
  npm install -g @alexa-ai/cli @alexa-ai/addon-local-inspector
  alexa-ai configure
  alexa-ai new mcp --name "Aftercare Concierge" --locale en-US --mcp-server-url "https://<service-url>/mcp"
  ```
- [ ] Fill `addon-package/addon.json`: name (30 chars max), shortDescription (123), fullDescription, 3 to 4 example phrases, privacy policy and terms URLs (`/privacy` and `/terms` on our service), light icons in six sizes (72, 64, 88, 126, 180, 241), one 600x900 carousel image.
- [ ] `alexa-ai deploy`, then test in the Alexa+ web simulator (browser based, no device needed). Alexa+ only refreshes tool definitions on deploy.
- [ ] `addon-local-inspector https://<service-url>/mcp` for a CERTIFIED or CONDITIONAL verdict on both frame sizes.
- [ ] If it works, add 15 seconds of the real Alexa+ web simulator to the video and say so in the description.

Tests

| ID | How to run | Pass when |
|---|---|---|
| TA.1 | `alexa-ai deploy` | Returns an add-on ID and version |
| TA.2 | Manual: Alexa+ web simulator in Isolation mode, type "my blender stopped working" | `identify_product` is called on our server (visible in our logs) |
| TA.3 | `addon-local-inspector https://<service-url>/mcp` | Verdict CERTIFIED or CONDITIONAL on Small and Large |

Optimise (after TA.1 to TA.3 pass)
- Fix only the WARN rules in the Local Inspector report that take under 15 minutes each. Measure: count of WARN rules.
- Re-run: TA.3, then `npm run test:e2e`.

---

## Appendix: contracts every phase builds to

These are fixed. Tests assert them. Tool inputs and outputs are in `ARCHITECTURE.md` section 4 and DynamoDB keys in section 6.4; they are not repeated here.

### A1. Environment variables

| Name | Filled in | Value |
|---|---|---|
| `AWS_REGION` | Phase 0 | `us-west-2` |
| `AWS_PROFILE` | Phase 0 | `concierge` (local only; the deployed service uses its task role) |
| `PORT` | Phase 0 | `3001` |
| `SHOPIFY_STORE` | Phase 0 | the store subdomain, without `.myshopify.com` |
| `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | Phase 0 | from the app's Settings page in the Dev Dashboard |
| `DEMO_CUSTOMER_EMAIL` | Phase 0 | the one customer the build serves |
| `SIM_MODEL_ID` | Phase 0 | Bedrock model ID copied from the console |
| `SIM_ACCESS_CODE` | Phase 0 | long random string; given to judges |
| `MCP_URL` | Phase 1 | `http://localhost:3001/mcp` locally; the public `/mcp` URL on the service |
| `BASE_URL` | Phase 1 | test target; unset means `http://localhost:3001` |
| `GIT_SHA` | Phase 1 | set by the image build |
| `KB_ID` | Phase 2 | Bedrock Knowledge Base ID |
| `TABLE_NAME` | Phase 2 | `concierge` |

### A2. npm scripts

| Script | Does | Exists from |
|---|---|---|
| `dev` | `tsx watch src/main.ts` | Phase 1 |
| `build` | `tsc`, then the Vite single-file build of `ui/` and `sim/` into `dist/` | Phase 1 |
| `test` | `node --test` on `test/*.test.ts` | Phase 0 |
| `test:e2e` | `node --test` on `test/*.e2e.ts` | Phase 1 |
| `test:cases` | runs `test/cases.json` through `/sim/chat` | Phase 4 |
| `check:env` | T0.2 to T0.5 in one go | Phase 0 Optimise |
| `seed` | `scripts/seed-shopify.ts` | Phase 2 |
| `precompute` | `scripts/precompute.ts` | Phase 2 |
| `deploy` | build image, push, update service, wait for the new SHA | Phase 1 |

### A3. Demo data (invented products, no real brands)

| productId | Title | Price | Return window | Warranty | Symptom keys | Part |
|---|---|---|---|---|---|---|
| `problend900` | ProBlend 900 Blender | 89.00 | 30 days | 12 months | `wont-turn-on`, `leaking` | none that is cheap enough to rank first |
| `quietwave-h2` | QuietWave H2 Headphones | 129.00 | 30 days | 12 months | `no-sound-one-side`, `wont-pair` | none |
| `swiftboil-k1` | SwiftBoil K1 Kettle | 49.00 | 30 days | 24 months | `lid-wont-close`, `wont-heat` | Lid seal, 6.00, for `lid-wont-close` |

Each symptom key has 3 to 5 spoken aliases in `config/products.json` ("won't turn on", "dead", "stopped working").

The three seeded orders, dated relative to the day the seed runs:

| Order | Product | Purchased | Demo symptom | Expected top option |
|---|---|---|---|---|
| A | `problend900` | 34 days ago | `wont-turn-on` | Warranty claim ("4 days past the 30-day return window") |
| B | `quietwave-h2` | 10 days ago | `no-sound-one-side` | Return |
| C | `swiftboil-k1` | 200 days ago | `lid-wont-close` | Part (6.00 is under 20% of 49.00) |

Seed behaviour: find earlier orders tagged `concierge-demo` and cancel them; create the customer and products if missing; create the three orders, tagged, fulfilled; print the three order IDs. Safe to run any number of times.

### A4. Module contracts

```
src/policy.ts     resolve(input) -> { options: Option[] }            pure, no imports from AWS or Shopify
                  input  = { purchaseDate, today, price, returnWindowDays, warrantyMonths, parts, symptomKey? }
                  Option = { action: "return"|"warranty_claim"|"order_part"|"contact_merchant",
                             eligible: boolean, rank: number, reason: string, cost: number, detail?: object }
src/shopify.ts    findOrdersForCustomer(email) -> Order[]            ignores cancelled orders
                  getOrder(id) -> Order
                  getReturnableFulfillments(orderId) -> [{ fulfillmentLineItemId, lineItemId, quantity }]
                  createReturn(orderId, fulfillmentLineItemId, reason) -> { returnId }
                  createDraftOrder(variantId) -> { draftOrderId }
                  (token: fetched on first use, cached in memory, refreshed 5 minutes before expiry)
src/kb.ts         retrieveSteps(productId, symptom) -> { steps, source }   live path, product filter
src/db.ts         getSteps(productId, symptomKey), putSteps(...)
                  getSession(customerHash), putSession(...)
                  putOnce(idemHash, record) -> { created: boolean, record }   conditional put, returns the existing record when not created
                  deleteCustomer(customerHash) -> count
src/tools/<name>.ts   one registered tool each; validates with zod, calls one module, returns { content, structuredContent }
```

Every tool result: `content[0].text` is one or two sentences that make sense spoken aloud with no screen; `structuredContent` is what the card renders. Every tool call logs one JSON line, `{ tool, ms, ok, customerHash, orderId }`, and nothing else.

### A5. Simulator HTTP contract

All routes need the access code, as header `x-sim-code` or query `?code=`. Without it: 401.

```
GET  /sim                      the page
POST /sim/chat                 { sessionId, utterance }
                            -> { say, toolCalls: [{ name, arguments, ms, isError, text, structuredContent, resourceUri }] }
GET  /sim/resource?uri=ui://…  the HTML of a ui:// resource, read through the MCP client
POST /sim/tool                 { sessionId, name, arguments }   a card button's tool call
                            -> the same shape as one toolCalls entry
```

The agent and both helper routes reach the tools only through an MCP client connected to `MCP_URL`. The system prompt, in full: "You are a voice assistant on a smart display. Use the available tools to help the customer. Keep every reply to one or two short spoken sentences. Before any action that files, orders, returns or deletes something, ask the customer to confirm, and only then call the tool with confirmed set to true." No tool names, no product names, no flow.

Limits: 5 tool calls per turn, 30 turns per session, history trimmed to the last 10 turns.

### A6. `test/cases.json`

```json
[
  {
    "id": "blender-warranty",
    "turns": ["my blender stopped working", "it won't turn on", "still broken", "yes"],
    "expectTools": ["identify_product", "troubleshoot", "report_outcome", "file_warranty_claim"],
    "expectTopOption": "warranty_claim",
    "expectRecords": { "CLAIM": 1 }
  }
]
```

A case passes when the tools called across all turns contain `expectTools` in that order, the first options result has `expectTopOption` ranked first, and the customer's DynamoDB records match `expectRecords`. The runner resets data and uses a new `sessionId` before each case. The 20 cases: each product with 2 symptoms (6), each policy branch (4), unknown product, unknown symptom, "yes" said twice, refusal without confirmation, "cancel" at the confirmation, return refused outside the window, "what did you just file?", delete my data, voice-only wording check, and one off-topic utterance that must call no tool.

### A7. Commits

One commit per build-order step that leaves `npm test` green. Message: imperative, under 72 characters, body says why. Never commit with a red `npm test`. Never commit `.env`, `dist/` or `node_modules/`.

---

## Cut list (do not build unless everything above is done)

- `book_technician` and the home-services escalation (A7).
- Account linking with OAuth 2.1 and PKCE (would need an authorization server such as Cognito; 1 to 2 days). The demo identifies the customer from `DEMO_CUSTOMER_EMAIL`. Documented honestly in the README as the first production step.
- Ring arrival trigger, Bee integration, multi-merchant support, step images extracted from PDFs, non-English locales.
- Anything in the simulator beyond what the video needs: no accounts, no history, no settings.

## Daily rhythm

- Start: `git pull`, `npm test`.
- End: deploy if anything changed, friction log entries written, one line in `PROGRESS.md`.
