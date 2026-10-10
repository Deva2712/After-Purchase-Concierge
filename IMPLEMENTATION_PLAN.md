# After-Purchase Concierge: Phase-wise Implementation Plan

Alexa+ track, Amazon Developer Hackathon ("Build, Ship, Shape"). Idea A1 from `Amazon_Hackathon_Idea_Analysis.docx` (score 8.25, best Alexa+ pick). Mini challenge: AWS Builder.

| Item | Value |
|---|---|
| Plan written | 10 Oct 2026 |
| Hard deadline | 24 Oct 2026, 00:30 IST |
| Working deadline | 23 Oct 2026, 18:00 IST |
| Days available | 13 |
| Feature freeze | 18 Oct 2026, 22:00 IST |

## The one-sentence pitch

"Alexa, my blender stopped working." Alexa+ walks the customer through the fix from the real manual on the Echo Show; if that fails it picks the cheapest path that solves the problem (return if in window, else warranty claim, else replacement part) and files it, all in under a minute, no app opened.

## Rules for the whole build

1. One persona, one flow, three products. Everything else is cut.
2. Real platform first: a deployed Streamable HTTP MCP server onboarded with the Alexa AI CLI. The "simulated web app" path is the fallback, never the plan.
3. Every phase ends with something that runs end to end, even if ugly.
4. Friction log entries are written the moment friction happens, not at the end (up to 10% judging bonus).
5. Nothing destructive (return, claim, part order) happens without an explicit confirmation turn.

## Phase overview

| Phase | Dates | Goal | Done when |
|---|---|---|---|
| 0. Access and environment | 10 to 11 Oct | Every account, CLI and credential works | `alexa-ai --version` works, Shopify dev store exists, Bedrock model access granted |
| 1. Skeleton on the real platform | 11 to 13 Oct | Hello-world MCP server reachable from Alexa+ | A tool call from the Alexa+ simulator or device returns text from our server |
| 2. Data and decision engine | 13 to 16 Oct | Real orders, real manuals, policy logic | `identify_product`, `troubleshoot`, `get_resolution_options` work on real data with tests passing |
| 3. Experience | 16 to 18 Oct | MCP Apps cards and the write actions | Full demo flow runs on Echo Show or simulator; Local Inspector verdict CERTIFIED or CONDITIONAL |
| 4. Hardening | 19 to 20 Oct | Reliable, fast, private | 20-case test set green, latency budget met, privacy controls done |
| 5. Packaging | 21 Oct | Repo a judge can run | README, licence, diagram, setup, feedback and friction log drafted |
| 6. Video | 22 Oct | Under 3 minutes, public | Uploaded and link verified from an incognito window |
| 7. Submit | 23 Oct | Submitted by 18:00 IST | Devpost confirmation email received |

Critical path: Phase 0 access to the Alexa+ MCP Toolkit (Private Preview). Nothing in Phase 1 can finish without it. Request it first thing on 10 Oct.

---

## Phase 0: Access and environment (10 to 11 Oct)

Goal: remove every "can I even do this?" question before writing product code.

Tasks
- [ ] Request Alexa+ MCP Toolkit Private Preview access from the Alexa developer console (`https://developer.amazon.com/alexa/console/ask/addons`). Join the hackathon Discord and ask how non-US developers test on device. Log the response time in the friction log.
- [ ] Alexa developer account: complete profile in the Alexa app, add phone and address, set preferred marketplace to a supported Alexa+ marketplace (US) and device language to en-US.
- [ ] AWS account, region us-west-2 (the Alexa AI CLI expects it). Create IAM user and `alexa-ai` CLI profile. Run the CodeArtifact login (token lasts 12 hours, you will re-run this daily):
  ```
  aws codeartifact login --tool npm --domain alexa-ai --repository npm-packages --domain-owner 372468808636 --region us-west-2 --namespace @alexa-ai --profile alexa-ai
  npm install -g @alexa-ai/cli
  alexa-ai --version
  alexa-ai configure
  ```
- [ ] Install Node 24+, `@alexa-ai/addon-local-inspector`, `@playwright/cli` and run `playwright-cli install-browser`.
- [ ] Install the Alexa Add-on Agent Skill into Claude Code (recommended onboarding path in the Amazon docs).
- [ ] Bedrock: request model access in us-west-2 for one Claude model (for the offline precompute step and the live fallback) and the Titan or Cohere embeddings model the Knowledge Base will use.
- [ ] Shopify Partners account and a free development store. Enable the Admin API custom app with scopes `read_orders`, `read_customers`, `read_products`, `write_returns`, `write_draft_orders`.
- [ ] Pick the three demo products and download their real manuals and warranty terms as PDFs (a blender, a pair of headphones, a kettle or similar; one must have a user-replaceable part such as a blade assembly or ear pads).
- [ ] Create the repo `after-purchase-concierge` with MIT licence, `.gitignore`, `FRICTION_LOG.md` with the template from the analysis doc.

