// Daily start: T0.2 to T0.5 in one command. Reads .env, then checks AWS identity, Bedrock Converse,
// the Shopify client-credentials token and a GraphQL call. Prints one line per check; exits 1 if any fails.
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { shopify } from '../src/shopify.ts';

try { process.loadEnvFile(); } catch { /* use the environment */ }
const region = process.env.AWS_REGION ?? 'us-west-2';

type Check = [name: string, run: () => Promise<string>];
const checks: Check[] = [
  ['T0.2 AWS identity', async () => {
    const r = await new STSClient({ region }).send(new GetCallerIdentityCommand({}));
    return `account ${r.Account}`;
  }],
  ['T0.3 Bedrock Converse', async () => {
    const r = await new BedrockRuntimeClient({ region }).send(new ConverseCommand({
      modelId: process.env.SIM_MODEL_ID, messages: [{ role: 'user', content: [{ text: 'Say ok' }] }], inferenceConfig: { maxTokens: 5 },
    }));
    return `"${r.output?.message?.content?.[0]?.text?.trim()}" from ${process.env.SIM_MODEL_ID}`;
  }],
  ['T0.4/T0.5 Shopify token + shop', async () => {
    const d = await shopify.gql<{ shop: { name: string; currencyCode: string } }>('{ shop { name currencyCode } }');
    return `${d.shop.name} (${d.shop.currencyCode})`;
  }],
];
for (const name of ['KB_ID', 'TABLE_NAME', 'DEMO_CUSTOMER_EMAIL', 'SIM_ACCESS_CODE', 'MCP_URL']) {
  checks.push([`env ${name}`, async () => (process.env[name] ? 'set' : Promise.reject(new Error('missing')))]);
}

let failed = 0;
for (const [name, run] of checks) {
  const t0 = Date.now();
  try {
    console.log(`ok    ${name}: ${await run()} (${Date.now() - t0} ms)`);
  } catch (e) {
    failed += 1;
    console.log(`FAIL  ${name}: ${(e as Error).name}: ${(e as Error).message}`);
  }
}
process.exit(failed ? 1 : 0);
