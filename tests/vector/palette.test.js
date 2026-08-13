// The colour count, which is the one number the panel promises. It is kept by two steps
// that have to agree: quantize decides the palette before the trace, snapFills forces
// the traced shapes back onto it afterwards. The engine respects neither on its own.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { initSync, to_svg } from 'vtracer-wasm'
import { quantize, snapFills, finishSvg } from '../../src/trace-core.js'
import { traceOptions, countColors, PRESETS, MIN_COLORS, MAX_COLORS } from '../../src/vector.js'

initSync({ module: fs.readFileSync('node_modules/vtracer-wasm/vtracer.wasm') })

const S = 128

/* Paints ramps with two solid subjects on top — smooth enough that the tracer wants to
   invent shades, flat enough that a small palette is a fair ask.
   Takes nothing; returns an ImageData-shaped object. */
function artwork(){
  const data = new Uint8ClampedArray(S * S * 4)
  let seed = 5
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  for(let y = 0; y < S; y++) for(let x = 0; x < S; x++){
    const i = (y * S + x) * 4
    data[i] = 30 + x * 1.4 + rnd() * 8
    data[i+1] = 90 + y * 1.0 + rnd() * 8
    data[i+2] = 200 - (x + y) * 0.6 + rnd() * 8
    data[i+3] = 255
    if(Math.hypot(x - 40, y - 45) < 22){ data[i] = 228; data[i+1] = 97; data[i+2] = 74 }
  }
  return {data, width: S, height: S}
}

const traced = img => finishSvg(
  to_svg(new Uint8Array(img.data.buffer), S, S, traceOptions(PRESETS.auto)), S, S)

// asking for N colours yields at most N, at both ends of the range and in between
for(const n of [MIN_COLORS, 3, 5, 8, 16, MAX_COLORS]){
  const img = artwork()
  const palette = quantize(img, n)
  assert.equal(palette.length, n, `${n}: palette size`)
  assert.ok(palette.every(c => /^#[0-9a-f]{6}$/.test(c)), `${n}: palette is hex`)

  const svg = snapFills(traced(img), palette)
  const out = countColors(svg)
  assert.ok(out <= n, `${n}: traced back with ${out} colours`)
  // every colour in the output is one the palette offered — not a shade near it
  const used = new Set([...svg.matchAll(/fill="([^"]+)"/g)].map(m => m[1]))
  for(const u of used) assert.ok(palette.includes(u), `${n}: ${u} is not in the palette`)
}

// without snapping the engine invents its own shades, which is the reason snapFills
// exists at all — if this ever stops being true the extra pass can go
const loose = artwork()
const loosePalette = quantize(loose, 4)
assert.ok(countColors(traced(loose)) > loosePalette.length,
  'the engine still re-derives colours from flat input')

// quantizing is deterministic: the same image twice gives the same palette, so nudging
// an unrelated slider does not reshuffle every colour
assert.deepEqual(quantize(artwork(), 6), quantize(artwork(), 6))

// transparency is not a colour: it stays out of the palette and stays transparent
const cut = {data: new Uint8ClampedArray(S * S * 4), width: S, height: S}
for(let i = 0; i < S * S; i++){
  const p = i * 4
  const opaque = (i % S) < S / 2
  cut.data[p] = 200; cut.data[p+1] = 30; cut.data[p+2] = 30
  cut.data[p+3] = opaque ? 255 : 0
}
const cutPalette = quantize(cut, 4)
assert.ok(cutPalette.length >= 1)
assert.equal(cut.data[3], 255, 'opaque pixels stay opaque')
assert.equal(cut.data[(Math.floor(S * 0.75)) * 4 + 3], 0, 'transparent pixels stay transparent')

// a fully transparent image has no colours to offer, and must not throw looking
const blank = {data: new Uint8ClampedArray(S * S * 4), width: S, height: S}
assert.deepEqual(quantize(blank, 8), [])
assert.equal(snapFills('<path fill="#abcdef"/>', []), '<path fill="#abcdef"/>')

// an image with fewer distinct colours than asked returns what it has, not padding
const flat = {data: new Uint8ClampedArray(S * S * 4), width: S, height: S}
for(let i = 0; i < S * S; i++){
  const p = i * 4
  const left = (i % S) < S / 2
  flat.data[p] = left ? 20 : 240
  flat.data[p+1] = left ? 20 : 240
  flat.data[p+2] = left ? 20 : 240
  flat.data[p+3] = 255
}
assert.equal(quantize(flat, 16).length, 2, 'two-tone art yields two entries, not sixteen')
