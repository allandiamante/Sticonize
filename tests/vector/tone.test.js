// Black and white without losing the drawing. The engine cuts at a fixed level and a
// mid-tone subject on white falls off it whole — engine.test.js pins that. Everything
// here is about the pass that stops it: the cut is read off the picture, so whatever the
// darker half of this image is, it survives.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { initSync, to_svg } from 'vtracer-wasm'
import { tonemap, quantize, finishSvg } from '../../src/trace-core.js'
import { traceOptions, countPaths, PRESETS, TONES, MAX_THRESHOLD } from '../../src/vector.js'

initSync({ module: fs.readFileSync('node_modules/vtracer-wasm/vtracer.wasm') })

const S = 96

/* Paints a disc of one colour on a background of another.
   Takes the subject and background RGB, and whether the surround is transparent instead;
   returns an ImageData-shaped object. */
function disc(ink, back, transparent = false){
  const data = new Uint8ClampedArray(S * S * 4)
  for(let y = 0; y < S; y++) for(let x = 0; x < S; x++){
    const i = (y * S + x) * 4
    const inside = (x - S/2) ** 2 + (y - S/2) ** 2 < (S/3) ** 2
    const c = inside ? ink : back
    data[i] = c[0]; data[i+1] = c[1]; data[i+2] = c[2]
    data[i+3] = inside || !transparent ? 255 : 0
  }
  return {data, width: S, height: S}
}

const luma = p => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]
const at = (img, x, y) => [...img.data.slice((y * S + x) * 4, (y * S + x) * 4 + 4)]
const middle = img => at(img, S/2, S/2)
const edge = img => at(img, 2, 2)

// ---- the case that was losing the drawing -----------------------------------------
// a mid-tone subject on white: nothing in it is dark enough for a fixed cut, and the
// engine returns an empty trace. Read off the picture, the disc is plainly the dark half.
const MID = [228, 97, 74]
const mid = disc(MID, [255, 255, 255])
tonemap(mid, 'mono')
assert.deepEqual(middle(mid).slice(0, 3), [0, 0, 0], 'the subject came out black')
assert.deepEqual(edge(mid).slice(0, 3), [255, 255, 255], 'the background came out white')

// and the engine keeps it, where the same disc untouched traces to nothing
const traced = finishSvg(
  to_svg(new Uint8Array(mid.data.buffer), S, S, traceOptions(PRESETS.mono)), S, S)
assert.ok(countPaths(traced) >= 1, 'the drawing survives the trace')

// it holds the other way round too: a light subject on a dark ground is the light half,
// and the cut has no opinion about which one is the subject
const flipped = disc([240, 240, 200], [30, 40, 60])
tonemap(flipped, 'mono')
assert.deepEqual(middle(flipped).slice(0, 3), [255, 255, 255])
assert.deepEqual(edge(flipped).slice(0, 3), [0, 0, 0])

// a low-contrast pair is still split: the cut is relative to the picture, not absolute
const faint = disc([120, 120, 120], [150, 150, 150])
tonemap(faint, 'mono')
assert.deepEqual(middle(faint).slice(0, 3), [0, 0, 0])
assert.deepEqual(edge(faint).slice(0, 3), [255, 255, 255])

// ---- the bias --------------------------------------------------------------------
// pushing the cut past the subject takes the whole picture to one side; that is the
// panel's business to warn about, but it must not crash or invent a third tone
for(const bias of [-MAX_THRESHOLD, 0, MAX_THRESHOLD]){
  const img = disc(MID, [255, 255, 255])
  tonemap(img, 'mono', bias)
  const tones = new Set()
  for(let p = 0; p < img.data.length; p += 4) tones.add(img.data[p])
  assert.ok([...tones].every(v => v === 0 || v === 255), `bias ${bias}: two tones only`)
}
// a cut moved up past the subject's luma swallows it into black
const swallowed = disc(MID, [255, 255, 255])
tonemap(swallowed, 'mono', MAX_THRESHOLD)
assert.ok(luma(middle(swallowed)) <= luma(middle(mid)), 'raising the cut only darkens')

// ---- grey ------------------------------------------------------------------------
// the tone that keeps the drawing whole: hues gone, everything else where it was
const grey = disc(MID, [40, 90, 200])
tonemap(grey, 'gray')
for(const p of [middle(grey), edge(grey)]){
  assert.equal(p[0], p[1], 'channels match')
  assert.equal(p[1], p[2], 'channels match')
}
assert.equal(middle(grey)[0], Math.round(luma(MID)), 'and sit at the luma they came from')
assert.notEqual(middle(grey)[0], edge(grey)[0], 'two colours of the same lightness would merge, these do not')

// grey is a palette like any other, so the colour count still means something
const ramp = {data: new Uint8ClampedArray(S * S * 4), width: S, height: S}
for(let i = 0; i < S * S; i++){
  const p = i * 4
  ramp.data[p] = ramp.data[p+1] = ramp.data[p+2] = (i % S) * 2
  ramp.data[p+3] = 255
}
tonemap(ramp, 'gray')
for(const n of [2, 6, 12]){
  const steps = quantize({...ramp, data: new Uint8ClampedArray(ramp.data)}, n)
  assert.equal(steps.length, n, `a ramp gives the ${n} steps asked for`)
  assert.equal(new Set(steps).size, n, 'and no step repeats')
  for(const c of steps) assert.match(c, /^#([0-9a-f]{2})\1\1$/, `${c} is a grey`)
}

// ---- what it leaves alone --------------------------------------------------------
// the colour tone is a no-op, not a pass that quietly rounds something
const colour = disc(MID, [40, 90, 200])
const untouched = disc(MID, [40, 90, 200])
tonemap(colour, 'color')
assert.deepEqual([...colour.data], [...untouched.data])
for(const tone of TONES) assert.doesNotThrow(() => tonemap(disc(MID, [9, 9, 9]), tone))

// transparency is not a tone: it is not counted into the cut and it stays transparent
const cut = disc(MID, [255, 255, 255], true)
tonemap(cut, 'mono')
assert.equal(at(cut, 2, 2)[3], 0, 'transparent pixels stay transparent')
assert.deepEqual(middle(cut).slice(0, 3), [0, 0, 0], 'and the subject is still the dark half')

// an image with nothing opaque in it has no cut to find, and must not throw looking
const blank = {data: new Uint8ClampedArray(S * S * 4), width: S, height: S}
assert.doesNotThrow(() => tonemap(blank, 'mono'))

// a silhouette on transparency is one tone and has no split at all. It must come back as
// the shape it is — the earlier version handed it a mid cut, called the only tone in the
// picture "light", and returned a blank page.
const solid = disc([90, 90, 90], [0, 0, 0], true)
tonemap(solid, 'mono')
assert.deepEqual(middle(solid).slice(0, 3), [0, 0, 0], 'the silhouette is the drawing')
assert.equal(at(solid, 2, 2)[3], 0)
const silhouette = finishSvg(
  to_svg(new Uint8Array(solid.data.buffer), S, S, traceOptions(PRESETS.mono)), S, S)
assert.ok(countPaths(silhouette) >= 1, 'and it still traces to a shape')
