/**
 * Test runner.
 *
 * Node 22 in this environment is built WITHOUT TypeScript support
 * (process.config.variables.node_use_amaro === false), so
 * `node --experimental-strip-types --test` fails with ERR_NO_TYPESCRIPT. That
 * is a property of this Node build, not of the flag.
 *
 * Rather than add ts-node/tsx as a dependency, this transpiles the TS sources
 * with the esbuild that Vite already brings in, writes plain ESM to
 * .test-build/, and runs the built-in test runner over that. Type annotations
 * are erased, not checked — `nuxt typecheck` is the place for checking.
 */
import { build } from 'esbuild'
import { rm, mkdir, readdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const OUT = '.test-build'

const collect = async (dir, exts = ['.ts', '.mjs']) => {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await collect(path, exts)))
    else if (exts.some((e) => entry.name.endsWith(e))) found.push(path)
  }
  return found
}

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })

const entries = [...(await collect('tests')), ...(await collect('lib')), ...(await collect('server/utils'))]

await build({
  entryPoints: entries,
  outdir: OUT,
  outbase: '.',
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Bundling would inline node:sqlite oddly and hide import errors; keep the
  // module graph intact and just strip types.
  bundle: false,
  sourcemap: 'inline',
  logLevel: 'warning',
})

// esbuild leaves import specifiers untouched, so '../lib/jalali.ts' still
// points at a .ts path that no longer exists in the output. Rewrite the
// extension in the emitted files.
const built = await collect(OUT, ['.js'])
const { readFile, writeFile } = await import('node:fs/promises')
for (const file of built) {
  const src = await readFile(file, 'utf8')
  const fixed = src.replace(/from\s+(['"])([^'"]+)\.ts\1/g, 'from $1$2.js$1')
  if (fixed !== src) await writeFile(file, fixed)
}

const testFiles = built.filter((f) => f.includes(`${OUT}/tests/`))
if (!testFiles.length) {
  console.error('no test files found')
  process.exit(1)
}

const child = spawn(process.execPath, ['--test', ...testFiles], { stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 1))
