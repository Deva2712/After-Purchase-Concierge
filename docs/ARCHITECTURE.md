# After-Purchase Concierge: Architecture

A self-hosted MCP server, built to be an Alexa+ MCP add-on, that a merchant plugs in to handle everything after a purchase: troubleshooting from the product manual, then the cheapest resolution that solves the problem (return, warranty claim, or replacement part), with interactive cards on screen devices.

Status: design, 10 Oct 2026; revised 11 Oct 2026. Verify SDK import names against the `modelcontextprotocol/ext-apps` templates before coding; the v2 SDK is still a beta, so pin exact versions.

Revision of 11 Oct: Amazon's MCP Toolkit is "available to select partners only" and US only, so in this build the Alexa+ side is a simulated web app that we own (section 15). The hackathon rules allow this. The MCP server is unchanged and is what a real Alexa+ add-on would call. Hosting moved from App Runner (closed to new customers since 30 Apr 2026) to ECS Express Mode.

## 1. System context

```
 Customer (voice/touch, in a browser)
        |
        v
 +--------------------+    Streamable HTTP (MCP 2025-11-25)    +----------------------------+
 | Alexa+ simulator   | ------------------------------------> |  Concierge MCP server      |
 | (ours, section 15) |  POST https://<service-url>/mcp       |  Node 24 / TypeScript      |
 |  MCP client,       | <------------------------------------ |  ECS Express Mode          |
 |  Bedrock Converse  |  tool results + ui:// resources       |  (Fargate), us-west-2      |
 |  agent, speech,    |                                       +----------------------------+
 |  MCP Apps host in  |                                          |         |          |
 |  an Echo Show frame|                                          v         v          v
 +--------------------+                                Shopify Admin   Bedrock KB   DynamoDB
        :                                              GraphQL API    (manuals,     (steps cache,
        :  same contract                               (orders,        warranty      claims, returns,
        v                                               returns,        PDFs in S3)   parts orders,
 Real Alexa+ via the MCP add-on                         draft orders)                 session)
 (`alexa-ai deploy`, optional, only if
  Toolkit access is granted)
```

The client (the simulator here, Alexa+ in production) owns natural-language understanding, choosing which tool to call, speaking the result and rendering the UI. We own tools, data and the policy that ranks resolutions. We do not script what the assistant says; we design the data so the spoken answer is right. The simulator gets no private access to the server: it talks to `/mcp` over HTTP like any other MCP client, so everything it shows would also work from MCP Inspector or Alexa+.

## 2. Components

| Component | Responsibility | Tech |
|---|---|---|
| `src/main.ts` | HTTP entry point. `/mcp` (stateless MCP transport), `/healthz`, `/privacy`, `/terms`, `/data` (delete), and mounts the simulator at `/sim` | Express, `@modelcontextprotocol/express`, `@modelcontextprotocol/node` |
| `src/server.ts` | Builds an `McpServer` per request, registers tools and `ui://` resources | `@modelcontextprotocol/server`, `@modelcontextprotocol/ext-apps/server`, zod v4 |
| `src/tools/*.ts` | One file per tool. Thin: validate, call a module, shape the result | TypeScript |
| `src/policy.ts` | Pure decision engine. No I/O. Fully unit tested | TypeScript |
| `src/shopify.ts` | Admin GraphQL client: token refresh, orders, returnable fulfillments, `returnCreate`, `draftOrderCreate` | fetch, Admin API 2025-10 or later |
| `src/kb.ts` | Bedrock Knowledge Base `Retrieve` (live) and the offline `RetrieveAndGenerate` used by `scripts/precompute.ts` | `@aws-sdk/client-bedrock-agent-runtime` |
| `src/db.ts` | DynamoDB single-table access | `@aws-sdk/lib-dynamodb` |
| `ui/*.html` + `ui/*.ts` | Three MCP Apps views bundled to single HTML files | Vite, `vite-plugin-singlefile`, `@modelcontextprotocol/ext-apps` (App class) |
| `config/products.json` | Merchant policy per product: return window, warranty, known symptoms, parts | JSON |
| `scripts/precompute.ts` | Builds the structured troubleshooting steps cache from the Knowledge Base | one-off CLI |
| `sim/agent.ts` | The simulated Alexa+ brain: MCP client to `MCP_URL`, Bedrock `Converse` tool-use loop, `POST /sim/chat` | `@modelcontextprotocol/client`, `@aws-sdk/client-bedrock-runtime` |
| `sim/index.html` + `sim/host.ts` | The simulated device: transcript, speech in and out, Echo Show frame that hosts the `ui://` views | Vanilla JS, Web Speech API, `@modelcontextprotocol/ext-apps` host bridge |
| `Dockerfile` | Container image for ECS Express Mode | Node 24 |
| `addon-package/addon.json` | Optional. Alexa+ add-on manifest, created only if Toolkit access is granted | Alexa AI CLI |

