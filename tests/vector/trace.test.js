// Detail retention: the settings that decide what survives a trace.
import assert from 'node:assert/strict'
import { layeredSvg } from '../../src/trace-core.js'
import { traceOptions, countPaths, PRESETS } from '../../src/vector.js'

/* Builds a white field carrying a black square plus a row of small specks.
   Takes the canvas side, the square's side and the speck side in pixels;
   returns an ImageData-shaped object the tracer accepts. */
function specks(side, inner, speck){
  const data = new Uint8ClampedArray(side * side * 4).fill(255)
  const dark = (x, y) => {
    const i = (y * side + x) * 4
    data[i] = data[i + 1] = data[i + 2] = 0
  }
  const lo = (side - inner) / 2
  for(let y = lo; y < lo + inner; y++) for(let x = lo; x < lo + inner; x++) dark(x, y)
  for(let n = 0; n < 6; n++)
    for(let y = 4; y < 4 + speck; y++) for(let x = 4 + n * 10; x < 4 + n * 10 + speck; x++) dark(x, y)
  return {width: side, height: side, data}
}

const image = () => specks(128, 48, 3)
const mono = {...PRESETS.mono}

const detailed = layeredSvg(image(), traceOptions(mono))

// the square keeps its exact corners: 40..88 on a 128 px field
assert.match(detailed.svg, /d="M 40 40 [^"]*L 88 40 [^"]*L 88 88 [^"]*L 40 88 /)

// with the shipped defaults all six 3 px specks survive, alongside the square
// and the single background path
assert.equal(countPaths(detailed.svg), 8)

// despeckling is what throws them away, and only when asked for
const coarse = layeredSvg(image(), traceOptions({...mono, despeckle: 32}))
assert.equal(countPaths(coarse.svg), 2)

// the old default of 1.0 on both thresholds measurably flattens the geometry
const flattened = layeredSvg(image(), traceOptions({...mono, lineThreshold: 10, curveThreshold: 10}))
assert.ok(flattened.svg.length < detailed.svg.length,
  'high thresholds should collapse segments')

// discarding 1-2 segment paths throws detail away, which is why it ships off
assert.equal(PRESETS.auto.dropTinyPaths, false)
const filtered = layeredSvg(image(), traceOptions({...mono, dropTinyPaths: true}))
assert.ok(countPaths(filtered.svg) <= countPaths(detailed.svg))

// every preset asks for a fidelity-first trace, not the library's coarse defaults
for(const [name, p] of Object.entries(PRESETS)){
  assert.ok(p.lineThreshold <= 0.1, `${name} line threshold is too coarse`)
  assert.ok(p.curveThreshold <= 0.1, `${name} curve threshold is too coarse`)
  assert.ok(p.despeckle <= 3, `${name} despeckles too aggressively`)
  assert.equal(p.dropTinyPaths, false, `${name} discards tiny paths`)
}