Done when
- `alexa-ai --version` and `alexa-ai configure` succeed.
- Shopify dev store has 3 products and the Admin API returns them from a curl call.
- Bedrock model access shows "Access granted".
- Preview access is requested and the request date is logged.

Fallback decision (13 Oct, 22:00 IST): if Preview access has not arrived, continue Phases 2 to 4 unchanged (the server is testable with MCP Inspector and the Local Inspector) and keep asking daily. The architecture does not change; only the Phase 1 "connected to Alexa+" step moves later. If access never arrives, document that in the README and the friction log and submit anyway.

---

## Phase 1: Skeleton on the real platform (11 to 13 Oct)

Goal: the thinnest possible server, deployed at a public HTTPS URL, visible as an add-on in Alexa+.

Tasks
- [ ] `npm init` with TypeScript, `@modelcontextprotocol/server@^2`, `@modelcontextprotocol/node@^2`, `@modelcontextprotocol/express@^2`, `@modelcontextprotocol/ext-apps`, `zod@^4`, `express`, `cors`. Start from the `examples/basic-server-vanillajs` template in the `modelcontextprotocol/ext-apps` repo and delete what is not needed.
- [ ] `src/main.ts`: Express app, `app.all("/mcp")`, new `McpServer` and `NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined })` per request (stateless). `GET /healthz` returns 200.
- [ ] One tool, `ping`, returning "concierge online". Verify with `npx @modelcontextprotocol/inspector` locally.
- [ ] Deploy: AWS App Runner service from the GitHub repo (Node 24 runtime, `npm ci && npm run build`, start `node dist/main.js`, port 3001). App Runner gives an HTTPS URL with no certificate work. Set `AWS_REGION=us-west-2`.
- [ ] Local dev tunnel for fast iteration: `cloudflared tunnel --url http://localhost:3001`.
- [ ] Onboard: either ask the Add-on Agent Skill in Claude Code to onboard the server URL, or manually:
  ```
  alexa-ai new mcp --name "Aftercare Concierge" --locale en-US --mcp-server-url "https://<app-runner-url>/mcp"
  ```
  Fill `addon-package/addon.json`: name (30 chars max), shortDescription (123), fullDescription, 3 to 4 example phrases, privacy policy and terms URLs (host two static pages on the same App Runner service), icons in all six sizes light (72, 64, 88, 126, 180, 241), one 600x900 carousel image.
- [ ] `alexa-ai deploy`. Open the web simulator, say an example phrase, confirm `ping` is invoked. Then on a real Echo Show if one is linked to the account.
- [ ] Friction log: every step above that did not match its docs.

Done when
- Alexa+ (simulator or device) speaks a response that came from our deployed server.
- `alexa-ai deploy` is a repeatable one-liner (remember: Alexa+ only refreshes tool definitions on deploy).

Risks
- Preview access not granted: see Phase 0 fallback.
- addon.json rejected for asset reasons: generate the six icon sizes with one ImageMagick command from a single 512px PNG.

---

## Phase 2: Data and decision engine (13 to 16 Oct)

Goal: the intelligence. Real orders from Shopify, real troubleshooting steps from the manuals, deterministic policy logic that picks the cheapest resolution.

