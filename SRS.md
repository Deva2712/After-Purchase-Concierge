# Software Requirements Specification: After-Purchase Concierge

Version 1.0, 10 Oct 2026. Alexa+ MCP add-on for the Amazon Developer Hackathon.

## 1. Introduction

### 1.1 Purpose
This document states what the After-Purchase Concierge must do and how well, for the people building it over 13 days and for the judges who will test it. It is the contract that `IMPLEMENTATION_PLAN.md` schedules and `ARCHITECTURE.md` realises.

### 1.2 Scope
A self-hosted MCP server, onboarded to Alexa+ as an MCP add-on, that lets a merchant's customer resolve a problem with a purchased product by voice and touch: troubleshooting from the product manual, then the cheapest eligible resolution among return, warranty claim and replacement part. It integrates with a Shopify development store (orders, returns, parts), Amazon Bedrock Knowledge Bases (manuals and warranty terms) and Amazon DynamoDB (state).

Out of scope: technician booking, customer account linking, Amazon.com orders, carriers and shipping labels, multiple merchants, locales other than en-US.

### 1.3 Definitions
| Term | Meaning |
|---|---|
| Alexa+ | Amazon's LLM-based assistant that acts as the MCP client |
| MCP add-on | The Alexa+ registration of our MCP server, created with the Alexa AI CLI |
| MCP Apps | MCP extension that lets a tool return an HTML view (`ui://` resource) rendered in the Alexa+ conversation |
| Streamable HTTP | The MCP transport Alexa+ requires (spec 2025-11-25 or later) |
| Resolution | One of: return, warranty claim, replacement part, contact merchant |
| Demo customer | The single customer identity this build serves, set by `DEMO_CUSTOMER_EMAIL` |
| KB | Amazon Bedrock Knowledge Base |

### 1.4 References
See `ARCHITECTURE.md` section 14.

## 2. Overall description

### 2.1 Product perspective
Alexa+ handles speech, intent, tool selection, response wording and UI hosting. The Concierge exposes tools, resources and data. The merchant backend is Shopify. The system is stateless per request; durable state lives in DynamoDB.

### 2.2 User classes
| Class | Description | Needs |
|---|---|---|
| Customer | Owns an Echo Show or Echo Dot, bought a product from the merchant | Fix it fast, or know the best way out, without opening an app |
| Merchant operator | Runs the Shopify store | Fewer avoidable returns; claims and returns land in their existing systems |
| Hackathon judge | Alexa, AWS and product leaders | A real, polished integration; visible use of MCP, MCP Apps, Bedrock, DynamoDB; privacy handled |
| Developer | The team, with Claude Code | Clear requirements, repeatable deploy |

### 2.3 Operating environment
- Server: Node 24+, TypeScript, AWS App Runner in us-west-2, public HTTPS URL.
- Client: Alexa+ (en-US, US marketplace) on Echo Show (screen) and Echo Dot (voice only), plus the Alexa+ web simulator and the Alexa Add-on Local Inspector.
- Dependencies: Shopify Admin GraphQL API, Amazon Bedrock (Knowledge Bases, one text model), DynamoDB, S3.

### 2.4 Constraints
- C1. MCP protocol version 2025-11-25 or later over Streamable HTTP. Legacy SSE is not accepted by Alexa+.
- C2. Alexa+ requires tool round-trip responses under 500 ms.
- C3. Alexa+ refreshes tool definitions only on `alexa-ai deploy`.
- C4. The add-on manifest (`addon.json`) has fixed limits: name 30 chars, short description 123, full description 4000, 3 to 4 example phrases of 200 chars, six light icon sizes, one 600x900 carousel image, HTTPS privacy and terms URLs.
- C5. The MCP Toolkit is in Private Preview, US-only; access must be granted before device testing.
- C6. Amazon.com has no public order API; the product is a merchant integration.
- C7. 13 calendar days, one or two developers.
- C8. Hackathon rules: repo must call the required technology in code; video under 3 minutes in English; open-source licence or reviewers invited.

### 2.5 Assumptions
- A1. Private Preview access is granted by 13 Oct 2026. If not, FR-1 to FR-12 are still verifiable through MCP Inspector and the Local Inspector, and FR-13 is documented as blocked.
- A2. The three demo products have text-based (not scanned) manuals.
- A3. A single demo customer is acceptable to judges when the account-linking path is documented.
- A4. S3 Vectors is available as the KB vector store in us-west-2; otherwise OpenSearch Serverless is used.