## 3. Request flow (happy path, out-of-window order)

"Alexa+" below is whichever client is connected: the simulator in this build, real Alexa+ once onboarded. The messages are the same.

```
Customer: "Alexa, my blender stopped working."
Alexa+  -> tools/call identify_product { query: "blender" }
Server  -> Shopify: orders for DEMO_CUSTOMER_EMAIL, match line items by name/synonym
        <- { orderId, lineItemId, product: "ProBlend 900", purchaseDate, image }
          (also writes SESSION#<customer> so follow-ups need no re-identification)
Alexa+  : speaks "I found your ProBlend 900 from 15 September. What's it doing?"
Customer: "It won't turn on."
Alexa+  -> tools/call troubleshoot { productId, symptom: "won't turn on" }
Server  -> DynamoDB STEPS#problend900#wont-turn-on (precomputed from the manual)
           miss -> Bedrock Retrieve over the KB, light formatting (slower path)
        <- text summary for voice + structuredContent { steps[], source{doc,page} }
           _meta.ui.resourceUri = ui://concierge/steps.html
Alexa+  : renders the steps card, speaks step 1
Customer taps "Still broken" in the card
Card    -> app.callServerTool report_outcome { productId, worked: false }
Server  -> policy.resolve(purchaseDate, today, productPolicy, symptom)
        <- ranked options: [ warranty_claim (reason: "4 days past the 30-day window,
           11 months of warranty left"), order_part (blade assembly $18), return (ineligible) ]
           ui://concierge/options.html
Alexa+  : "You're 4 days past the return window but still under warranty. Want me to file the claim?"
Customer: "Yes."
Alexa+  -> tools/call file_warranty_claim { orderId, lineItemId, symptom, confirmed: true }
Server  -> DynamoDB CLAIM#<ulid> (idempotency key orderId+lineItemId+claim)
        <- { claimRef, nextStep: "Merchant replies within 2 business days" }
           ui://concierge/confirmation.html
Alexa+  : speaks the reference, shows the confirmation card
```

Total: 4 tool calls, 3 cards, no app opened.

## 4. Tool catalogue

All tools are stateless from the transport's point of view. Customer identity comes from `DEMO_CUSTOMER_EMAIL` in this build (see section 9). Every tool returns both `content[0].text` (one or two short sentences Alexa can speak) and `structuredContent` (what the card renders).

| Tool | Input (zod) | Output structuredContent | Side effects | UI |
|---|---|---|---|---|
| `identify_product` | `query: string` (product words or order number) | `{ candidates: [{ orderId, lineItemId, productId, title, purchaseDate, imageUrl }] }` | writes SESSION | none |
| `troubleshoot` | `productId: string, symptom: string` | `{ steps: [{ n, title, detail }], source: { document, page }, productId }` | none | steps |
| `report_outcome` | `productId: string, worked: boolean` | if worked: `{ resolved: true }`; else same as `get_resolution_options` | writes SESSION | options |
| `get_resolution_options` | `orderId, lineItemId, symptom?` | `{ options: [{ action, eligible, rank, reason, cost, detail }] }` | none | options |
| `create_return` | `orderId, lineItemId, reason, confirmed: boolean` | `{ returnId, qrPngDataUrl, pickup: { date, window } }` | Shopify `returnCreate`, DynamoDB RETURN | confirmation |
| `file_warranty_claim` | `orderId, lineItemId, symptom, confirmed: boolean` | `{ claimRef, nextStep }` | DynamoDB CLAIM | confirmation |
| `order_part` | `orderId, partVariantId, confirmed: boolean` | `{ draftOrderId, part, price, eta }` | Shopify `draftOrderCreate`, DynamoDB PART | confirmation |
| `delete_my_data` | `confirmed: boolean` | `{ deleted: number }` | deletes all items for the customer | none |

