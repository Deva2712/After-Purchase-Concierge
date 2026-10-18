import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { products, matchSymptom } from '../products.ts';
import { demoCustomer } from '../identity.ts';
import { getSteps, putSession } from '../db.ts';
import { retrieveSteps } from '../kb.ts';
import { runTool } from '../log.ts';
import { uiMeta } from '../ui.ts';

export function registerTroubleshoot(server: McpServer) {
  server.registerTool(
    'troubleshoot',
    {
      title: 'Troubleshoot from the manual',
      description: 'Get numbered fix steps from the product manual for the problem the customer describes. Use after identify_product and before offering any return, claim or part; do not use when the customer has already tried the steps.',
      inputSchema: z.object({
        productId: z.string().describe('productId from identify_product'),
        symptom: z.string().min(1).describe("The problem in the customer's words, e.g. \"won't turn on\""),
      }),
      annotations: { readOnlyHint: true },
      _meta: uiMeta('steps'),
    },
    async ({ productId, symptom }) => runTool('troubleshoot', { productId }, async () => {
      const p = products[productId];
      if (!p) return { text: "I don't recognise that product. Let's find it in your orders first.", isError: true };
      const { hash } = demoCustomer();
      const symptomKey = matchSymptom(productId, symptom);

      // Precomputed steps first (DynamoDB, fast); the live Knowledge Base retrieval is the fallback only.
      const cached = symptomKey ? await getSteps(productId, symptomKey) : undefined;
      const { steps, source } = cached ?? await retrieveSteps(productId, `${p.title}: ${symptom}`);
      await putSession(hash, { lastProductId: productId, lastSymptomKey: symptomKey, lastSymptomText: symptom });

      const structuredContent = { productId, productTitle: p.title, symptomKey, steps, source, cached: !!cached };
      if (steps.length === 0) {
        return { text: `I couldn't find steps for that in the ${p.title} manual, so let's look at your options instead.`, structuredContent };
      }
      const first = steps[0];
      const text = `The ${p.title} manual, page ${source.page}, has ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}. Step 1: ${first.detail} Tell me if it worked or if it's still broken.`;
      return { text, structuredContent };
    }),
  );
}
