// The tracer itself: the wasm is instantiated and run for real, because every fact this
// file asserts is a property of the engine, not of our wrapper around it.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { initSync, to_svg } from 'vtracer-wasm'
import { finishSvg } from '../../src/trace-core.js'
import { traceOptions, withBackground, countPaths, countColors, PRESETS, MAX_COLOR_PRECISION } from '../../src/vector.js'

initSync({ module: fs.readFileSync('node_modules/vtracer-wasm/vtracer.wasm') })

/* Paints a disc on a background.
   Takes the canvas side, whether the surround is transparent instead of white, and the
   disc's RGB; returns an RGBA8 buffer the tracer accepts. */
function disc(side, transparent, ink = [228, 97, 74]){
  const px = new Uint8Array(side * side * 4)
  const r = side / 3
  for(let y = 0; y < side; y++) for(let x = 0; x < side; x++){
    const i = (y * side + x) * 4
    if((x - side/2) ** 2 + (y - side/2) ** 2 < r * r){
      px[i] = ink[0]; px[i+1] = ink[1]; px[i+2] = ink[2]; px[i+3] = 255
    }else if(!transparent){
      px[i] = px[i+1] = px[i+2] = 255; px[i+3] = 255
    }
  }
  return px
}

const S = 96
const trace = (px, opts) => finishSvg(to_svg(px, S, S, traceOptions(opts)), S, S)

// the engine emits an XML prolog and no viewBox; neither survives finishSvg, or the
// markup could not be embedded in the page nor scaled to the board
const raw = to_svg(disc(S, false), S, S, traceOptions(PRESETS.auto))
assert.ok(raw.startsWith('<?xml'), 'engine still emits a prolog')
assert.ok(!/viewBox/.test(raw), 'engine still emits no viewBox')

const svg = finishSvg(raw, S, S)
assert.ok(svg.startsWith('<svg '))
assert.ok(svg.includes(`viewBox="0 0 ${S} ${S}"`))

// a two-tone disc traces to two shapes, and its colours survive quantization
assert.equal(countPaths(svg), 2)
assert.equal(countColors(svg), 2)

// a transparent surround is not traced as a colour of its own
const cut = trace(disc(S, true), PRESETS.auto)
assert.equal(countPaths(cut), 1)
assert.equal(countColors(cut), 1)

// every preset produces usable markup rather than throwing. The black-and-white preset
// thresholds on luminance, so it is fed the black-on-white art it is meant for — which
// is exactly what tonemap hands it in the worker.
for(const [name, preset] of Object.entries(PRESETS)){
  const art = disc(S, false, preset.tone === 'mono' ? [20, 20, 20] : [228, 97, 74])
  const out = trace(art, preset)
  assert.ok(out.startsWith('<svg '), `${name} produced markup`)
  assert.ok(countPaths(out) >= 1, `${name} produced at least one path`)
}

// the engine's own black-and-white cut drops a mid-tone subject entirely: valid markup,
// nothing in it. This is the whole reason the pixels are cut before they get here, so it
// has to stay pinned — if a future build stops dropping it, tonemap's mono pass is no
// longer load-bearing and the engine could be trusted with the cut again.
const dropped = trace(disc(S, false), PRESETS.mono)
assert.ok(dropped.startsWith('<svg '))
assert.equal(countPaths(dropped), 0)
assert.ok(!dropped.includes('<path'))

// colorPrecision is the one setting whose ceiling is measured rather than documented.
// vtracer's CLI calls it significant bits per channel, but this build merges regions as
// it rises: at MAX_COLOR_PRECISION the artwork survives, and two steps above it the
// whole image collapses into one shape. That collapse is why the cap exists, so it is
// pinned here — if a future build stops collapsing, this fails and the cap can rise.
const art = disc(S, false)
const atCap = trace(art, {...PRESETS.auto, colorPrecision: MAX_COLOR_PRECISION})
assert.equal(countColors(atCap), 2, 'artwork survives at the cap')

const collapsed = to_svg(art, S, S, {
  ...traceOptions(PRESETS.auto), colorPrecision: MAX_COLOR_PRECISION + 2
})
assert.ok(countPaths(collapsed) <= 1, 'two steps above the cap the engine still collapses')

// 8 aborts the wasm outright, so the clamp is load-bearing: the panel must not be able
// to reach it, and the engine must survive being asked
assert.equal(traceOptions({...PRESETS.auto, colorPrecision: 8}).colorPrecision, MAX_COLOR_PRECISION)
assert.doesNotThrow(() => trace(art, {...PRESETS.auto, colorPrecision: 99}))

// no preset ships a value the panel would refuse to reproduce
for(const [name, preset] of Object.entries(PRESETS))
  assert.ok(preset.colorPrecision <= MAX_COLOR_PRECISION, `${name} is inside the usable range`)

// an unparseable enum is the other way to abort it, and is clamped the same way
assert.doesNotThrow(() => trace(disc(S, false), {...PRESETS.auto, mode: 'nope', hierarchical: 'nope'}))

// the background lands inside the root tag — past the prolog, before the first shape
const filled = withBackground(svg, '#ff0000')
assert.ok(filled.indexOf('<rect width="100%" height="100%" fill="#ff0000"/>') < filled.indexOf('<path'))
assert.ok(filled.startsWith('<svg '))