## 3. Functional requirements

Priority: M = must (demo breaks without it), S = should (judges will notice), C = could (cut list).

### 3.1 MCP server and add-on
| ID | Requirement | Priority |
|---|---|---|
| FR-1 | The server SHALL expose an MCP endpoint at `POST /mcp` using Streamable HTTP, protocol 2025-11-25 or later, in stateless mode. | M |
| FR-2 | The server SHALL be reachable at a public HTTPS URL and SHALL answer `GET /healthz` with 200 and the running git SHA. | M |
| FR-3 | The server SHALL be registered as an Alexa+ MCP add-on via the Alexa AI CLI, with a complete `addon-package/addon.json` meeting C4. | M |
| FR-4 | The server SHALL list all tools in section 3.2 via `tools/list` with descriptions that state when to use and when not to use each tool. | M |
| FR-5 | The server SHALL serve `/privacy` and `/terms` pages over HTTPS for the add-on listing. | M |

### 3.2 Tools
| ID | Requirement | Priority |
|---|---|---|
| FR-6 | `identify_product(query)` SHALL return the demo customer's matching order line items (order ID, line item ID, product ID, title, purchase date, image URL) from Shopify, matching on product title and configured aliases, and SHALL record the match in the customer session. | M |
| FR-7 | `troubleshoot(productId, symptom)` SHALL return 1 to 4 numbered steps derived from the product's manual, with the source document and page, and a spoken summary. Steps SHALL come from the precomputed cache when the symptom is a known symptom, otherwise from a live KB retrieval. | M |
| FR-8 | `report_outcome(productId, worked)` SHALL record the outcome and, when `worked` is false, SHALL return the ranked resolution options as in FR-9 in the same response. | M |
| FR-9 | `get_resolution_options(orderId, lineItemId, symptom?)` SHALL return every resolution (return, warranty claim, replacement part, contact merchant) with `eligible`, `rank`, `reason`, `cost` and `detail`, computed by the policy in section 3.3. | M |
| FR-10 | `create_return(orderId, lineItemId, reason, confirmed)` SHALL, when `confirmed` is true and the return is eligible, create a return in Shopify (`returnCreate`), store a RETURN record, and return the return ID, a QR code image (data URL) and a pickup date. | M |
| FR-11 | `file_warranty_claim(orderId, lineItemId, symptom, confirmed)` SHALL, when `confirmed` is true and warranty is active, store a CLAIM record with a human-readable reference and next step. | M |
| FR-12 | `order_part(orderId, partVariantId, confirmed)` SHALL, when `confirmed` is true, create a Shopify draft order for the part, store a PART record, and return part name, price and ETA. | S |
| FR-13 | The full flow (FR-6 to FR-11) SHALL be completable by voice on an Alexa+ device or the web simulator through the deployed add-on. | M |
| FR-14 | `delete_my_data(confirmed)` SHALL delete every stored item for the demo customer and return the count. `DELETE /data?customer=<id>` SHALL do the same over HTTP. | S |
| FR-15 | Write tools (FR-10, FR-11, FR-12, FR-14) called with `confirmed` not equal to true SHALL NOT perform the action and SHALL return a non-error message asking for customer confirmation. | M |
| FR-16 | Write tools SHALL be idempotent on `(orderId, lineItemId, action)`: a repeated call SHALL return the existing record and SHALL NOT create a second return, claim or draft order. | M |
| FR-17 | Write tools SHALL refuse ineligible actions (for example a return outside the window) with a spoken reason and the next best option. | M |

### 3.3 Decision policy
| ID | Requirement | Priority |
|---|---|---|
| FR-18 | Eligibility SHALL be computed from purchase date, today's date and the product's `returnWindowDays` and `warrantyMonths` in `config/products.json`. A return is eligible when days since purchase is less than or equal to `returnWindowDays`; warranty is active when days since purchase is less than or equal to `warrantyMonths` x 30.4. | M |
| FR-19 | A replacement part SHALL be offered when a configured part lists the symptom key and SHALL rank first when its price is below 20% of the product price; otherwise ranking SHALL be return, then warranty claim, then part, then contact merchant. | M |
| FR-20 | Every option, eligible or not, SHALL carry a one-sentence reason suitable for speech (for example "4 days past the 30-day return window, 11 months of warranty remain"). | M |
| FR-21 | The policy SHALL be a pure function with unit tests covering: window boundary day, warranty expiry day, no matching part, unknown symptom, purchase date in the future. | M |

