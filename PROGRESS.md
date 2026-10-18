# Progress

One line per working session: `date | phase | state | next`.

2026-10-18 | Phase 0 | Code side done: package.json with MCP v2 pinned exactly (server/client 2.3.1, node 2.1.1, express 2.0.2, ext-apps 2.0.3), tsconfig, LICENSE, .env.example, .npmrc save-exact, three product manuals (own text PDFs, gate G1 default) with KB sidecars. T0.1 partly: Node 24 via nvm (`nvm use 24`), Docker present; AWS CLI not installed. T0.2 to T0.5 blocked on accounts. | next (human): AWS CLI + `concierge` profile + billing alarm, Bedrock model access (note S3 Vectors for G2), Shopify Dev Dashboard store + app + scopes, fill `.env`
2026-10-18 | Phase 1 | Server (`src/main.ts`, stateless Streamable HTTP, `/healthz`), `ping` tool, simulator agent (Bedrock Converse tool loop over an MCP client) and page, Dockerfile, `scripts/deploy.sh`. T1.1 to T1.5 green locally; T1.6 skipped (needs Bedrock credentials); T1.7 to T1.9 need ECR + ECS Express Mode. | next (human): ECR repo, IAM roles, ECS Express Mode service, then `npm run deploy` and T1.7
2026-10-18 | Phase 2 | Step 1 `config/products.json`; step 2 `src/policy.ts` with T2.1 to T2.9 green, mutation-checked (T2.1 went red when `<=` became `<`). | done later the same day: `src/shopify.ts` (T2.10 green), `src/db.ts`, `src/kb.ts`, `src/products.ts`, the three read tools, `scripts/seed-shopify.ts`, `scripts/precompute.ts` (Retrieve + Converse, see ponytail note), `test/tools.e2e.ts` (T2.15 to T2.20 skip until `.env` has SHOPIFY_STORE and TABLE_NAME) | next (human): Shopify store + app, then `npm run seed` (gate G3: watch whether `orderCreate` accepts `processedAt` + `fulfillment`); S3 bucket + Knowledge Base + `KB_ID`; DynamoDB table; then `npm run precompute` and `npm run test:e2e`

Environment notes
- The dev shell exports `NODE_ENV=production`; use `npm install --include=dev` (friction log 3).
- Gate G1: default taken on 18 Oct (own manuals for invented products). G2 to G7: open.