Rules
- Write tools reject `confirmed !== true` with `isError: false` and text "Please confirm with the customer before I do this" so Alexa+ asks for confirmation rather than failing.
- Tool descriptions say when to use the tool and when not to ("Use after troubleshooting failed. Do not call before `troubleshoot`."). The simulator reads them fresh from `tools/list` on every session; real Alexa+ only refreshes them on `alexa-ai deploy`.
- Annotations: read-only tools set `readOnlyHint: true`; write tools set `destructiveHint: false, idempotentHint: true`.

## 5. Decision engine (`src/policy.ts`)

Pure function. Inputs are dates and the product policy; output is a ranked list with reasons. This is the "Quality of the Idea" core, so it must be legible and tested.

```
resolve(input):
  daysSincePurchase = days(today - purchaseDate)
  return   = daysSincePurchase <= returnWindowDays
  warranty = daysSincePurchase <= warrantyMonths * 30.4
  part     = cheapest part in policy.parts whose `symptoms` includes the symptom key
  order of preference when eligible: part (if cost < 20% of price) > return > warranty > part > contact_merchant
  every option gets { eligible, reason } even when ineligible, so Alexa can explain "why not"
```

Why part first when cheap: it is the fastest fix for the customer and the cheapest for the merchant. Why return before warranty: a return refunds today; a claim takes days. The ordering is a 6-line table in code, easy to change in the demo if a judge asks.

Edge cases covered by tests: boundary day of the window, warranty exactly expired, no parts for the symptom, unknown symptom (falls through to return/warranty), purchase date in the future (data error -> contact_merchant).

## 6. Data

### 6.1 Shopify development store (system of record for orders)

- 3 products, 1 demo customer, 3 fulfilled orders with purchase dates chosen for the demo branches (inside window, outside window but under warranty, has a cheap part). The dates drift: an order inside the window on submission day is outside it by the end of judging on 20 Nov, so `scripts/seed-shopify.ts` dates orders relative to today and is re-run before and during the judging period.
- Auth: the app is created in the Shopify Dev Dashboard (admin-created custom apps cannot be created since 1 Jan 2026) and installed on the dev store. `src/shopify.ts` gets an access token with the client credentials grant from `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET`, keeps it in memory and refreshes it before its 24-hour expiry. Fallback if that grant is refused for the store: a one-time authorization code grant for an offline token.
- Queries: `orders(query: "email:<demo>")` with line items and fulfillments; `returnableFulfillments(orderId)` for `fulfillmentLineItemId`.
- Mutations: `returnCreate` (needs `write_returns`; order must have a fulfilled, unrefunded line item; creates the return in OPEN state and a reverse fulfillment order), `draftOrderCreate` for parts.
- The return QR code encodes the Shopify return ID plus a merchant URL; the label itself is simulated since carriers are out of scope.

### 6.2 `config/products.json` (merchant policy)

```json
{
  "problend900": {
    "title": "ProBlend 900 Blender",
    "shopifyProductId": "gid://shopify/Product/...",
    "price": 89.0,
    "returnWindowDays": 30,
    "warrantyMonths": 12,
    "manual": "manuals/problend900.pdf",
    "symptoms": {
      "wont-turn-on": { "aliases": ["won't turn on", "dead", "no power", "stopped working"], "severity": "high" },
      "leaking": { "aliases": ["leaks", "leaking from the base"], "severity": "medium" }
    },
    "parts": [
      { "name": "Blade assembly", "variantId": "gid://shopify/ProductVariant/...", "price": 18.0, "symptoms": ["leaking", "wont-blend"] }
    ]
  }
}
```

`ponytail:` policy lives in a JSON file; move to Shopify metafields when there is more than one merchant.

### 6.3 Bedrock Knowledge Base (manuals and warranty terms)

- S3 bucket with the PDFs plus a `<file>.metadata.json` sidecar per file: `{ "metadataAttributes": { "productId": "problend900", "docType": "manual" } }` so `Retrieve` can filter by product.
- Vector store: S3 Vectors via quick create (cheapest). Fallback: OpenSearch Serverless, which bills by the hour and would have to run until 20 Nov, so confirm S3 Vectors in us-west-2 first.
- Chunking: default fixed 300 tokens with 20% overlap; manuals are short.
- Offline: `scripts/precompute.ts` calls `RetrieveAndGenerate` per (product, symptom) with a prompt that returns strict JSON steps and the source page, then stores `STEPS#` items. Re-run after any manual changes.
- Live: `Retrieve` with `numberOfResults: 4`, product filter, returns chunks formatted into at most 4 steps. Used only on cache miss; slower than the 500 ms budget and said so in the friction log.

