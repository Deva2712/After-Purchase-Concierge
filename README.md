# After-Purchase Concierge

A self-hosted **MCP server** that handles everything after a purchase, built to be an Alexa+ MCP add-on. The customer says *"my blender stopped working"*; the concierge walks them through the fix from the product manual, and if that fails it picks and files the cheapest resolution that solves the problem: a return if the window is open, otherwise a warranty claim, otherwise a replacement part. Interactive cards (MCP Apps) appear on screen devices; the same flow works by voice alone.

Built for the Amazon Developer Hackathon, Alexa+ track, with the AWS Builder mini challenge.

**The Alexa+ surface is simulated.** Amazon's MCP Toolkit is available to select partners only, so the demo runs in our own web page at `/sim`: an ordinary MCP client (Streamable HTTP) with a Bedrock Converse agent that chooses tools from their descriptions, speaks the result, and renders the cards as an MCP Apps host. The MCP server is the product; MCP Inspector or any other client sees exactly what the simulator sees.

## What it does in one flow

```
"My blender stopped working."   -> identify_product       (Shopify order for the demo customer)
"It won't turn on."              -> troubleshoot           (steps from the manual: Bedrock Knowledge Base, cached in DynamoDB)
[Still broken]                   -> report_outcome         (policy ranks: return, warranty claim, part, contact merchant)
"Yes."                           -> file_warranty_claim    (confirmed: true, idempotent; confirmation card)
```

Four tool calls, three cards, no app opened. A repeated "yes" returns the same claim reference instead of filing twice. Nothing is filed, returned or ordered without `confirmed: true`.

## Architecture

```
 Customer (voice/touch, browser)
        |
        v
 +--------------------+   MCP over Streamable HTTP (2025-11-25)   +----------------------------+
 | Simulated Alexa+   | ---------------------------------------> |  Concierge MCP server      |
 | /sim: MCP client,  |   POST /mcp, tools/call, resources/read  |  Node 24, TypeScript       |
 | Bedrock Converse   | <--------------------------------------- |  Amazon ECS Express Mode   |
 | agent, speech,     |   tool results + ui:// resources         |  (Fargate), us-west-2      |
 | MCP Apps host      |                                          +----------------------------+
 +--------------------+                                             |          |          |
                                                             Shopify Admin  Bedrock KB   DynamoDB
                                                             GraphQL API    (manuals     (steps cache,
                                                             (orders,        in S3,       claims, returns,
                                                             returns,        S3 Vectors)  parts, session)
                                                             draft orders)
```

AWS services and how they are used: **Amazon Bedrock Knowledge Bases** index the product manuals (S3 + S3 Vectors) and answer `Retrieve` queries filtered by product; **Amazon Bedrock Converse** powers the simulator's tool-choosing agent and the precompute step that turns manual passages into spoken steps; **Amazon DynamoDB** holds the steps cache, the customer session and every claim, return and part record with idempotency keys; **Amazon S3** stores the PDFs; **Amazon ECS Express Mode** on Fargate hosts the container behind an HTTPS load balancer; **Amazon ECR** stores the image.

Full design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Requirements: [docs/SRS.md](docs/SRS.md). Build plan and tests: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md). What went wrong with the tooling: [FRICTION_LOG.md](FRICTION_LOG.md). Session log: [PROGRESS.md](PROGRESS.md).

## Where the required technology is called

| What | File |
|---|---|
| MCP server entry point and Streamable HTTP transport (stateless, new server per request) | [src/main.ts](src/main.ts) |
| Tool and `ui://` resource registration | [src/server.ts](src/server.ts), [src/ui.ts](src/ui.ts) |
| One file per tool; confirmation gate and idempotency in the write tools | [src/tools/](src/tools/) |
| Decision engine (pure, fully unit tested) | [src/policy.ts](src/policy.ts) |
| MCP client used by the simulated Alexa+ (Bedrock Converse tool loop) | [sim/agent.ts](sim/agent.ts) |
| MCP Apps host in the device frame (AppBridge over postMessage) | [sim/host.ts](sim/host.ts) |
| MCP Apps cards (vanilla JS, built to single HTML files) | [ui/](ui/) |
| Bedrock Knowledge Base retrieval | [src/kb.ts](src/kb.ts) |
| DynamoDB access | [src/db.ts](src/db.ts) |
| Shopify Admin GraphQL client (client credentials token, refreshed) | [src/shopify.ts](src/shopify.ts) |

## Tools

| Tool | Does | Writes? |
|---|---|---|
| `identify_product` | Finds the customer's order line from product words or an order number | no |
| `troubleshoot` | Numbered steps from the manual for a symptom, with the source page | no |
| `report_outcome` | Records whether the fix worked; if not, returns the ranked options | no |
| `get_resolution_options` | Ranks return, warranty claim, part and contact merchant with a reason each | no |
| `create_return` | Shopify `returnCreate`, QR code, pickup date | yes, `confirmed: true` |
| `file_warranty_claim` | Claim record with a reference and next step | yes, `confirmed: true` |
| `order_part` | Shopify draft order for the replacement part | yes, `confirmed: true` |
| `delete_my_data` | Deletes everything stored about the customer | yes, `confirmed: true` |

