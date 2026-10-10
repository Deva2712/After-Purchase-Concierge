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

"Alexa, my blender stopped working." Alexa+ walks the customer through the fix from the real manual on the Echo Show; if that fails it picks the cheapest path that solves the problem (return if in window, else warranty claim, else replacement part) and files it, all in under a minute, no app opened.

## What changed on 11 Oct

| Was | Now | Why |
|---|---|---|
| Real Alexa+ through the MCP Toolkit is the plan; a simulated web app is the fallback | The simulated Alexa+ web app is the demo surface; real Alexa+ onboarding is an optional extra | Amazon's docs say the MCP Toolkit is "available to select partners only" and US only. The hackathon rules do not require it: they ask for a self-hosted MCP server and explicitly allow simulating the Alexa+ experience in a web app. |
| Host on AWS App Runner | Host on Amazon ECS Express Mode (Fargate) | App Runner closed to new customers on 30 Apr 2026. |
| Shopify custom app created in the store admin, static `SHOPIFY_TOKEN` | App created in the Shopify Dev Dashboard, token fetched with the client credentials grant and refreshed | Admin-created custom apps can no longer be created since 1 Jan 2026; client credentials tokens expire after 24 hours. |
| Server up through 24 Oct | Server up through 20 Nov | The rules require the project to be available for testing until the judging period ends. |
| AWS credits assumed possible | All AWS spend is our own | Credit requests closed on 7 Oct. |
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

## Phase overview

| Phase | Dates | Goal | Done when |
|---|---|---|---|
| 0. Accounts and environment | 11 Oct | Every account and credential works | Shopify Admin API returns products, Bedrock model access works, pinned SDK versions install |
| 1. Skeleton, deployed | 11 to 13 Oct | Hello-world MCP server on a public HTTPS URL, called by the simulator | Typing "ping" in the deployed simulator returns text that came through `POST /mcp` |
| 2. Data and decision engine | 13 to 16 Oct | Real orders, real manuals, policy logic | `identify_product`, `troubleshoot`, `get_resolution_options` work on real data with tests passing |
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

