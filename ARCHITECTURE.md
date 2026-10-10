# After-Purchase Concierge: Architecture

An Alexa+ MCP add-on that a merchant plugs in to handle everything after a purchase: troubleshooting from the real manual, then the cheapest resolution that solves the problem (return, warranty claim, or replacement part), with interactive cards on screen devices.

Status: design, 10 Oct 2026. Verify SDK import names against the `modelcontextprotocol/ext-apps` templates before coding; the v2 SDK is new.

## 1. System context

```
 Customer (voice/touch)
        |
        v
 +----------------+      Streamable HTTP (MCP 2025-11-25)      +----------------------------+
 |    Alexa+      | ----------------------------------------> |  Concierge MCP server      |
 |  (MCP client,  |  POST https://<app-runner>/mcp            |  Node 24 / TypeScript      |
 |   reasoning,   | <---------------------------------------- |  AWS App Runner, us-west-2 |
 |   TTS, webview)|  tool results + ui:// resources           +----------------------------+
 +----------------+                                              |         |          |
        ^                                                        v         v          v
        |  add-on registered via `alexa-ai deploy`     Shopify Admin   Bedrock KB   DynamoDB
        |  (addon-package/addon.json)                  GraphQL API    (manuals,     (steps cache,
 Alexa+ MCP Add-on                                     (orders,        warranty      claims, returns,
 (registry + protocol translation,                     returns,        PDFs in S3)   parts orders,
  owned by Amazon)                                     draft orders)                 session)
```

Alexa+ owns natural-language understanding, choosing which tool to call, speaking the result and rendering the UI. We own tools, data and the policy that ranks resolutions. We cannot script what Alexa says; we design the data so the spoken answer is right.

## 2. Components

| Component | Responsibility | Tech |
|---|---|---|
| `src/main.ts` | HTTP entry point. `/mcp` (stateless MCP transport), `/healthz`, `/privacy`, `/terms`, `/data` (delete) | Express, `@modelcontextprotocol/express`, `@modelcontextprotocol/node` |
| `src/server.ts` | Builds an `McpServer` per request, registers tools and `ui://` resources | `@modelcontextprotocol/server`, `@modelcontextprotocol/ext-apps/server`, zod v4 |
| `src/tools/*.ts` | One file per tool. Thin: validate, call a module, shape the result | TypeScript |
| `src/policy.ts` | Pure decision engine. No I/O. Fully unit tested | TypeScript |
| `src/shopify.ts` | Admin GraphQL client: orders, returnable fulfillments, `returnCreate`, `draftOrderCreate` | fetch, Admin API 2025-10 or later |
| `src/kb.ts` | Bedrock Knowledge Base `Retrieve` (live) and the offline `RetrieveAndGenerate` used by `scripts/precompute.ts` | `@aws-sdk/client-bedrock-agent-runtime` |
| `src/db.ts` | DynamoDB single-table access | `@aws-sdk/lib-dynamodb` |
| `ui/*.html` + `ui/*.ts` | Three MCP Apps views bundled to single HTML files | Vite, `vite-plugin-singlefile`, `@modelcontextprotocol/ext-apps` (App class) |
| `config/products.json` | Merchant policy per product: return window, warranty, known symptoms, parts | JSON |
| `addon-package/addon.json` | Alexa+ add-on manifest: listing, example phrases, icons, MCP endpoint | Alexa AI CLI |
| `scripts/precompute.ts` | Builds the structured troubleshooting steps cache from the Knowledge Base | one-off CLI |

## 3. Request flow (happy path, out-of-window order)

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
- Tool descriptions say when to use the tool and when not to ("Use after troubleshooting failed. Do not call before `troubleshoot`."). Alexa+ only refreshes descriptions on `alexa-ai deploy`.
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

- 3 products, 1 demo customer, 3 fulfilled orders with purchase dates chosen for the demo branches (inside window, outside window but under warranty, has a cheap part).
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
- Vector store: S3 Vectors via quick create (cheapest). Fallback: OpenSearch Serverless.
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
- Must render on Small (10" and below) and Large (11" and above) frames: 48px touch targets, 4.5:1 contrast, no horizontal scroll, text readable from 2 m. Verified with `addon-local-inspector`.
- Display modes: inline cards. Voice-only devices (Echo Dot) get the same flow from `content[0].text` alone, so every text result must stand on its own.

## 8. Deployment