Tasks
- [ ] Shopify: 3 products with prices, a demo customer, 3 orders placed on chosen dates so the demo has one order inside the return window, one just outside it but under warranty, one with a cheap replacement part. Mark orders as fulfilled (returns require a fulfilled line item).
- [ ] `src/shopify.ts`: GraphQL client. Functions: `findOrdersForCustomer(email)`, `getOrder(id)`, `getReturnableFulfillments(orderId)`, `createReturn(orderId, fulfillmentLineItemId, reason)`, `createDraftOrder(variantId)`.
- [ ] `config/products.json`: per product, `returnWindowDays`, `warrantyMonths`, `knownSymptoms[]`, `parts[]` (name, variantId, price), `manualS3Key`. Shopify does not model warranty, so this is the merchant policy file. (`ponytail:` JSON file; move to Shopify metafields when more than one merchant.)
- [ ] Knowledge Base: S3 bucket `concierge-manuals-<acct>` with the 3 manuals and warranty PDFs. Bedrock Knowledge Base, quick create, S3 data source, S3 Vectors store (cheapest; fall back to OpenSearch Serverless if S3 Vectors is unavailable in us-west-2). Sync. Test in the console: "blender motor does not start".
- [ ] `src/kb.ts`: `retrieveSteps(productName, symptom)` using `RetrieveCommand` from `@aws-sdk/client-bedrock-agent-runtime`, `numberOfResults: 4`, with a metadata filter on product.
- [ ] `scripts/precompute.ts`: for each product x knownSymptom, call `RetrieveAndGenerateCommand` with a strict prompt that outputs JSON `{ steps: [{ title, detail }], source: { document, page } }`, and store in DynamoDB. This is how `troubleshoot` stays under the 500 ms round-trip limit at demo time. Live `Retrieve` remains the fallback for unknown symptoms.
- [ ] DynamoDB table `concierge` (on-demand), PK `pk`, SK `sk`. Item types: `STEPS#<product>#<symptom>`, `CLAIM#<id>`, `RETURN#<id>`, `PART#<id>`, `SESSION#<customer>` (last identified product, for follow-up turns).
- [ ] `src/policy.ts`, pure function, no I/O:
  `resolve({ purchaseDate, today, returnWindowDays, warrantyMonths, parts, symptomSeverity }) -> RankedOptions`. Order: fix (already tried) -> return if inside window -> warranty claim if inside warranty -> cheapest part if one matches the symptom -> technician (out of scope, returns "contact merchant"). Each option carries a one-line reason Alexa can speak ("4 days past the 30-day return window, but 11 months of warranty remain").
- [ ] Tools wired: `identify_product`, `troubleshoot`, `get_resolution_options`. All read-only in this phase.
- [ ] Tests with `node:test`: `policy.test.ts` covers window boundary days (day 30 vs day 31), warranty expiry, no parts, all-expired. One integration test that hits the deployed `/mcp` with `tools/list` and `tools/call identify_product`.

Done when
- From MCP Inspector: "my blender won't turn on" -> `identify_product` returns the blender order -> `troubleshoot` returns the manual's reset steps with a source page -> `get_resolution_options` ranks "warranty claim" first for the out-of-window order.
- `npm test` is green.

Risks
- KB retrieval quality is poor on a scanned PDF: pick manuals that are text PDFs, not scans.
- Shopify `returnCreate` fails: check `userErrors`, confirm the line item is fulfilled and unrefunded and the app has `write_returns`.

---

## Phase 3: Experience (16 to 18 Oct)

Goal: the demo moment. Cards on the Echo Show, and the write actions that make the flow real.

Tasks
- [ ] Three MCP Apps views, each a single HTML file built by Vite with `vite-plugin-singlefile`, vanilla JS, no framework:
  1. `ui://concierge/steps.html`: numbered troubleshooting steps, product image, "It worked" and "Still broken" buttons that call `callServerTool` with `report_outcome`.
  2. `ui://concierge/options.html`: ranked resolution options with the reason line and price, one "Choose" button per option.
  3. `ui://concierge/confirmation.html`: return QR code (generated server side with the `qrcode` package) or claim reference, pickup date, "Done".
- [ ] Register with `registerAppTool` / `registerAppResource` from `@modelcontextprotocol/ext-apps/server`; `_meta.ui.resourceUri` on each tool; `mimeType: RESOURCE_MIME_TYPE`.
- [ ] Write tools, each requiring `confirmed: true` in its input and refusing otherwise (Alexa+ gets a clear "ask the customer to confirm" message): `create_return`, `file_warranty_claim`, `order_part`. Each writes a DynamoDB record and, for return and part, calls Shopify. Idempotency key = `orderId + lineItemId + action` so a repeated voice command cannot double-file.
- [ ] `report_outcome(worked: boolean)` records whether the fix worked and, if not, returns the resolution options directly so the flow continues in one tool call.
- [ ] Run `addon-local-inspector https://<url>/mcp`, let the inspector skill in Claude Code run a full inspection. Fix everything in the Small (10" and below) and Large (11" and above) frames: touch targets, contrast, no blank widget on first call (host reads the resource before the first `tools/call`).
- [ ] `alexa-ai deploy`, then run the full flow by voice on the simulator and on a device. Time it. Target under 60 seconds from "my blender stopped working" to the return QR code.
- [ ] 18 Oct 22:00 IST: feature freeze. Anything not working is cut, not fixed tomorrow.

Done when
- The full flow runs by voice with cards at each step, on both device sizes in the Local Inspector, with a CERTIFIED or CONDITIONAL verdict.
- A real return exists in the Shopify dev store admin after the demo run.

---

## Phase 4: Hardening (19 to 20 Oct)

Goal: it never embarrasses you on camera or in front of a judge who clicks around.

