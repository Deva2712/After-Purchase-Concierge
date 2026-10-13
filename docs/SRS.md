# Software Requirements Specification: After-Purchase Concierge

Version 1.1, 11 Oct 2026 (1.0 was 10 Oct 2026). Self-hosted MCP server for the Alexa+ track of the Amazon Developer Hackathon.

Changes in 1.1, after checking the official rules and the Amazon, AWS and Shopify docs: the Alexa+ surface is our own simulated web app, because the MCP Toolkit is partner-gated and US only (FR-13, FR-34 to FR-37); Alexa+ add-on registration is optional (FR-3); hosting is ECS Express Mode (App Runner is closed to new customers); the deployment must stay up until 20 Nov 2026 (NFR-2); Shopify auth uses the Dev Dashboard; submission requirements follow the rules text (FR-31 to FR-33, FR-38, FR-39).

## 1. Introduction

### 1.1 Purpose
This document states what the After-Purchase Concierge must do and how well, for the people building it over 12 days and for the judges who will test it. It is the contract that `IMPLEMENTATION_PLAN.md` schedules and `ARCHITECTURE.md` realises.

### 1.2 Scope
A self-hosted MCP server, designed to be onboarded to Alexa+ as an MCP add-on, that lets a merchant's customer resolve a problem with a purchased product by voice and touch: troubleshooting from the product manual, then the cheapest eligible resolution among return, warranty claim and replacement part. It integrates with a Shopify development store (orders, returns, parts), Amazon Bedrock Knowledge Bases (manuals and warranty terms) and Amazon DynamoDB (state). A simulated Alexa+ web app, which is an ordinary MCP client of that server, is the surface on which the experience is tested and demonstrated.

Out of scope: technician booking, customer account linking, Amazon.com orders, carriers and shipping labels, multiple merchants, locales other than en-US. Registration with real Alexa+ is optional and depends on Amazon granting MCP Toolkit access.

### 1.3 Definitions
| Term | Meaning |
|---|---|
| Alexa+ | Amazon's LLM-based assistant that acts as the MCP client |
| Simulator | Our web app at `/sim` that stands in for Alexa+: an MCP client, a Bedrock agent that chooses tools, speech, and an Echo Show frame that hosts the MCP Apps views |
| MCP Toolkit | Amazon's tooling for registering an MCP server with Alexa+ (Alexa AI CLI, web simulator, Local Inspector). Available to select partners only, US only |
| MCP add-on | The Alexa+ registration of our MCP server, created with the Alexa AI CLI. Optional in this build |
| MCP Apps | MCP extension that lets a tool return an HTML view (`ui://` resource) rendered in the Alexa+ conversation |
| Streamable HTTP | The MCP transport Alexa+ requires (spec 2025-11-25 or later) |
| Resolution | One of: return, warranty claim, replacement part, contact merchant |
| Demo customer | The single customer identity this build serves, set by `DEMO_CUSTOMER_EMAIL` |
| KB | Amazon Bedrock Knowledge Base |

### 1.4 References
See `ARCHITECTURE.md` section 14.

## 2. Overall description

### 2.1 Product perspective
The client handles speech, intent, tool selection, response wording and UI hosting: the simulator in this build, Alexa+ in production. The Concierge exposes tools, resources and data, and does not know which client is calling. The merchant backend is Shopify. The system is stateless per request; durable state lives in DynamoDB.

### 2.2 User classes
| Class | Description | Needs |
|---|---|---|
| Customer | Owns an Echo Show or Echo Dot, bought a product from the merchant | Fix it fast, or know the best way out, without opening an app |
| Merchant operator | Runs the Shopify store | Fewer avoidable returns; claims and returns land in their existing systems |
| Hackathon judge | Alexa, AWS and product leaders | A real, polished integration; visible use of MCP, MCP Apps, Bedrock, DynamoDB; privacy handled |
| Developer | The team, with Claude Code | Clear requirements, repeatable deploy |

