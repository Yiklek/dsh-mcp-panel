/**
 * Build dsh-mcp-panel.
 *
 *   node scripts/build.mjs
 *
 * Produces `lib/`:
 *   - lib/client.js — the browser half, bundled by esbuild and wrapped in the
 *     DSH module format (`window.__ModuleLoader__.load`). `react` stays an
 *     external require (a shell seed).
 *   - lib/host.mjs  — the host half (ESM, node). Official @deepseek-ai packages
 *     are resolved at runtime from the DSH installation, not bundled.
 */
import { build } from 'esbuild'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url)) + '/..'
const lib = join(root, 'lib')
mkdirSync(lib, { recursive: true })

const esbuildOptions = { bundle: true, target: 'es2020', logLevel: 'info' }

// 1) Client bundle (CJS, wrapped in the DSH __ModuleLoader__.load format).
const client = await build({
  ...esbuildOptions,
  entryPoints: [join(root, 'src/client.ts')],
  format: 'cjs',
  platform: 'browser',
  external: ['react'],
  write: false,
})

const wrapped = `window.__ModuleLoader__.load({
  id: 'dsh-mcp-panel',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports
${client.outputFiles[0].text}
    return module.exports
  },
});
`
writeFileSync(join(lib, 'client.js'), wrapped)

// 2) Host bundle (ESM, node).
await build({
  ...esbuildOptions,
  entryPoints: [join(root, 'src/host.ts')],
  format: 'esm',
  platform: 'node',
  // `yaml` is a real runtime dependency (declared in package.json) and is
  // CJS-only, so it must stay external: bundling it produces a `__require` shim
  // that throws "Dynamic require of process is not supported" in ESM output.
  external: ['@deepseek-ai/*', 'yaml'],
  outfile: join(lib, 'host.mjs'),
  write: true,
})
