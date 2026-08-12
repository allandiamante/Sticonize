// The opening pass: measure the image, then propose settings from the measurements.
import assert from 'node:assert/strict'
import { analyzeImage } from '../../src/trace-core.js'
import { recommend, PRESETS, WORK_SIZES, MAX_COLOR_PRECISION } from '../../src/vector.js'

/* Paints an image from a per-pixel function.
   Takes the canvas side and a callback returning [r, g, b, a] for an (x, y);
   returns an ImageData-shaped object. */
function paint(side, at){
  const data = new Uint8ClampedArray(side * side * 4)
  for(let y = 0; y < side; y++) for(let x = 0; x < side; x++){
    const [r, g, b, a] = at(x, y)
    const i = (y * side + x) * 4
    data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = a ?? 255
  }
  return {width: side, height: side, data}
}

const flatArt = paint(256, (x, y) => (x < 128) === (y < 128) ? [228, 97, 74] : [46, 74, 134])
// a slow ramp: under half a level per pixel, the case a fixed 1px comparison misreads as flat
const gradient = paint(256, (x, y) => [80 + (x >> 1), 60 + (y >> 1), 200 - (x + y >> 2)])
const lineArt = paint(256, (x, y) => (x % 16 < 2 || y % 16 < 2) ? [0, 0, 0] : [255, 255, 255])
const cutout = paint(256, (x, y) => x < 128 ? [20, 20, 20, 255] : [0, 0, 0, 0])

// flat art: two tones, almost every sample sits inside a uniform neighbourhood
const flat = analyzeImage(flatArt)
assert.equal(flat.tones, 2)
assert.ok(flat.flatRatio > 0.95, `flatRatio ${flat.flatRatio}`)
assert.equal(flat.alphaRatio, 0)

// a gradient is the opposite: thousands of tones and no flat neighbourhoods
const shaded = analyzeImage(gradient)
assert.ok(shaded.tones > 500, `tones ${shaded.tones}`)
assert.ok(shaded.flatRatio < 0.5, `flatRatio ${shaded.flatRatio}`)

// line art is few tones over a lot of edges
const lines = analyzeImage(lineArt)
assert.equal(lines.tones, 2)
assert.ok(lines.edgeRatio > 0.15, `edgeRatio ${lines.edgeRatio}`)

// transparent pixels are reported and never counted as artwork tones
const clipped = analyzeImage(cutout)
assert.ok(clipped.alphaRatio > 0.9, `alphaRatio ${clipped.alphaRatio}`)
assert.equal(clipped.tones, 1)

// each kind of image reaches the preset built for it
assert.equal(recommend(flat, 256, 256).preset, 'mono')
assert.equal(recommend(shaded, 256, 256).preset, 'photo')
assert.equal(recommend({tones: 900, edgeRatio: 0.05, flatRatio: 0.92}, 256, 256).preset, 'clipart')
assert.equal(recommend({tones: 40, edgeRatio: 0.05, flatRatio: 0.92}, 256, 256).preset, 'logo')
assert.equal(recommend({tones: 12, edgeRatio: 0.3, flatRatio: 0.9}, 256, 256).preset, 'drawing')
assert.equal(recommend({tones: 800, edgeRatio: 0.1, flatRatio: 0.4}, 256, 256).preset, 'auto')

// the patch is a complete, applyable options object plus the panel-only working size
const pick = recommend(shaded, 4000, 3000)
assert.deepEqual(
  Object.keys(pick.options).sort(),
  [...Object.keys(PRESETS.photo), 'maxSide'].sort()
)
// the note is an i18n key, not a sentence — every branch has to name one that exists
assert.ok(['twoTone', 'lineArt', 'hardEdges', 'flatFills', 'mixed', 'shaded'].includes(pick.note))

// the guide never proposes a trace past the working-size ceiling, because vtracer runs
// in one uninterruptible pass — and it never upsamples a small source either
const top = WORK_SIZES[WORK_SIZES.length - 1]
assert.equal(pick.options.maxSide, top)
assert.equal(recommend(flat, 300, 200).options.maxSide, 384)
assert.ok(WORK_SIZES.includes(recommend(shaded, 900, 900).options.maxSide))

// fine detail buys one step of supersampling, plain artwork does not
assert.ok(recommend({tones: 900, edgeRatio: 0.4, flatRatio: 0.1}, 700, 700).options.maxSide
        > recommend({tones: 900, edgeRatio: 0.02, flatRatio: 0.1}, 700, 700).options.maxSide)

// colour precision follows the measurement, and never reaches the value that aborts
// the wasm: a two-tone image asks for less separation than a shaded one
assert.ok(recommend(flat, 256, 256).options.colorPrecision
        < recommend(shaded, 256, 256).options.colorPrecision)
for(const s of [flat, shaded, lines, clipped])
  assert.ok(recommend(s, 256, 256).options.colorPrecision <= MAX_COLOR_PRECISION)
