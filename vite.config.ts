// Builds one page per invocation into a single self-contained HTML file (no external loads, T3.12).
// VITE_TARGET is steps | options | confirmation (cards from ui/, into dist/ui/) or sim (simulator page, into dist/sim/).
// One input per build: with several inputs Rollup splits shared code into a chunk the single-file plugin cannot inline.
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const target = process.env.VITE_TARGET ?? 'steps';
const dir = target === 'sim' ? 'sim' : 'ui';
const page = target === 'sim' ? 'index' : target;

export default defineConfig({
  root: r(dir),
  plugins: [viteSingleFile()],
  build: {
    outDir: r(`dist/${dir}`),
    emptyOutDir: false,
    target: 'es2022',
    rollupOptions: { input: { [page]: r(`${dir}/${page}.html`) } },
  },
});