### 2.3 Operating environment
- Server: Node 24+, TypeScript, one container on Amazon ECS Express Mode (Fargate) in us-west-2, public HTTPS URL.
- Client: the simulator in a current desktop Chrome or Edge (the Web Speech API is not complete in every browser; typing always works), with Small and Large Echo Show frames and a voice-only mode. Also any standard MCP client, such as MCP Inspector. Optional, with Toolkit access: Alexa+ (en-US, US marketplace), its web simulator and the Local Inspector.
- Dependencies: Shopify Admin GraphQL API, Amazon Bedrock (Knowledge Bases, one text model used by precompute and by the simulator's agent), DynamoDB, S3, ECR.

### 2.4 Constraints
- C1. MCP protocol version 2025-11-25 or later over Streamable HTTP. This is the hackathon's required technology for the track, and legacy SSE is not accepted by Alexa+.
- C2. Alexa+ requires tool round-trip responses under 500 ms. No host enforces this in the simulator; we keep it as a design constraint so the server is ready to onboard.
- C3. Alexa+ refreshes tool definitions only on `alexa-ai deploy`. Applies only if onboarded.
- C4. The add-on manifest (`addon.json`) has fixed limits: name 30 chars, short description 123, full description 4000, 3 to 4 example phrases of 200 chars, six light icon sizes, one 600x900 carousel image, HTTPS privacy and terms URLs. Applies only if onboarded.
- C5. The MCP Toolkit is "available to select partners only" and only in the United States. The plan does not depend on it. Its tooling runs on macOS and Ubuntu only.
- C6. Amazon.com has no public order API; the product is a merchant integration.
- C7. 12 calendar days from 11 Oct, one or two developers.
- C8. Hackathon rules: the repository must use the required technology at runtime in code (imported and called), not just name it in the README; video under 3 minutes, public on YouTube or Vimeo, in English, with no third-party trademarks or copyrighted music; repository public with an open-source licence that GitHub shows in the About section, or private and shared with the listed reviewers; product feedback on every tool used.
- C9. The project must be available to judges, free of charge, until the judging period ends on 20 Nov 2026.
- C10. AWS App Runner is closed to new customers since 30 Apr 2026. AWS promotional credits for the hackathon ran out on 7 Oct 2026, so AWS spend is our own.
- C11. Shopify custom apps can no longer be created in the store admin (since 1 Jan 2026); apps are created in the Dev Dashboard and client credentials tokens expire after 24 hours.
- C12. MCP TypeScript SDK v2 is a beta; breaking changes are possible, so versions are pinned exactly.

### 2.5 Assumptions
- A1. MCP Toolkit access is not granted. Every requirement is verifiable without it, through the simulator and MCP Inspector. If access does arrive, onboarding is a bonus (FR-3).
- A2. The three demo products are invented, with text-based manuals we wrote ourselves, unless redistributable manufacturer manuals are available (gate G1 in the plan). Real brands cannot appear in the video, and manufacturer PDFs cannot be committed to a public repo.
- A3. A single demo customer is acceptable to judges when the account-linking path is documented.
- A4. S3 Vectors is available as the KB vector store in us-west-2; otherwise OpenSearch Serverless is used.
- A5. A simulated Alexa+ surface in front of a real MCP server satisfies the track. Basis: the rules ask for "a working Agent Skill or a self-hosted MCP server" and say "developers can simulate the Alexa+ experience in a web app using their own agentic tools".
- A6. The Shopify client credentials grant works for an app installed on our own development store; otherwise a one-time authorization code grant provides an offline token.

## 3. Functional requirements

Priority: M = must (demo breaks without it), S = should (judges will notice), C = could (cut list).

### 3.1 MCP server and add-on
| ID | Requirement | Priority |
|---|---|---|
| FR-1 | The server SHALL expose an MCP endpoint at `POST /mcp` using Streamable HTTP, protocol 2025-11-25 or later, in stateless mode. | M |
| FR-2 | The server SHALL be reachable at a public HTTPS URL and SHALL answer `GET /healthz` with 200 and the running git SHA. | M |
| FR-3 | If MCP Toolkit access is granted, the server SHALL be registered as an Alexa+ MCP add-on via the Alexa AI CLI, with a complete `addon-package/addon.json` meeting C4. | C |
| FR-4 | The server SHALL list all tools in section 3.2 via `tools/list` with descriptions that state when to use and when not to use each tool. | M |
| FR-5 | The server SHALL serve `/privacy` and `/terms` pages over HTTPS. | S |

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
| FR-13 | The full flow (FR-6 to FR-11) SHALL be completable by voice in the deployed simulator, with every tool call travelling through the public `POST /mcp` endpoint. | M |
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
| FR-26 | Views SHALL render correctly on Small (10" and below) and Large (11" and above) Alexa device frames, verified in the simulator's two frames (and by the Local Inspector if Toolkit access is granted). | M |

### 3.5 Data and merchant integration
| ID | Requirement | Priority |
|---|---|---|
| FR-27 | The Shopify development store SHALL contain 3 products, 1 customer and 3 fulfilled orders dated so that one is inside the return window, one is outside the window but under warranty, and one has a configured part for a known symptom. The seed script SHALL date orders relative to the day it runs and SHALL be re-runnable, so the three branches still hold during the judging period. | M |
| FR-28 | The KB SHALL index the three manuals and warranty terms from S3 with a `productId` metadata attribute per document, and `troubleshoot` SHALL filter retrieval by product. | M |
| FR-29 | A `precompute` script SHALL generate structured steps for every (product, known symptom) pair using the KB and store them in DynamoDB, and SHALL be re-runnable. | M |
| FR-30 | State (session, claims, returns, parts, steps cache) SHALL be stored in one DynamoDB table as specified in `ARCHITECTURE.md` section 6.4, with session items expiring after 24 hours. | M |

### 3.6 Submission artefacts
| ID | Requirement | Priority |
|---|---|---|
| FR-31 | The repository SHALL contain the MCP server entry point and Streamable HTTP transport, the simulator's source code, and the Bedrock and DynamoDB SDK calls as code that runs (not only README mentions); an MIT licence in a standard `LICENSE` file that GitHub detects and shows in the About section; and run instructions a stranger can follow in 15 minutes. | M |
| FR-32 | A `FRICTION_LOG.md` SHALL record every tooling problem (MCP SDKs, Alexa+ Toolkit access and docs, AWS services, Shopify) with task, steps, expected, actual, severity, workaround and actionable suggestion. | S |
| FR-33 | A demo video under 3 minutes, in English, public on YouTube or Vimeo, with no third-party trademarks or copyrighted music, SHALL show the real flow running in the deployed simulator against the MCP server, state that the Alexa+ surface is simulated, show the architecture with every AWS service named, and show the confirmation and privacy controls. | M |
| FR-38 | The submission SHALL include product feedback for each tool, API or SDK used, answering: what it was used for, what worked well, what needs work, how onboarding felt, and whether we would build with it again and why. For the AWS Builder mini challenge, this answer SHALL describe which AWS services were used and how. | M |
| FR-39 | The submission SHALL include testing instructions for judges: the simulator URL, its access code, example utterances, and how to call the public `/mcp` endpoint with MCP Inspector. | M |

### 3.7 Alexa+ simulator
| ID | Requirement | Priority |
|---|---|---|
| FR-34 | The simulator SHALL reach the tools only as an MCP client of the server's public `/mcp` endpoint over Streamable HTTP, discovering them with `tools/list`. It SHALL NOT import tool code directly. | M |
| FR-35 | The simulator's agent SHALL choose tools from their descriptions alone, using a Bedrock model with tool use. Its system prompt SHALL NOT name our tools or script the flow. | M |
| FR-36 | The simulator SHALL accept typed and spoken utterances, speak replies, and render a tool's `ui://` view in a sandboxed frame as an MCP Apps host, in Small and Large sizes, with a voice-only mode that hides the screen. Buttons in a view SHALL be able to call server tools. | M |
| FR-37 | The simulator SHALL show each tool call with its name and round-trip time, SHALL require an access code, and SHALL cap the turns per session. | S |

## 4. Non-functional requirements

| ID | Requirement | Measure |
|---|---|---|
| NFR-1 Latency | Server-side time per tool under the budget in `ARCHITECTURE.md` section 10; `troubleshoot` from cache under 100 ms; all read tools under 400 ms end to end. The simulator's own model call is outside this budget | Logged `ms` per call; simulator tool-call panel |
| NFR-2 Availability | Server and simulator warm and reachable from 19 Oct to 20 Nov 2026 (end of the judging period), with demo orders still in their intended windows | ECS service at a minimum of 1 task; weekly manual check of `/healthz` and one full flow; seed re-run on 8 and 14 Nov |
| NFR-3 Reliability | 20-case voice test set passes twice consecutively on the deployed server | `test/cases.json` run log |
| NFR-4 Safety | No purchase, return, claim or deletion without `confirmed: true`; no duplicates | FR-15, FR-16 tests |
| NFR-5 Privacy | No names, emails, addresses or order contents in logs; customer key is a hash; retention stated on `/privacy` (sessions 24 h, records 30 days) | Log review of one full demo run |
| NFR-6 Security | HTTPS only; Host header validation; secrets in the ECS task environment from Secrets Manager, none in the repo; CORS limited to our own origin and localhost; simulator behind an access code | Repo scan, curl checks |
| NFR-7 Accessibility | 48 px minimum touch targets, 4.5:1 text contrast, no horizontal scrolling, readable at 2 m | Manual check in both simulator frames; Local Inspector visual rules if available |
| NFR-8 Maintainability | Policy is pure and unit tested; one file per tool; dependencies limited to those listed in `CLAUDE.md` | `npm test` green; dependency count |
| NFR-9 Portability | The MCP server works with any MCP client (Inspector, Claude Desktop) independent of Alexa+ | `tools/list` and `tools/call` via MCP Inspector |
| NFR-10 Cost | AWS spend at most about USD 60 from 11 Oct to 20 Nov 2026, paid by us (no hackathon credits). This is an estimate for one Fargate task, one load balancer and light Bedrock use | Billing alarm at USD 40; billing console checked weekly; all resources deleted after 20 Nov |

## 5. External interfaces

| Interface | Direction | Protocol | Notes |
|---|---|---|---|
| MCP client -> server | inbound | MCP over Streamable HTTP, JSON-RPC, HTTPS | `POST /mcp`; stateless; `Mcp-Session-Id` not used. The client is the simulator, MCP Inspector, or Alexa+ |
| MCP client -> server | inbound | `resources/read` of `ui://` URIs | Host reads the view before the first `tools/call` |
| Browser -> simulator | inbound | HTTPS, `GET /sim`, `POST /sim/chat` | Access code required |
| Simulator -> Bedrock | outbound | `bedrock-runtime` Converse with tool use | IAM task role; model set by `SIM_MODEL_ID` |
| Server -> Shopify | outbound | Admin GraphQL API, bearer token from the client credentials grant, refreshed before expiry | Runtime scopes: read_orders, read_customers, read_products, write_returns, write_draft_orders. The seed script also needs write_orders, write_customers, write_products |
| Server -> Bedrock | outbound | `bedrock-agent-runtime` Retrieve / RetrieveAndGenerate | IAM task role |
| Server -> DynamoDB | outbound | AWS SDK v3 | Single table `concierge` |
| Developer -> AWS | tooling | `docker build`, push to ECR, ECS Express Mode service update | One deploy command |
| Developer -> Alexa+ (optional) | tooling | `alexa-ai new mcp`, `alexa-ai deploy`, `addon-local-inspector <url>/mcp` | Only with Toolkit access; macOS or Ubuntu (WSL on Windows) |

## 6. Acceptance tests (judge's view)

All scenarios run in the deployed simulator. "Alexa" in the pass conditions means the simulated assistant.

| ID | Scenario | Pass when |
|---|---|---|
| AT-1 | "Alexa, my blender stopped working." | Alexa names the correct order and asks what is wrong, or goes straight to steps |
| AT-2 | "It won't turn on." | Steps card appears with the manual's reset procedure and a source page; Alexa speaks step 1 |
| AT-3 | Tap "Still broken" | Options card appears; Alexa says the customer is past the return window but under warranty and offers to file the claim |
| AT-4 | "Yes." | Confirmation card with a claim reference; a CLAIM item exists in DynamoDB |
| AT-5 | "Yes." again | Same reference returned; no second CLAIM item |
| AT-6 | "Alexa, return my headphones." (inside window) | Return eligibility confirmed, confirmation requested, then QR code card; a return exists in Shopify admin |
| AT-7 | "Return my blender." (outside window) | Refused with the reason and the warranty option offered |
| AT-8 | Same flow with the simulator in voice-only mode | Flow completes with speech alone |
| AT-9 | Every card viewed in the Small and Large frames | No horizontal scroll, no blank card, buttons work, NFR-7 holds. (With Toolkit access: `addon-local-inspector` verdict CERTIFIED or CONDITIONAL) |
| AT-10 | "Alexa, delete my concierge data." | Confirmation requested, then count of deleted items; DynamoDB shows none for the customer |
| AT-11 | MCP Inspector pointed at the public `/mcp` URL | `tools/list` returns all eight tools; `identify_product` returns the same result the simulator showed |
| AT-12 | A stranger follows the README on a clean machine | `tools/list` answers locally within 15 minutes |
| AT-13 | Any day from 9 to 20 Nov 2026 | The simulator loads with the access code and AT-1 to AT-6 still pass |

## 7. Traceability to judging criteria

The four criteria are equally weighted. Stage one is pass or fail on fitting the theme and reasonably applying the required technology. The friction log bonus is up to 10%.

| Criterion | Requirements that earn it |
|---|---|
| Stage one (pass or fail) | FR-1, FR-4, FR-13, FR-31 (a working Streamable HTTP MCP server, called at runtime, shown working) |
| Tech Implementation | FR-1, FR-2, FR-4, FR-13, FR-28 to FR-30, FR-34, FR-35, NFR-1, NFR-9 (real Streamable HTTP MCP, MCP Apps, Bedrock KB, DynamoDB, real Shopify data) |
| Design | FR-22 to FR-26, FR-36, NFR-7 (cards on both device sizes, voice parity) |
| Potential Impact | FR-9, FR-17 to FR-20 (avoidable returns prevented, cheapest resolution, any merchant can adopt) |
| Quality of the Idea | FR-7 to FR-9, FR-19, FR-20, FR-22 to FR-24, FR-30 (the rules list as creative: orchestration across services, state across sessions, purchasing, cards, MCP Apps; and as obvious: a basic MCP wrapper around an existing API) |
| AWS Builder mini challenge | FR-28, FR-29, FR-30, FR-35, ECS Express Mode hosting, FR-33 architecture segment, FR-38 (services described in the product feedback) |
| Friction log bonus | FR-32 |

## 8. Open questions

| # | Question | Owner | Decide by |
|---|---|---|---|
| Q1 | Can hackathon participants get MCP Toolkit access at all? Not blocking; asked once on Discord and logged in the friction log. | team via Discord/office hours | 18 Oct 2026 (after that, stop asking) |
| Q2 | Closed 11 Oct: device testing from an Indian account is not needed; the simulator is the surface. | | |
| Q3 | Is S3 Vectors available for KB quick create in us-west-2 today? | team | 13 Oct 2026 |
| Q4 | Does the Alexa+ host honour `readOnlyHint`/`destructiveHint` annotations for confirmation prompts? Cannot be tested without Toolkit access; confirmation stays entirely in our tool contract (FR-15). | | closed unless access arrives |
| Q5 | Answered 11 Oct from Shopify's docs: the client credentials grant works for a dev store only when the app and the store are in the same Shopify organization. The store must be created from the Dev stores page of the Dev Dashboard; otherwise the token call fails with `shop_not_permitted`. Still to confirm with a real call. | team | 11 Oct 2026 |
| Q6 | Partly answered 11 Oct from the AWS docs: Express Mode gives each service a unique URL behind a load balancer with SSL/TLS, so no certificate work. The cost per day is still unmeasured; read it from the billing console after the first two days. | team | 13 Oct 2026 |
| Q7 | Which Bedrock model gives the simulator's agent reliable tool choice at an acceptable reply time? | team | 16 Oct 2026 |
