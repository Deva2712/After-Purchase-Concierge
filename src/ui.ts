// MCP Apps views: three ui:// resources served from the Vite single-file build in dist/ui (docs/ARCHITECTURE.md section 7).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';

export const VIEWS = {
  steps: 'ui://concierge/steps.html',
  options: 'ui://concierge/options.html',
  confirmation: 'ui://concierge/confirmation.html',
} as const;

export const uiMeta = (view: keyof typeof VIEWS) => ({ ui: { resourceUri: VIEWS[view] } });

// ponytail: read once per process from dist/ui relative to the working directory (repo root in dev, /app in the image).
const html = new Map<string, string>();
function load(view: string): string {
  let h = html.get(view);
  if (!h) {
    h = readFileSync(join(process.cwd(), 'dist', 'ui', `${view}.html`), 'utf8');
    html.set(view, h);
  }
  return h;
}

export function registerViews(server: McpServer) {
  for (const [view, uri] of Object.entries(VIEWS)) {
    registerAppResource(server, `${view} card`, uri, { mimeType: RESOURCE_MIME_TYPE, description: `Concierge ${view} card` }, async () => ({
      contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: load(view) }],
    }));
  }
}