### 6.4 DynamoDB table `concierge` (on-demand, us-west-2)

| pk | sk | attributes |
|---|---|---|
| `CUST#<email-hash>` | `SESSION` | lastProductId, lastOrderId, lastSymptom, updatedAt, ttl (24 h) |
| `CUST#<email-hash>` | `CLAIM#<ulid>` | orderId, lineItemId, symptom, status, createdAt, idem |
| `CUST#<email-hash>` | `RETURN#<ulid>` | shopifyReturnId, orderId, lineItemId, pickupDate, idem |
| `CUST#<email-hash>` | `PART#<ulid>` | draftOrderId, variantId, price, idem |
| `STEPS#<productId>` | `<symptomKey>` | steps[], source, generatedAt |

Idempotency: `idem = sha256(orderId + lineItemId + action)` stored as a GSI-less conditional put (`attribute_not_exists(idem)` on an `IDEM#<hash>` item). A repeated "yes" returns the existing record instead of filing twice.

Delete: `Query pk = CUST#<hash>` then `BatchWrite` delete. Exposed as the `delete_my_data` tool and `DELETE /data`.

## 7. MCP Apps UI

- Three views in `ui/`: `steps.html`, `options.html`, `confirmation.html`. Vanilla JS, one CSS file inlined, bundled by Vite single-file so the CSP can stay empty (no external loads).
- Registered with `registerAppResource(server, name, "ui://concierge/<view>.html", { mimeType: RESOURCE_MIME_TYPE }, read dist file)`. Tools link with `_meta: { ui: { resourceUri } }` via `registerAppTool`.
- Client: `const app = new App({ name, version }); app.ontoolresult = render; await app.connect();` and buttons call `app.callServerTool({ name: "report_outcome", arguments })`. Set `ontoolresult` before `connect()`.
- Must render on Small (10" and below) and Large (11" and above) frames: 48px touch targets, 4.5:1 contrast, no horizontal scroll, text readable from 2 m. Verified by hand in the simulator's two frames; with `addon-local-inspector` as well if Toolkit access is granted.
- Display modes: inline cards. Voice-only devices (Echo Dot) get the same flow from `content[0].text` alone, so every text result must stand on its own.

## 8. Deployment

```
GitHub repo --(docker build, push)--> Amazon ECR --> Amazon ECS Express Mode service
   image: Node 24, npm ci && npm run build      start: node dist/main.js      port: 3001
   Express Mode creates: Fargate service (min 1 task), Application Load Balancer, HTTPS default URL
   health check path: /healthz
   env: SHOPIFY_STORE, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, KB_ID, TABLE_NAME, DEMO_CUSTOMER_EMAIL,
        MCP_URL, SIM_MODEL_ID, SIM_ACCESS_CODE, AWS_REGION=us-west-2
   roles: ecsTaskExecutionRole, ecsInfrastructureRoleForExpressServices (required by Express Mode)
   task role: bedrock:Retrieve, bedrock:RetrieveAndGenerate, bedrock:InvokeModel, dynamodb:* on the table
```

- App Runner was the first choice but closed to new customers on 30 Apr 2026; ECS Express Mode is AWS's named replacement. It needs a container image, hence the `Dockerfile`.
- Chosen over Lambda: an always-running task keeps the 500 ms round-trip budget with no cold start, and Express Mode provides the HTTPS URL and load balancer with no infrastructure code. `ponytail:` single task, min 1, max 1; raise the max when there is real traffic.
- One container serves both the MCP server and the simulator. `ponytail:` split them into two services when the simulator is no longer just a demo client.
- The service must stay up until the judging period ends on 20 Nov 2026. Estimated cost about USD 35 to 45 a month (one small Fargate task plus the load balancer); a billing alarm at USD 40 is the control.
- Local dev: `npm run dev` on 3001, open `http://localhost:3001/sim`. `cloudflared tunnel --url http://localhost:3001` when a public URL is needed.
- Optional Alexa+ onboarding (only with Toolkit access): `alexa-ai new mcp ... --mcp-server-url https://<url>/mcp`, edit `addon-package/addon.json`, `alexa-ai deploy`. Re-deploy after any tool or description change. The tooling supports macOS and Ubuntu only; use WSL on Windows.

## 9. Security and privacy

