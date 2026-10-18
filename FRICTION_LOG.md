# Friction Log

Submitted with the Devpost entry (optional, up to 10% judging bonus). Write an entry the moment something misbehaves or contradicts its docs. Cover every tool we touch: MCP TypeScript SDK, MCP Apps SDK, Alexa+ MCP Toolkit and docs, Bedrock, DynamoDB, ECS Express Mode, Shopify.

Severity: blocker (could not proceed), major (lost more than an hour or changed the design), minor (annoying, quick workaround).

## Template

```
### <n>. <short title>
- Date:
- Tool:
- Task attempted:
- Steps taken:
- Expected:
- Actual:
- Severity:
- Workaround:
- Suggestion:
```

## Entries

Entries 1 and 2 were found while reading the docs on 11 Oct 2026, before any code. Update them with what actually happens when the steps are tried.

### 1. Alexa+ MCP Toolkit is not available to hackathon participants
- Date: 11 Oct 2026
- Tool: Alexa+ MCP Toolkit (Alexa AI CLI, add-on registration, web simulator, Local Inspector)
- Task attempted: Plan how to onboard a self-hosted MCP server to Alexa+ and test it, from India.
- Steps taken: Read the Alexa+ add-on docs (overview, quickstart, development stages, testing pages) and the hackathon rules and resources pages.
- Expected: A documented way for hackathon participants to register an MCP server with Alexa+ and test it in the web simulator.
- Actual: The docs home says "Category SDK and MCP Toolkit are available to select partners only" and the overview says the Toolkit "is available in the United States". The development stages page says to "request access to the Private Preview" but gives no eligibility, timeline or country rules. The hackathon resources page lists only the open MCP docs for the Alexa+ track.
- Severity: major (changed the demo surface for the whole project)
- Workaround: Built our own simulated Alexa+ web app (MCP client, agent, MCP Apps host in an Echo Show frame), which the rules allow.
- Suggestion: Give registered hackathon participants time-limited access to the web simulator and Local Inspector, or publish the Local Inspector on public npm. State eligibility and country rules on the "request access" page.

### 2. App Runner, the simplest way to host an MCP server on AWS, is closed to new customers
- Date: 11 Oct 2026
- Tool: AWS App Runner, Amazon ECS Express Mode
- Task attempted: Choose AWS hosting for an always-warm HTTPS Node service with no infrastructure code.
- Steps taken: Planned on App Runner from a GitHub source connection, then read the App Runner availability change page.
- Expected: Create an App Runner service from the repo.
- Actual: App Runner stopped accepting new customers on 30 Apr 2026. The recommended replacement, ECS Express Mode, needs a container image in ECR and two IAM roles, so a Dockerfile and a push step are now required.
- Severity: minor (found before any work was done)
- Workaround: ECS Express Mode with a Dockerfile.
- Suggestion: Offer a source-to-service path in ECS Express Mode (connect a repo, no Dockerfile) so the App Runner experience is not lost for small projects.

### 3. npm silently skips devDependencies when the shell has NODE_ENV=production
- Date: 18 Oct 2026
- Tool: npm 11 (Node 24)
- Task attempted: `npm install -D typescript tsx @types/node @types/express` while scaffolding the repo (Phase 0).
- Steps taken: Ran the install, saw the four entries appear in `package.json`, then ran `npx tsc --noEmit`.
- Expected: The dev dependencies install, or npm says why it did not install them.
- Actual: Nothing was installed and nothing was printed. The developer shell exports `NODE_ENV=production`, which npm maps to `omit=dev`, so `npm install -D` wrote `package.json` but skipped the packages. `npx tsc` then downloaded an unrelated registry package named `tsc` that prints "This is not the tsc command you are looking for".
- Severity: minor (about 20 minutes)
- Workaround: `npm install --include=dev`. Setup notes will tell contributors to unset `NODE_ENV` or pass `--include=dev`.
- Suggestion: npm should print a one-line notice when a `--save-dev` install is omitted because of `NODE_ENV` or `omit=dev`. Writing `package.json` without installing anything, silently, is surprising.

### 4. MCP Apps `AppBridge.setHostContext()` throws "Not connected" when called before `connect()`
- Date: 18 Oct 2026
- Tool: `@modelcontextprotocol/ext-apps` 2.0.3 (`AppBridge`, host side)
- Task attempted: Build the simulator's MCP Apps host: create an `AppBridge`, give it the host context (display mode, theme, container size), connect it to the card's iframe over `PostMessageTransport`.
- Steps taken: `new AppBridge(null, hostInfo, caps)`, then `bridge.setHostContext({...})`, then `bridge.connect(transport)`, then set the iframe `srcdoc`.
- Expected: `setHostContext` stores the context so it is included in the `ui/initialize` response.
- Actual: `setHostContext` diffs against the current context and immediately sends a `ui/notifications/host-context-changed` notification, which throws an unhandled `SdkError: Not connected` because the transport is not connected yet. The context is still stored, so the handshake works and the only symptom is an uncaught rejection in the console; found by reading the minified bundle. The supported way is the constructor's fourth argument, `options.hostContext`, which the typed signature exposes but the method docs do not point to.
- Severity: minor (about 20 minutes)
- Workaround: Pass `{ hostContext }` as the `AppBridge` constructor options and call `setHostContext` only after `connect()`.
- Suggestion: Make `setHostContext` a no-op send before connect (store only), or document on the method that it notifies and must be called after `connect()`.
