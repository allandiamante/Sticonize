// The panel-to-engine mapping. vtracer aborts the wasm on a field it cannot parse
// instead of returning an error, so this mapping is a guard, not a rename.
import assert from 'node:assert/strict'
import { traceOptions, PRESETS, MODES, STACKING, MAX_COLOR_PRECISION } from '../../src/vector.js'

const ENGINE_KEYS = [
  'binary', 'mode', 'hierarchical', 'filterSpeckle', 'colorPrecision', 'layerDifference',
  'cornerThreshold', 'lengthThreshold', 'spliceThreshold', 'maxIterations', 'pathPrecision'
]

// every preset maps to a complete config, and to nothing the engine does not read
for(const [name, preset] of Object.entries(PRESETS)){
  const out = traceOptions({...preset, maxSide: 1024, background: '#fff'})
  assert.deepEqual(Object.keys(out).sort(), [...ENGINE_KEYS].sort(), `${name} keys`)
  assert.ok(MODES.includes(out.mode), `${name} mode`)
  assert.ok(STACKING.includes(out.hierarchical), `${name} stacking`)
}

// panel-only fields never reach the engine
const mapped = traceOptions({...PRESETS.auto, maxSide: 1024, background: 'transparent'})
assert.equal(mapped.maxSide, undefined)
assert.equal(mapped.background, undefined)

// out-of-range numbers are pinned rather than passed through
const wild = traceOptions({
  ...PRESETS.auto,
  colorPrecision: 8, filterSpeckle: -5, layerDifference: 999,
  cornerThreshold: 400, lengthThreshold: 0.1, spliceThreshold: -12,
  maxIterations: 0, pathPrecision: 42
})
assert.equal(wild.colorPrecision, MAX_COLOR_PRECISION)
assert.equal(wild.filterSpeckle, 0)
assert.equal(wild.layerDifference, 128)
assert.equal(wild.cornerThreshold, 180)
assert.equal(wild.lengthThreshold, 3.5)
assert.equal(wild.spliceThreshold, 0)
assert.equal(wild.maxIterations, 1)
assert.equal(wild.pathPrecision, 8)

// an unknown enum falls back instead of reaching the engine as garbage
assert.equal(traceOptions({...PRESETS.auto, mode: 'nope'}).mode, 'spline')
assert.equal(traceOptions({...PRESETS.auto, hierarchical: 'nope'}).hierarchical, 'stacked')

// binary is a real boolean, whatever the checkbox hands over
assert.equal(traceOptions({...PRESETS.auto, binary: undefined}).binary, false)
assert.equal(traceOptions({...PRESETS.mono}).binary, true)

// the integer fields are integers: vtracer parses them as such
const rounded = traceOptions({...PRESETS.auto, filterSpeckle: 4.7, colorPrecision: 5.2, pathPrecision: 1.6})
assert.equal(rounded.filterSpeckle, 5)
assert.equal(rounded.colorPrecision, 5)
assert.equal(rounded.pathPrecision, 2)