### 3.4 User interface (MCP Apps)
| ID | Requirement | Priority |
|---|---|---|
| FR-22 | `troubleshoot` SHALL link a `ui://concierge/steps.html` view showing numbered steps, the product image, the source page, and "It worked" / "Still broken" buttons that call `report_outcome`. | M |
| FR-23 | `get_resolution_options` and `report_outcome` SHALL link a `ui://concierge/options.html` view listing options with reason and cost and a "Choose" button per eligible option. | M |
| FR-24 | `create_return`, `file_warranty_claim` and `order_part` SHALL link a `ui://concierge/confirmation.html` view showing the reference, QR code when present, and next step. | M |
| FR-25 | Every tool SHALL also return `content[0].text` that conveys the same outcome in one or two sentences so voice-only devices complete the flow. | M |
| FR-26 | Views SHALL render correctly on Small (10" and below) and Large (11" and above) Alexa device frames as verified by the Local Inspector. | M |

### 3.5 Data and merchant integration
| ID | Requirement | Priority |
|---|---|---|
| FR-27 | The Shopify development store SHALL contain 3 products, 1 customer and 3 fulfilled orders dated so that one is inside the return window, one is outside the window but under warranty, and one has a configured part for a known symptom. | M |
| FR-28 | The KB SHALL index the three manuals and warranty terms from S3 with a `productId` metadata attribute per document, and `troubleshoot` SHALL filter retrieval by product. | M |
| FR-29 | A `precompute` script SHALL generate structured steps for every (product, known symptom) pair using the KB and store them in DynamoDB, and SHALL be re-runnable. | M |
| FR-30 | State (session, claims, returns, parts, steps cache) SHALL be stored in one DynamoDB table as specified in `ARCHITECTURE.md` section 6.4, with session items expiring after 24 hours. | M |

### 3.6 Submission artefacts
| ID | Requirement | Priority |
|---|---|---|
| FR-31 | The repository SHALL contain the MCP server entry point, `addon.json`, Bedrock and DynamoDB SDK calls as code (not only README mentions), an MIT licence, and run instructions a stranger can follow in 15 minutes. | M |
| FR-32 | A `FRICTION_LOG.md` SHALL record every tooling problem with task, steps, expected, actual, severity, workaround and suggestion. | S |
| FR-33 | A public demo video under 3 minutes in English SHALL show the real flow on an Alexa+ surface, the architecture with every AWS service named, and the confirmation and privacy controls. | M |

## 4. Non-functional requirements

| ID | Requirement | Measure |
|---|---|---|
| NFR-1 Latency | Server-side time per tool under the budget in `ARCHITECTURE.md` section 10; `troubleshoot` from cache under 100 ms; all read tools under 400 ms end to end | Logged `ms` per call; Local Inspector data-layer report |
| NFR-2 Availability | Server warm and reachable throughout 19 to 24 Oct 2026 | `/healthz` pinged every 5 minutes; zero failed pings on submission day |
| NFR-3 Reliability | 20-case voice test set passes twice consecutively on the deployed server | `test/cases.json` run log |
| NFR-4 Safety | No purchase, return, claim or deletion without `confirmed: true`; no duplicates | FR-15, FR-16 tests |
| NFR-5 Privacy | No names, emails, addresses or order contents in logs; customer key is a hash; retention stated on `/privacy` (sessions 24 h, records 30 days) | Log review of one full demo run |
| NFR-6 Security | HTTPS only; Host header validation; secrets in App Runner environment, none in the repo; CORS limited to Alexa origins and localhost | Repo scan, curl checks |
| NFR-7 Accessibility | 48 px minimum touch targets, 4.5:1 text contrast, no horizontal scrolling, readable at 2 m | Local Inspector visual rules pass |
| NFR-8 Maintainability | Policy is pure and unit tested; one file per tool; dependencies limited to those listed in `CLAUDE.md` | `npm test` green; dependency count |
| NFR-9 Portability | The MCP server works with any MCP client (Inspector, Claude Desktop) independent of Alexa+ | `tools/list` and `tools/call` via MCP Inspector |
| NFR-10 Cost | AWS spend under the free tier plus at most USD 30 for the hackathon period | Billing console on 24 Oct |

