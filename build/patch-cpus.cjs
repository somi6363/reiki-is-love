/**
 * Preload shim: repair os.cpus() under PRoot.
 *
 * In this Android/PRoot sandbox os.cpus() returns [] even though /proc/cpuinfo
 * lists 10 processors and os.availableParallelism() reports 4. Anything that
 * sizes a worker pool with `os.cpus().length` therefore gets 0 workers, queues
 * work, and never resolves.
 *
 * That is exactly how the Nuxt build died: @rollup/plugin-terser (pulled in by
 * workbox-build when mode === 'production') builds a WorkerPool with
 * `maxInstances = options.maxWorkers || os.cpus().length` -> 0, so its
 * renderChunk hook hung and rollup aborted with
 *   "Unexpected early exit ... Unfinished hook action(s): (terser) renderChunk"
 *
 * Verified in isolation: same rollup+terser input fails with the default worker
 * count and succeeds with maxWorkers=1.
 *
 * Load with: NODE_OPTIONS="--require ./build/patch-cpus.cjs"
 *
 * This is a no-op on any host where os.cpus() already works, so it is safe to
 * leave enabled in CI. Minification is preserved -- unlike the alternative of
 * switching workbox to mode:'development', which just skips terser.
 */
const os = require('node:os')

const real = os.cpus.bind(os)

if (real().length === 0) {
  const n = Math.max(1, os.availableParallelism?.() ?? 1)
  const fake = Object.freeze({
    model: 'unknown',
    speed: 0,
    times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
  })
  const shimmed = Object.freeze(Array.from({ length: n }, () => fake))

  os.cpus = () => shimmed

  if (!process.env.PATCH_CPUS_QUIET) {
    console.error(`[patch-cpus] os.cpus() was empty; reporting ${n} cpu(s)`)
  }
}