Write tools called without `confirmed: true` answer "Please confirm with the customer before I do this" (not an error). Every write is keyed by `sha256(orderId + lineItemId + action)` with a conditional put. Ineligible actions are refused with the reason and the next best option.

## Run it locally

Prerequisites: Node 24+, an AWS account with Bedrock model access in `us-west-2`, a Shopify development store with a Dev Dashboard app. See [Setup](#setup-accounts-and-cloud-resources) below.

```bash
git clone https://github.com/Deva2712/After-Purchase-Concierge.git
cd After-Purchase-Concierge
npm install --include=dev        # --include=dev matters if your shell exports NODE_ENV=production
cp .env.example .env             # fill in the values (see Setup)
npm run check:env                # AWS identity, Bedrock, Shopify token: all must print ok
npm run seed                     # 3 products, 1 customer, 3 fulfilled orders dated relative to today
npm run precompute               # troubleshooting steps from the Knowledge Base into DynamoDB
npm run build                    # tsc + the cards and the simulator page
npm run dev                      # http://localhost:3001/sim (access code from .env)
```

Without `.env`, `npm run dev` still serves `/mcp` with all tools listed; tools that need the store or the table answer with one speakable error sentence.

Tests:

```bash
npm test               # unit tests, no network: policy, matching, Shopify client, errors and logs
npm run test:e2e       # against BASE_URL (default localhost:3001); tool tests skip until .env is filled
npm run test:cases     # the 20 utterances in test/cases.json through the simulator (spends Bedrock tokens)
npx @modelcontextprotocol/inspector http://localhost:3001/mcp
```

## Try it (judges)

- Simulator: `https://<service-url>/sim` with the access code from the submission. Say or type:
  - *"My blender stopped working"* then *"it won't turn on"*, tap **Still broken**, say *"yes"*: a warranty claim, because the order is 4 days past the 30-day return window.
  - *"There's no sound on one side of my headphones"*, then *"still broken"*, then *"yes"*: a return with a QR code, because that order is inside the window.
  - *"The lid on my kettle won't close"*: a $6 lid seal ranks first, because it is under 20% of the kettle's price.
  - *"Delete my concierge data"*: asks for confirmation, then deletes.
- Switch the device between Small, Large and Voice only; the panel on the right lists every MCP tool call with its round trip.
- Any MCP client works too: `npx @modelcontextprotocol/inspector https://<service-url>/mcp` lists the same eight tools and three `ui://` resources.

Demo data is invented (ProBlend 900 Blender, QuietWave H2 Headphones, SwiftBoil K1 Kettle). The manuals in [manuals/](manuals/) are ours.

## Setup: accounts and cloud resources

These are the steps a person does once; everything else is scripted. Variable names are in [.env.example](.env.example).

1. **AWS** (us-west-2): an IAM user with a CLI profile (`AWS_PROFILE`), a billing alarm. In the Bedrock console enable one Claude model (its ID becomes `SIM_MODEL_ID`) and Titan Text Embeddings.
2. **Shopify**: in the Dev Dashboard create a development store from the *Dev stores* page, create an app in the same organisation with scopes `read_orders write_orders read_customers write_customers read_products write_products write_returns write_draft_orders`, release and install it on the store. Copy `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET`; `SHOPIFY_STORE` is the subdomain.
3. **Knowledge Base**: upload `manuals/*.pdf` and the `*.pdf.metadata.json` sidecars to an S3 bucket; Bedrock Knowledge Base quick create with that bucket and S3 Vectors; sync. Its ID is `KB_ID`.
4. **DynamoDB**: table `concierge`, on-demand, partition key `pk` (string), sort key `sk` (string), TTL attribute `ttl`. `TABLE_NAME=concierge`.
5. **Hosting**: an ECR repository, the ECS Express Mode service (port 3001, health check `/healthz`, min and max 1 task) with the `.env` values as environment variables and a task role allowed `bedrock:InvokeModel`, `bedrock:Retrieve` and DynamoDB access to the table. `MCP_URL` on the service is its own public `/mcp` URL. Then `npm run deploy` (needs `ECR_REPO`, `ECS_CLUSTER`, `ECS_SERVICE`, `BASE_URL` in `.env`, Docker running).

`npm run seed` must be re-run before and during judging: the demo orders drift out of their windows as days pass.

## Limits of this build

- One demo customer (`DEMO_CUSTOMER_EMAIL`), no account linking. The production step is OAuth 2.1 with PKCE (Cognito satisfies Alexa's requirements); see docs/ARCHITECTURE.md section 9.
- The return pickup and QR label are simulated; carriers are out of scope.
- The simulated Alexa+ is not Alexa's webview and its routing model is not Alexa's. Passing here is not certification. The server keeps Alexa+'s constraints (sub-500 ms tool responses from the cache, standalone spoken text on every result, cards for Small and Large frames) so it is ready to onboard when the Toolkit opens up.

MIT licence, see [LICENSE](LICENSE).