Tasks
- [ ] AWS account, region us-west-2. IAM user and a named CLI profile. Set a billing alarm at USD 40.
- [ ] Bedrock in us-west-2: confirm access to one Claude model (used by the precompute step and by the simulator's agent) and the embeddings model the Knowledge Base will use. Confirm S3 Vectors is offered for Knowledge Base quick create in us-west-2; otherwise plan on OpenSearch Serverless (costs more, so check before choosing).
- [ ] Shopify: in the Dev Dashboard, create the development store from the Dev stores page (not from the Shopify admin: the store and the app must be in the same organization or the token call fails with `shop_not_permitted`). Create the app in the same Dev Dashboard (admin-created custom apps no longer exist), select scopes `read_orders`, `read_customers`, `read_products`, `write_returns`, `write_draft_orders` on the app version, release it, and install it on the dev store. Get an Admin API token with the client credentials grant (`POST https://<store>.myshopify.com/admin/oauth/access_token` with `grant_type=client_credentials`, `client_id`, `client_secret`) and confirm a curl call with the `X-Shopify-Access-Token` header returns products. Log anything that does not match the docs in the friction log.
- [ ] Node 24+, Docker Desktop (needed to build the image for ECS).
- [ ] Check the current MCP SDK v2 versions (`npm view @modelcontextprotocol/server dist-tags`). v2 is still a beta, so every `@modelcontextprotocol/*` package is pinned to an exact version in `package.json`.
- [ ] Pick the three demo products and download their real manuals and warranty terms as text PDFs, not scans (a blender, a pair of headphones, a kettle or similar; one must have a user-replaceable part such as a blade assembly or ear pads).
- [ ] Repo: MIT licence in a standard `LICENSE` file at the root (GitHub must detect it and show it in the About section), `.gitignore`, `FRICTION_LOG.md`.
- [ ] Join the hackathon Discord. Ask once whether participants can get MCP Toolkit access; log the answer and the response time. Do not wait for it.

Done when
- The Shopify dev store has 3 products and the Admin API returns them from a curl call.
- A Bedrock `Converse` call from the CLI profile returns text.
- `npm ci` installs the pinned MCP packages.

---

## Phase 1: Skeleton, deployed (11 to 13 Oct)

Goal: the thinnest possible server at a public HTTPS URL, with the thinnest possible simulator calling it.

Tasks
- [ ] `npm init` with TypeScript, `@modelcontextprotocol/server`, `@modelcontextprotocol/node`, `@modelcontextprotocol/express`, `@modelcontextprotocol/client`, `@modelcontextprotocol/ext-apps`, `zod@^4`, `express`, `cors`. Start from the `examples/basic-server-vanillajs` template in the `modelcontextprotocol/ext-apps` repo and delete what is not needed.
- [ ] `src/main.ts`: Express app, `app.all("/mcp")`, new `McpServer` and `NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined })` per request (stateless). `GET /healthz` returns 200 and the git SHA.
- [ ] One tool, `ping`, returning "concierge online". Verify with `npx @modelcontextprotocol/inspector` locally.
- [ ] Simulator, first cut (`sim/`): `POST /sim/chat` takes an utterance, connects to `MCP_URL` as an MCP client over Streamable HTTP, lists tools, runs a Bedrock `Converse` tool-use loop, returns the spoken reply and any tool results. `GET /sim` serves one HTML page with a text box and a transcript. Gate both behind `SIM_ACCESS_CODE`.
- [ ] `Dockerfile` (Node 24, `npm ci && npm run build`, `node dist/main.js`, port 3001). Push to ECR. Create the ECS Express Mode service (min 1 task, health check path `/healthz`) with the two IAM roles it needs plus a task role for Bedrock and DynamoDB. Confirm the default URL is HTTPS.
- [ ] Deploy script or GitHub Action so a deploy is one command.
- [ ] Friction log: every step above that did not match its docs.

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

Tasks
- [ ] Shopify: 3 products with prices, a demo customer, 3 orders placed on chosen dates so the demo has one order inside the return window, one just outside it but under warranty, one with a cheap replacement part. Mark orders as fulfilled (returns require a fulfilled line item). The seed script must be re-runnable, because order dates drift out of their windows between now and 20 Nov (see Phase 8).
- [ ] `src/shopify.ts`: GraphQL client that holds the access token in memory and refreshes it before expiry. Functions: `findOrdersForCustomer(email)`, `getOrder(id)`, `getReturnableFulfillments(orderId)`, `createReturn(orderId, fulfillmentLineItemId, reason)`, `createDraftOrder(variantId)`.
- [ ] `config/products.json`: per product, `returnWindowDays`, `warrantyMonths`, `knownSymptoms[]`, `parts[]` (name, variantId, price), `manualS3Key`. Shopify does not model warranty, so this is the merchant policy file. (`ponytail:` JSON file; move to Shopify metafields when more than one merchant.)
- [ ] Knowledge Base: S3 bucket `concierge-manuals-<acct>` with the 3 manuals and warranty PDFs. Bedrock Knowledge Base, quick create, S3 data source, S3 Vectors store. Sync. Test in the console: "blender motor does not start".
- [ ] `src/kb.ts`: `retrieveSteps(productName, symptom)` using `RetrieveCommand` from `@aws-sdk/client-bedrock-agent-runtime`, `numberOfResults: 4`, with a metadata filter on product.
- [ ] `scripts/precompute.ts`: for each product x knownSymptom, call `RetrieveAndGenerateCommand` with a strict prompt that outputs JSON `{ steps: [{ title, detail }], source: { document, page } }`, and store in DynamoDB. This is how `troubleshoot` stays under the 500 ms round-trip limit. Live `Retrieve` remains the fallback for unknown symptoms.
- [ ] DynamoDB table `concierge` (on-demand), PK `pk`, SK `sk`. Item types: `STEPS#<product>#<symptom>`, `CLAIM#<id>`, `RETURN#<id>`, `PART#<id>`, `SESSION#<customer>` (last identified product, for follow-up turns).
- [ ] `src/policy.ts`, pure function, no I/O:
  `resolve({ purchaseDate, today, returnWindowDays, warrantyMonths, parts, symptomSeverity }) -> RankedOptions`. Order: fix (already tried) -> return if inside window -> warranty claim if inside warranty -> cheapest part if one matches the symptom -> technician (out of scope, returns "contact merchant"). Each option carries a one-line reason Alexa can speak ("4 days past the 30-day return window, but 11 months of warranty remain").
- [ ] Tools wired: `identify_product`, `troubleshoot`, `get_resolution_options`. All read-only in this phase.
- [ ] Tests with `node:test`: `policy.test.ts` covers window boundary days (day 30 vs day 31), warranty expiry, no parts, all-expired. One integration test that hits the deployed `/mcp` with `tools/list` and `tools/call identify_product`.

Done when
- In the simulator: "my blender won't turn on" -> `identify_product` returns the blender order -> `troubleshoot` returns the manual's reset steps with a source page -> `get_resolution_options` ranks "warranty claim" first for the out-of-window order.
- `npm test` is green.

Risks
- KB retrieval quality is poor on a scanned PDF: pick manuals that are text PDFs, not scans.
- Shopify `returnCreate` fails: check `userErrors`, confirm the line item is fulfilled and unrefunded and the app has `write_returns`.

---

## Phase 3: Experience (16 to 18 Oct)

Goal: the demo moment. Cards in an Echo Show frame, and the write actions that make the flow real.

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

Done when
- The full flow runs by voice in the simulator with cards at each step, in both frame sizes and in voice-only mode.
- A real return exists in the Shopify dev store admin after the demo run.

---

## Phase 4: Hardening (19 to 20 Oct)

Goal: it never embarrasses you on camera or in front of a judge who clicks around.

Tasks
- [ ] 20-case test set in `test/cases.json` (utterance, expected tool, expected top option), run through `POST /sim/chat`. Covers: each product x 2 symptoms, each policy branch, unknown product, unknown symptom, double confirmation, "cancel", "what did you just file?".
- [ ] Latency: log per-tool server time; `troubleshoot` from precomputed steps under 150 ms, policy under 10 ms, Shopify calls under 400 ms. The ECS service runs a minimum of 1 task, so there is no cold start.
- [ ] Error handling: every tool returns a short, speakable error (`isError: true`) rather than a stack trace. Shopify down -> "I can't reach the store right now, try again in a minute."
- [ ] Privacy: no order contents or emails in logs (log IDs only); `DELETE /data?customer=<id>` plus `delete_my_data` tool that wipes the customer's DynamoDB items; privacy policy page states retention (30 days) and that nothing is bought or returned without confirmation.
- [ ] Abuse and cost: the simulator spends Bedrock tokens, so it stays behind `SIM_ACCESS_CODE` and caps turns per session. Tool descriptions rewritten against what actually works.
- [ ] Re-run the 20 cases; fix only blockers.

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

Done when a stranger can clone, set the env vars and reach `tools/list` in under 15 minutes.

---

## Phase 6: Video (22 Oct)

Script (under 2:59, English narration, captions on, no copyrighted music, no third-party trademarks: use invented product names on screen, not real brands).

| Time | On screen |
|---|---|
| 0:00 to 0:20 | Blender dies on camera. "Alexa, my blender stopped working." The simulated Echo Show shows step 1 from the manual. A caption says "Simulated Alexa+ experience, real MCP server". |
| 0:20 to 0:45 | The problem in one line: manuals, return windows and warranty forms are three separate chores, so people return things a two-minute fix would have saved. |
| 0:45 to 1:45 | Full flow: steps card, "still broken", options card says "4 days past the return window, but under warranty", claim filed, confirmation card. Then the second product: return inside window, QR code, and the return appearing in the Shopify admin. The tool-call panel is visible throughout. |
| 1:45 to 2:20 | Architecture diagram: simulated Alexa+ (Bedrock Converse agent, MCP client) -> our Streamable HTTP MCP server on ECS Express Mode -> Shopify Admin API, Bedrock Knowledge Base over the real manuals, DynamoDB. Say each name. Show MCP Inspector listing the same tools from the public URL. |
| 2:20 to 2:45 | Trust: confirm before any action, source page shown on every step, delete-my-data. Voice-only mode for an Echo Dot. |
| 2:45 to 2:59 | Who it helps: any merchant on Alexa+, fewer avoidable returns. The server is ready to onboard to Alexa+ as an add-on. |

Screen-record the deployed simulator, not a local build and not slides. Upload public to YouTube, check from a logged-out browser.

---

## Phase 7: Submit (23 Oct, by 18:00 IST)

- [ ] Devpost form: description, repo link, video link, track Alexa+, mini challenge AWS Builder, product feedback (including the AWS services), testing instructions with the simulator URL and access code, friction log entries, optional feature requests.
- [ ] Re-seed the Shopify orders so the dates sit in the right windows.
- [ ] Re-invite reviewers to the repo if private.
- [ ] Confirm the server answers `tools/list` and the simulator loads from a fresh network.
- [ ] Submit. Screenshot the confirmation.

---

## Phase 8: Keep alive (24 Oct to 20 Nov)

The rules require the project to stay available, free of charge, until the judging period ends on 20 Nov. Judges may test at any time between 9 and 20 Nov.

- [ ] Leave the ECS service at 1 task. Do not scale to zero.
- [ ] Demo data drifts: an order placed "inside the 30-day window" on 20 Oct is outside it by 20 Nov. Re-run `npm run seed` on 8 Nov (the day before judging opens) and again on 14 Nov, or make the seed script date orders relative to today and schedule it weekly.
- [ ] Shopify token: confirm the refresh still works; dev stores and their apps must not be deleted or paused.
- [ ] Weekly check: `/healthz`, one full flow in the simulator, the AWS bill.
- [ ] Do not push to the default branch after the deadline unless something is down; the submission is frozen.
- [ ] After 20 Nov: delete the ECS service, load balancer, Knowledge Base, vector store and table.

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

---

## Cut list (do not build unless everything above is done)

- `book_technician` and the home-services escalation (A7).
- Account linking with OAuth 2.1 and PKCE (would need an authorization server such as Cognito; 1 to 2 days). The demo identifies the customer from `DEMO_CUSTOMER_EMAIL`. Documented honestly in the README as the first production step.
- Ring arrival trigger, Bee integration, multi-merchant support, step images extracted from PDFs, non-English locales.
- Anything in the simulator beyond what the video needs: no accounts, no history, no settings.

## Daily rhythm

- Start: `git pull`, `npm test`.
- End: deploy if anything changed, friction log entries written, one line in `PROGRESS.md`.