```
GitHub repo --(App Runner source connection)--> AWS App Runner service (Node 24)
   build: npm ci && npm run build      start: node dist/main.js      port: 3001
   env: SHOPIFY_STORE, SHOPIFY_TOKEN, KB_ID, TABLE_NAME, DEMO_CUSTOMER_EMAIL, AWS_REGION=us-west-2
   instance role: bedrock:Retrieve, bedrock:RetrieveAndGenerate, bedrock:InvokeModel, dynamodb:* on the table
```

- App Runner chosen over Lambda: always-warm process keeps the 500 ms round-trip budget, HTTPS URL for free, no API Gateway. `ponytail:` single instance, min 1; scale settings untouched.
- EventBridge rule hits `/healthz` every 5 minutes so the instance is never idle during judging.
- Local dev: `npm run dev` on 3001 plus `cloudflared tunnel --url http://localhost:3001`; point a second development-stage add-on at the tunnel so deploys are not needed for every change.
- Onboarding: `alexa-ai new mcp ... --mcp-server-url https://<url>/mcp`, edit `addon-package/addon.json`, `alexa-ai deploy`. Re-deploy after any tool or description change.

## 9. Security and privacy

- Transport: HTTPS only, Host header validation from `@modelcontextprotocol/express`, CORS limited to Alexa origins plus localhost for the inspector.
- Identity: no account linking in this build. The server serves one customer, fixed by `DEMO_CUSTOMER_EMAIL`. Production path is OAuth 2.1 authorization code with PKCE S256, static client registration, refresh tokens on every token response, PRM at `/.well-known/oauth-protected-resource`, 401/403 on unauthenticated tool calls, Alexa's redirect URIs registered. Cognito satisfies all of these. Documented in the README as the first production step.
- Confirm before acting: every write tool requires `confirmed: true`; idempotency prevents double filing.
- Data minimisation: customer key is a hash of the email; logs carry IDs, never names, emails or addresses; SESSION items expire in 24 h via TTL; claims and returns are kept 30 days (stated on `/privacy`).
- Secrets: Shopify token in App Runner environment from Secrets Manager; nothing in the repo.
- The manuals are public manufacturer documents; no customer content enters the Knowledge Base.

## 10. Latency budget (Alexa+ requires under 500 ms round trip)

| Tool | Path | Target |
|---|---|---|
| `identify_product` | Shopify GraphQL (1 query) | < 400 ms, cached per customer for 5 min in memory |
| `troubleshoot` | DynamoDB get | < 100 ms (cache miss via Bedrock Retrieve: 600 to 1200 ms, degraded path) |
| `get_resolution_options`, `report_outcome` | pure + DynamoDB | < 50 ms |
| `create_return` | Shopify mutation + DynamoDB | < 500 ms, acceptable if slightly over since it is a confirmed action |
| `file_warranty_claim` | DynamoDB put | < 50 ms |

Each tool logs its server-side duration; the Local Inspector reports end-to-end.

## 11. Observability

CloudWatch logs from App Runner, one JSON line per tool call: `{ tool, ms, ok, customerHash, orderId }`. Nothing else. `/healthz` returns the git SHA so the running version is obvious during judging.

## 12. Repo layout

```
after-purchase-concierge/
  addon-package/addon.json       Alexa+ manifest (required technology, visible in code)
  config/products.json           merchant policy
  manuals/                       the 3 PDFs + .metadata.json sidecars (uploaded to S3)
  src/main.ts                    Express + MCP transport entry point
  src/server.ts                  tool and resource registration
  src/tools/                     one file per tool
  src/policy.ts                  decision engine (pure)
  src/shopify.ts  src/kb.ts  src/db.ts
  ui/steps.html options.html confirmation.html + .ts + shared.css
  scripts/precompute.ts  scripts/seed-shopify.ts
  test/policy.test.ts  test/e2e.test.ts  test/cases.json
  FRICTION_LOG.md  README.md  LICENSE (MIT)
```

## 13. Decisions

| Decision | Choice | Because |
|---|---|---|
| Language | TypeScript | ext-apps SDK and Alexa templates are TypeScript-first |
| MCP SDK | v2 (`@modelcontextprotocol/server`) | ext-apps depends on it; implements the current spec; Alexa+ requires 2025-11-25 or later |
| Transport mode | Stateless Streamable HTTP, new server per request | No session state to lose on restarts; simplest on any host |
| Hosting | App Runner | Warm, HTTPS, zero infra code; Lambda cold starts would break the 500 ms budget |
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
