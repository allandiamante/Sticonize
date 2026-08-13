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

/* Reads the colours an image is actually painted in.
   Takes an ImageData-shaped object; returns them as a Set of '#rrggbb'. */
const painted = img => {
  const out = new Set()
  for(let p = 0; p < img.data.length; p += 4){
    if(img.data[p + 3] < 128) continue
    out.add('#' + [0, 1, 2].map(c => img.data[p + c].toString(16).padStart(2, '0')).join(''))
  }
  return out
}

// asking for N colours yields at most N, at both ends of the range and in between
for(const n of [MIN_COLORS, 3, 5, 8, 16, MAX_COLORS]){
  const img = artwork()
  const palette = quantize(img, n)
  assert.ok(palette.length <= n, `${n}: palette size ${palette.length}`)
  assert.ok(palette.length >= Math.min(n, 2), `${n}: palette is not empty`)
  assert.ok(palette.every(c => /^#[0-9a-f]{6}$/.test(c)), `${n}: palette is hex`)
  // and every entry is a colour the image came back painted in. Median cut can land an
  // entry between the colours that are there, where it wins no pixel and would show up
  // in the panel's swatches as a colour the drawing does not contain
  assert.equal(new Set(palette).size, palette.length, `${n}: no entry repeats`)
  const real = painted(img)
  for(const c of palette) assert.ok(real.has(c), `${n}: ${c} is in the palette but not the image`)

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

/* Paints a logo shaped the way logos are: most of the canvas is background, border and
   shading, and the one thing the drawing is about covers a fiftieth of it.
   Takes nothing; returns an ImageData-shaped object. */
function badge(){
  const data = new Uint8ClampedArray(S * S * 4)
  for(let y = 0; y < S; y++) for(let x = 0; x < S; x++){
    const i = (y * S + x) * 4
    const r = Math.hypot(x - S/2, y - S/2)
    const c = r < S * 0.07 ? [214, 62, 55]          // the badge — 1.5% of the pixels
          : r < S * 0.13   ? [250, 250, 250]
          : r < S * 0.20   ? [58, 40, 30]
          : r < S * 0.30   ? [150, 105, 75]
          : r < S * 0.40   ? [238, 220, 185]
          : r < S * 0.48   ? [96, 118, 134]
                           : [255, 255, 255]
    data[i] = c[0]; data[i+1] = c[1]; data[i+2] = c[2]; data[i+3] = 255
  }
  return {data, width: S, height: S}
}

/* Whether a palette carries something recognisably this colour.
   Takes the palette and the wanted [r,g,b]; returns a boolean. */
const carries = (palette, want) => palette.some(hex => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return Math.hypot(c[0] - want[0], c[1] - want[1], c[2] - want[2]) < 60
})

// The entries go to the colours that are far apart, not to the colours there is most of.
// Allocating by population — median cut, which this used to do — spent them subdividing
// the background and the browns, and the red badge came back brown at any count asked for.
for(const n of [6, 8, 16]){
  const palette = quantize(badge(), n)
  assert.ok(carries(palette, [214, 62, 55]), `${n}: the badge keeps its colour`)
  assert.ok(carries(palette, [96, 118, 134]), `${n}: and the large areas keep theirs`)
  assert.ok(carries(palette, [255, 255, 255]), `${n}: including the background`)
}

// the badge is 1.5% of the image, so nothing about this works by it being big
const area = (() => {
  const img = badge()
  let n = 0
  for(let p = 0; p < img.data.length; p += 4) if(img.data[p] === 214) n++
  return n / (S * S)
})()
assert.ok(area < 0.02, `the badge covers ${(area * 100).toFixed(1)}% and still gets an entry`)

// an image with fewer colours than asked for comes back with what it has, not padding
assert.equal(quantize(flatTwoTone(), 16).length, 2, 'no entries that win no pixels')

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

/* Paints half the canvas near-black and half near-white.
   Takes nothing; returns an ImageData-shaped object with exactly two colours in it. */
function flatTwoTone(){
  const data = new Uint8ClampedArray(S * S * 4)
  for(let i = 0; i < S * S; i++){
    const p = i * 4
    const left = (i % S) < S / 2
    data[p] = data[p+1] = data[p+2] = left ? 20 : 240
    data[p+3] = 255
  }
  return {data, width: S, height: S}
}

// an image with fewer distinct colours than asked returns what it has, not padding
assert.equal(quantize(flatTwoTone(), 16).length, 2, 'two-tone art yields two entries, not sixteen')