## 5. External interfaces

| Interface | Direction | Protocol | Notes |
|---|---|---|---|
| Alexa+ -> server | inbound | MCP over Streamable HTTP, JSON-RPC, HTTPS | `POST /mcp`; stateless; `Mcp-Session-Id` not used |
| Alexa+ -> server | inbound | `resources/read` of `ui://` URIs | Host reads the view before the first `tools/call` |
| Server -> Shopify | outbound | Admin GraphQL API, bearer token | Scopes: read_orders, read_customers, read_products, write_returns, write_draft_orders |
| Server -> Bedrock | outbound | `bedrock-agent-runtime` Retrieve / RetrieveAndGenerate | IAM instance role |
| Server -> DynamoDB | outbound | AWS SDK v3 | Single table `concierge` |
| Developer -> Alexa+ | tooling | `alexa-ai new mcp`, `alexa-ai deploy`, `alexa-ai submit` | Credentials in `~/.alexa-ai/credentials` |
| Developer -> server | tooling | `addon-local-inspector <url>/mcp` | HTTPS required for remote upstreams |

## 6. Acceptance tests (judge's view)

| ID | Scenario | Pass when |
|---|---|---|
| AT-1 | "Alexa, my blender stopped working." | Alexa+ names the correct order and asks what is wrong, or goes straight to steps |
| AT-2 | "It won't turn on." | Steps card appears with the manual's reset procedure and a source page; Alexa speaks step 1 |
| AT-3 | Tap "Still broken" | Options card appears; Alexa says the customer is past the return window but under warranty and offers to file the claim |
| AT-4 | "Yes." | Confirmation card with a claim reference; a CLAIM item exists in DynamoDB |
| AT-5 | "Yes." again | Same reference returned; no second CLAIM item |
| AT-6 | "Alexa, return my headphones." (inside window) | Return eligibility confirmed, confirmation requested, then QR code card; a return exists in Shopify admin |
| AT-7 | "Return my blender." (outside window) | Refused with the reason and the warranty option offered |
| AT-8 | Same flow on an Echo Dot or voice-only simulator | Flow completes with speech alone |
| AT-9 | `addon-local-inspector` full run | Verdict CERTIFIED or CONDITIONAL on both device sizes |
| AT-10 | "Alexa, delete my concierge data." | Confirmation requested, then count of deleted items; DynamoDB shows none for the customer |

## 7. Traceability to judging criteria

| Criterion | Requirements that earn it |
|---|---|
| Technical implementation | FR-1 to FR-4, FR-13, FR-28 to FR-30, NFR-1, NFR-9 (real Streamable HTTP MCP, MCP Apps, Bedrock KB, DynamoDB, real Shopify data) |
| Design | FR-22 to FR-26, NFR-7 (cards on both device sizes, voice parity) |
| Potential impact | FR-9, FR-17 to FR-20 (avoidable returns prevented, cheapest resolution, any merchant can adopt) |
| Quality of the idea | FR-7 to FR-9, FR-19, FR-20 (fix first, then the ranked resolution with spoken reasons) |
| AWS Builder mini challenge | FR-28, FR-29, FR-30, App Runner hosting, FR-33 architecture segment |
| Friction log bonus | FR-32 |

## 8. Open questions

| # | Question | Owner | Decide by |
|---|---|---|---|
| Q1 | Has Private Preview access to the MCP Toolkit been granted? | team | 13 Oct 2026 |
| Q2 | Can a device registered to an Indian Amazon account be switched to the US marketplace for Alexa+ testing, or is the web simulator the only surface? | team via Discord/office hours | 13 Oct 2026 |
| Q3 | Is S3 Vectors available for KB quick create in us-west-2 today? | team | 14 Oct 2026 |
| Q4 | Does the Alexa+ host honour `readOnlyHint`/`destructiveHint` annotations for confirmation prompts, or must confirmation stay entirely in our tool contract (FR-15 assumes the latter)? | team via Local Inspector run | 17 Oct 2026 |