- Transport: HTTPS only, Host header validation from `@modelcontextprotocol/express`, CORS limited to our own origin plus localhost for the inspector (add the Alexa origins if onboarded).
- Simulator access: `/sim` and `/sim/chat` require `SIM_ACCESS_CODE`, given to judges in the Devpost testing instructions, because every turn spends Bedrock tokens. Turns per session are capped.
- Identity: no account linking in this build. The server serves one customer, fixed by `DEMO_CUSTOMER_EMAIL`. Production path is OAuth 2.1 authorization code with PKCE S256, static client registration, refresh tokens on every token response, PRM at `/.well-known/oauth-protected-resource`, 401/403 on unauthenticated tool calls, Alexa's redirect URIs registered. Cognito satisfies all of these. Documented in the README as the first production step.
- Confirm before acting: every write tool requires `confirmed: true`; idempotency prevents double filing.
- Data minimisation: customer key is a hash of the email; logs carry IDs, never names, emails or addresses; SESSION items expire in 24 h via TTL; claims and returns are kept 30 days (stated on `/privacy`).
- Secrets: Shopify client secret and the simulator access code in the ECS task environment from Secrets Manager; nothing in the repo.
- The manuals are our own documents for three invented products (gate G1 in the plan), so they can be committed, redistributed and shown on video; no customer content enters the Knowledge Base.

## 10. Latency budget (Alexa+ requires under 500 ms round trip)

| Tool | Path | Target |
|---|---|---|
| `identify_product` | Shopify GraphQL (1 query) | < 400 ms, cached per customer for 5 min in memory |
| `troubleshoot` | DynamoDB get | < 100 ms (cache miss via Bedrock Retrieve: 600 to 1200 ms, degraded path) |
| `get_resolution_options`, `report_outcome` | pure + DynamoDB | < 50 ms |
| `create_return` | Shopify mutation + DynamoDB | < 500 ms, acceptable if slightly over since it is a confirmed action |
| `file_warranty_claim` | DynamoDB put | < 50 ms |

Each tool logs its server-side duration; the simulator's tool-call panel shows the round trip as the client sees it. The budget covers the MCP tool call only. The simulator's own agent turn (a Bedrock model call) takes longer and is not part of it, just as Alexa+'s reasoning time is not.

## 11. Observability

CloudWatch logs from the ECS task, one JSON line per tool call: `{ tool, ms, ok, customerHash, orderId }`. Nothing else. `/healthz` returns the git SHA so the running version is obvious during judging.

## 12. Repo layout

```
after-purchase-concierge/
  config/products.json           merchant policy
  manuals/                       the 3 PDFs + .metadata.json sidecars (uploaded to S3)
  src/main.ts                    Express + MCP transport entry point (required technology, called at runtime)
  src/server.ts                  tool and resource registration
  src/tools/                     one file per tool
  src/policy.ts                  decision engine (pure)
  src/shopify.ts  src/kb.ts  src/db.ts
  ui/steps.html options.html confirmation.html + .ts + shared.css
  sim/agent.ts  sim/index.html  sim/host.ts     simulated Alexa+ (MCP client, agent, device frame)
  scripts/precompute.ts  scripts/seed-shopify.ts
  test/policy.test.ts  test/e2e.test.ts  test/cases.json
  Dockerfile
  docs/                          IMPLEMENTATION_PLAN.md, ARCHITECTURE.md, SRS.md
  FRICTION_LOG.md  README.md  LICENSE (MIT, standard file so GitHub shows it in About)
  addon-package/addon.json       optional, only if onboarded to real Alexa+
```

## 13. Decisions

| Decision | Choice | Because |
|---|---|---|
| Language | TypeScript | ext-apps SDK and Alexa templates are TypeScript-first |
| MCP SDK | v2 (`@modelcontextprotocol/server`), exact versions pinned | ext-apps depends on it; implements the current spec; the hackathon and Alexa+ require 2025-11-25 or later; v2 is a beta, so no version ranges |
| Transport mode | Stateless Streamable HTTP, new server per request | No session state to lose on restarts; simplest on any host |
| Hosting | ECS Express Mode (Fargate) | Warm, HTTPS, no infra code; App Runner is closed to new customers; Lambda cold starts would break the 500 ms budget |
| Demo surface | Our own simulated Alexa+ web app | The MCP Toolkit is partner-gated and US only; the rules allow a simulated experience; the server contract is identical |
| Simulator agent | Bedrock `Converse` with tool use | No extra vendor or API key; adds a second, real Bedrock integration for AWS Builder |
| Troubleshooting source | Precomputed steps from the KB, live Retrieve fallback | Meets latency; deterministic demo; KB still genuinely used (AWS Builder) |
| Orders backend | Shopify dev store | Real API, real returns, free; Amazon.com has no public order API |
| UI framework | None (vanilla JS) | Three small cards; a framework is weight with no payoff |
| Tests | `node:test` | Stdlib; no config |
| Identity | Fixed demo customer | Account linking needs an OAuth server; out of 13-day scope, documented |