Tasks
- [ ] 20-case test set in `test/cases.json` (utterance, expected tool, expected top option). Covers: each product x 2 symptoms, each policy branch, unknown product, unknown symptom, double confirmation, "cancel", "what did you just file?".
- [ ] Latency: log per-tool server time; `troubleshoot` from precomputed steps under 150 ms, policy under 10 ms, Shopify calls under 400 ms. Warm App Runner with a `/healthz` ping every 5 minutes (EventBridge rule) so there is no cold start during the demo.
- [ ] Error handling: every tool returns a short, speakable error (`isError: true`) rather than a stack trace. Shopify down -> "I can't reach the store right now, try again in a minute."
- [ ] Privacy: no order contents or emails in logs (log IDs only); `DELETE /data?customer=<id>` plus `delete_my_data` tool that wipes the customer's DynamoDB items; privacy policy page states retention (30 days) and that nothing is bought or returned without confirmation.
- [ ] `addon.json` descriptions and example phrases rewritten against what actually works.
- [ ] Re-run Local Inspector; re-deploy; re-run the 20 cases by voice; fix only blockers.

Done when
- 20 of 20 cases pass twice in a row on the deployed server.
- No PII in CloudWatch logs for a full demo run.

---

## Phase 5: Packaging (21 Oct)

Tasks
- [ ] README: what it does, 90-second architecture tour, exact run steps (`npm ci`, env vars, `npm run dev`, `alexa-ai deploy`), where the required technology is called in code (link to `src/main.ts` for the MCP server entry point, `addon-package/addon.json`, `src/kb.ts` for Bedrock, `src/db.ts` for DynamoDB).
- [ ] Architecture diagram PNG exported from `ARCHITECTURE.md` (Mermaid or Excalidraw), naming every AWS service for the AWS Builder judges.
- [ ] Product feedback drafts for: Alexa AI CLI, MCP Toolkit docs, Local Inspector, MCP Apps SDK, Bedrock Knowledge Bases, App Runner. One concrete "what needs work" each, from the friction log.
- [ ] Friction log cleaned, dated, severity-rated.
- [ ] Repo public with MIT licence, or private with `testing@devpost.com` and the listed Amazon reviewers invited (invitations expire after 7 days, so invite on submission day too).

Done when a stranger can clone, set 6 env vars and reach `tools/list` in under 15 minutes.

---

## Phase 6: Video (22 Oct)

Script (under 2:59, English narration, captions on, no copyrighted music):

| Time | On screen |
|---|---|
| 0:00 to 0:20 | Blender dies on camera. "Alexa, my blender stopped working." Echo Show shows step 1 from the manual. |
| 0:20 to 0:45 | The problem in one line: manuals, return windows and warranty forms are three separate chores, so people return things a two-minute fix would have saved. |
| 0:45 to 1:45 | Full flow: steps card, "still broken", options card says "4 days past the return window, but under warranty", claim filed, confirmation card. Then the second product: return inside window, QR code. |
| 1:45 to 2:20 | Architecture diagram: Alexa+ -> MCP add-on -> our Streamable HTTP server on App Runner -> Shopify Admin API, Bedrock Knowledge Base over the real manuals, DynamoDB. Say each name. |
| 2:20 to 2:45 | Trust: confirm before any action, source page shown on every step, delete-my-data. |
| 2:45 to 2:59 | Who it helps: any merchant on Alexa+, fewer avoidable returns. |

Record device footage, not slides. Upload public to YouTube, check from a logged-out browser.

---

## Phase 7: Submit (23 Oct, by 18:00 IST)

- [ ] Devpost form: description, repo link, video link, track Alexa+, mini challenge AWS Builder, AWS services fields, product feedback, friction log attached, optional feature requests with urgency.
- [ ] Re-invite reviewers to the repo if private.
- [ ] Final `alexa-ai deploy`; confirm the server answers `tools/list` from a fresh network.
- [ ] Submit. Screenshot the confirmation.

---

## Cut list (do not build unless everything above is done)

- `book_technician` and the home-services escalation (A7).
- Account linking with OAuth 2.1 and PKCE (would need an authorization server such as Cognito; 1 to 2 days). The demo identifies the customer from `DEMO_CUSTOMER_EMAIL`. Documented honestly in the README as the first production step.
- Ring arrival trigger, Bee integration, multi-merchant support, step images extracted from PDFs, non-English locales.

## Daily rhythm

- Start: `aws codeartifact login ...` (token expires every 12 hours), `git pull`, `npm test`.
- End: `alexa-ai deploy` if tools changed, friction log entries written, one line in `PROGRESS.md`.