## 14. References

- Alexa+ MCP Toolkit overview: https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html
- Alexa+ MCP QuickStart (CLI commands, addon.json, OAuth rules): https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html
- Set up your development environment (Node 24, us-west-2, CodeArtifact): https://developer.amazon.com/docs/alexaplus/add-ons/set-up-your-development-environment.html
- Local Inspector: https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-local-inspector.html
- Account linking: https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-account-linking.html
- MCP Add-on Design Guide: https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-design-guide.html
- MCP Apps extension SDK and spec: https://github.com/modelcontextprotocol/ext-apps
- MCP TypeScript SDK v2: https://github.com/modelcontextprotocol/typescript-sdk
- Bedrock Knowledge Bases retrieval: https://docs.aws.amazon.com/bedrock/latest/userguide/kb-how-retrieval.html
- Shopify `returnCreate`: https://shopify.dev/docs/api/admin-graphql/latest/mutations/returnCreate
- Hackathon rules: https://amazonappdev2026.devpost.com/rules
- Alexa+ docs home (Toolkit availability): https://developer.amazon.com/docs/alexaplus/add-ons/home.html
- App Runner availability change and ECS Express Mode migration: https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html
- ECS Express Mode getting started: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-getting-started.html
- Bedrock Converse tool use: https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use.html
- Shopify admin custom apps (legacy) and Dev Dashboard: https://shopify.dev/docs/apps/build/authentication-authorization/legacy/admin-custom-apps

## 15. Alexa+ simulator (demo surface)

Added 11 Oct 2026, placed last so the section numbers other documents refer to do not move.

Why it exists: we cannot register an add-on with real Alexa+ (Toolkit is partner-gated and US only). The hackathon rules say entrants can "simulate the Alexa+ experience in a web app using their own agentic tools". The simulator stands in for the four things Alexa+ does: understand the customer, choose a tool, speak the result, render the card.

```
Browser: /sim                                   Server process
+-----------------------------+      POST /sim/chat { utterance, sessionId }
| transcript + mic + speaker  | ---------------------------------------------> sim/agent.ts
| Echo Show frame (S / L)     |                                                  1. MCP client -> MCP_URL (Streamable HTTP)
|   sandboxed iframe          | <---------------------------------------------   2. tools/list -> Bedrock Converse toolConfig
|   = ui:// view              |      { say, toolCalls[{ name, ms, result }] }    3. model picks a tool -> tools/call
| tool-call panel             |                                                  4. result text back to the model -> `say`
+-----------------------------+
        | card button -> callServerTool -> host bridge -> POST /sim/tool -> MCP client -> POST /mcp
        | card HTML   <- GET /sim/resource?uri=ui://... <- MCP client resources/read
```

The exact request and response shapes, the system prompt and the limits are in `IMPLEMENTATION_PLAN.md` Appendix A5.

Rules
- The agent reaches the tools only through `MCP_URL` over HTTP, never by importing `src/tools`. This is what makes the demo evidence that the MCP server works.
- The agent's system prompt is short and generic ("you are a voice assistant; use the tools; keep replies to two sentences; ask before any action that files or orders something"). No tool names and no flow are scripted in it; routing must come from the tool descriptions, as it would on Alexa+.
- The confirmation contract stays in the tools (`confirmed: true`), not in the simulator.
- The device frame acts as an MCP Apps host: it reads the `ui://` resource before delivering the tool result, runs the view in a sandboxed iframe, and forwards `callServerTool` to `/mcp`. Start from `examples/basic-host` in the ext-apps repo.
- Two frame sizes (Small, Large) and a voice-only toggle that hides the frame.
- Speech uses the browser's Web Speech API; the text box always works as a fallback.
- Session history is kept in memory per `sessionId` and capped. `ponytail:` in-memory, lost on restart; move to DynamoDB if the simulator ever needs to survive a deploy mid-conversation.

What it does not claim: it is not Alexa's webview, its routing model is not Alexa's, and passing here is not certification. The README and the video say "simulated Alexa+ experience" in plain words.
