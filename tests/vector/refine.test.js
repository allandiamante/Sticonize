// The refine pass. It rewrites geometry the engine already got right enough to ship, so
// what matters is that it stays on the shape: corners where corners were, the outline in
// the same place, fewer anchors, and nothing quietly dropped.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { initSync, to_svg } from 'vtracer-wasm'
import { quantize, snapFills, finishSvg } from '../../src/trace-core.js'
import { refineSvg } from '../../src/refine.js'
import { traceOptions, countPaths, countColors, shapeFills, editPaths, withBackground, PRESETS, PHASES } from '../../src/vector.js'

initSync({ module: fs.readFileSync('node_modules/vtracer-wasm/vtracer.wasm') })

const wrap = body =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">\n${body}\n</svg>`

/* Reads the anchor points out of refined markup — the last coordinate pair of every
   command, which is where the outline actually passes.
   Takes the SVG; returns [{x, y}]. */
function anchors(svg){
  const out = []
  for(const [, cmd, args] of svg.matchAll(/([MLC])([^MLCZ"]*)/g)){
    const n = (args.match(/[-+]?\d*\.?\d+/g) || []).map(Number)
    if(cmd === 'C') for(let i = 4; i + 1 < n.length; i += 6) out.push({x: n[i], y: n[i+1]})
    else for(let i = 0; i + 1 < n.length; i += 2) out.push({x: n[i], y: n[i+1]})
  }
  return out
}

const box = pts => ({
  x0: Math.min(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)),
  x1: Math.max(...pts.map(p => p.x)), y1: Math.max(...pts.map(p => p.y))
})

// ---- corners survive -------------------------------------------------------------
// a square is the case the pass is most able to ruin: relaxing an outline without
// locking its corners rounds them off, and refitting one without a straight-segment case
// writes four curves that only look straight
const square = await refineSvg(
  wrap('<path d="M0,0 L100,0 L100,100 L0,100 Z" fill="#101010" transform="translate(10,10)"/>'),
  {corner: 60, precision: 2})

assert.equal(countPaths(square), 1)
assert.ok(!square.includes('C'), 'a square refines to lines, not curves')
assert.deepEqual(box(anchors(square)), {x0: 10, y0: 10, x1: 110, y1: 110},
  'the translate is baked in and the corners stay put')
assert.equal(anchors(square).length, 4, 'four corners, no anchors invented')

// the same square with corners called shallow rounds off instead: the corner angle is
// the lever, and it reaches this pass too
const rounded = await refineSvg(
  wrap('<path d="M0,0 L100,0 L100,100 L0,100 Z" fill="#101010" transform="translate(10,10)"/>'),
  {corner: 170, precision: 2})
assert.ok(rounded.includes('C'), 'past the corner angle the same square comes back curved')

// ---- welding ---------------------------------------------------------------------
// neighbouring shapes of one colour become one path, which is where the shape count goes
const welded = await refineSvg(wrap([
  '<path d="M0,0 L10,0 L10,10 L0,10 Z" fill="#101010" transform="translate(0,0)"/>',
  '<path d="M0,0 L10,0 L10,10 L0,10 Z" fill="#101010" transform="translate(50,0)"/>',
  '<path d="M0,0 L10,0 L10,10 L0,10 Z" fill="#ff0000" transform="translate(100,0)"/>'
].join('\n')), {corner: 60, precision: 2})
assert.equal(countPaths(welded), 2, 'the two black squares weld, the red one does not')
assert.equal(countColors(welded), 2)
assert.equal((welded.match(/M/g) || []).length, 3, 'welding keeps three separate outlines')

// a colour that comes back later must not jump forward into the earlier run: the layers
// are painted in order, and moving one changes what covers what
const ordered = await refineSvg(wrap([
  '<path d="M0,0 L10,0 L10,10 L0,10 Z" fill="#101010" transform="translate(0,0)"/>',
  '<path d="M0,0 L10,0 L10,10 L0,10 Z" fill="#ff0000" transform="translate(20,0)"/>',
  '<path d="M0,0 L10,0 L10,10 L0,10 Z" fill="#101010" transform="translate(40,0)"/>'
].join('\n')), {corner: 60, precision: 2})
assert.equal(countPaths(ordered), 3, 'paint order is not reshuffled to weld')
assert.ok(ordered.indexOf('#ff0000') < ordered.lastIndexOf('#101010'), 'the red stays in the middle')

// ---- what it refuses to touch ----------------------------------------------------
// an arc is not something this parser reads, and a guessed path is worse than an
// untouched one
const arc = '<path d="M0 0 A 5 5 0 0 1 10 10 Z" fill="#123456" transform="translate(0,0)"/>'
assert.ok((await refineSvg(wrap(arc), {corner: 60, precision: 2})).includes(arc),
  'a path it cannot read is passed through as it stands')

// a sliver with no area is not a shape, and dropping it must not take its neighbour
const sliver = await refineSvg(wrap([
  '<path d="M0,0 L100,0 L0,0 Z" fill="#101010" transform="translate(0,0)"/>',
  '<path d="M0,0 L10,0 L10,10 L0,10 Z" fill="#ff0000" transform="translate(0,50)"/>'
].join('\n')), {})
assert.equal(countPaths(sliver), 1, 'the zero-area outline goes, the square stays')
assert.ok(sliver.includes('#ff0000'))

// a pass that discards everything is reported rather than shown as a blank board, the
// same way an empty trace is
await assert.rejects(
  () => refineSvg(wrap('<path d="M0,0 L100,0 L0,0 Z" fill="#101010" transform="translate(0,0)"/>'), {}),
  /emptyTrace/)

// ---- against a real trace --------------------------------------------------------
const S = 160
const px = new Uint8Array(S * S * 4)
for(let y = 0; y < S; y++) for(let x = 0; x < S; x++){
  const i = (y * S + x) * 4
  const inside = (x - S/2) ** 2 + (y - S/2) ** 2 < (S/3) ** 2
  px[i] = inside ? 228 : 255
  px[i+1] = inside ? 97 : 255
  px[i+2] = inside ? 74 : 255
  px[i+3] = 255
}
const image = {data: new Uint8ClampedArray(px), width: S, height: S}
const palette = quantize(image, 4)
const traced = snapFills(
  finishSvg(to_svg(new Uint8Array(image.data.buffer), S, S, traceOptions(PRESETS.auto)), S, S),
  palette)

const seen = []
const refined = await refineSvg(traced, {corner: 60, precision: 2}, async p => seen.push(p))

// every step reports, in order, or the panel spends a minute saying nothing
assert.deepEqual(seen, ['smooth', 'anchors', 'curves', 'assemble'])
// and the panel has a word for each of them
assert.deepEqual(PHASES.slice(-4), seen)

assert.ok(refined.startsWith('<svg '))
assert.ok(refined.includes('viewBox="0 0 160 160"'), 'the viewBox survives the rebuild')
assert.equal(countPaths(refined), 2, 'the disc and its background both survive')

// the colours are still the palette's, so the count the panel promises is not undone here
for(const c of refined.matchAll(/fill="([^"]+)"/g))
  assert.ok(palette.includes(c[1]), `${c[1]} is not in the palette`)

// nothing but the four commands the drawing needs
for(const [, d] of refined.matchAll(/\sd="([^"]*)"/g))
  assert.ok(/^[MLCZ\s\d.,+-]*$/.test(d), 'only M/L/C/Z come out')

// the board still works on it: refining rewrites every path, and the shape editor reads
// those paths back by pattern
const fills = shapeFills(refined)
assert.equal(fills.length, countPaths(refined))
assert.ok(fills.every(f => palette.includes(f)))
assert.equal(countPaths(editPaths(refined, {0: {removed: true}})), countPaths(refined) - 1)
assert.ok(editPaths(refined, {1: {fill: '#00ff00'}}).includes('#00ff00'))
assert.ok(withBackground(refined, '#ff0000').indexOf('<rect') < withBackground(refined, '#ff0000').indexOf('<path'))

// the outline lands where it was traced: a disc of radius S/3 in a S-wide box
const disc = box(anchors(refined.split('\n').find(l => l.includes(palette[0]))))
for(const [name, got, want] of [['x0', disc.x0, S/2 - S/3], ['y0', disc.y0, S/2 - S/3],
                                ['x1', disc.x1, S/2 + S/3], ['y1', disc.y1, S/2 + S/3]])
  assert.ok(Math.abs(got - want) <= 2, `${name} moved to ${got}, expected ~${want}`)

// On clean synthetic art the engine's own fit is already compact, and refining spends
// more anchors than it saves — the pass is not a compressor. Where it pays is the input
// it was written for: a noisy edge, which the engine follows bump for bump.
let seed = 7
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const noisy = new Uint8ClampedArray(S * S * 4)
for(let y = 0; y < S; y++) for(let x = 0; x < S; x++){
  const i = (y * S + x) * 4
  const inside = Math.hypot(x - S/2, y - S/2) + (rnd() - 0.5) * 3 < S/3
  noisy[i] = (inside ? 228 : 255) + (rnd() - 0.5) * 20
  noisy[i+1] = (inside ? 97 : 255) + (rnd() - 0.5) * 20
  noisy[i+2] = (inside ? 74 : 255) + (rnd() - 0.5) * 20
  noisy[i+3] = 255
}
const grain = {data: noisy, width: S, height: S}
const grainPalette = quantize(grain, 4)
const grainTrace = snapFills(
  finishSvg(to_svg(new Uint8Array(grain.data.buffer), S, S, traceOptions(PRESETS.auto)), S, S),
  grainPalette)
const grainRefined = await refineSvg(grainTrace, {corner: 60, precision: 2})

const before = (grainTrace.match(/[MLC]/g) || []).length
const after = (grainRefined.match(/[MLC]/g) || []).length
assert.ok(after < before * 0.8,
  `a noisy edge should cost far fewer anchors: ${after} against ${before}`)
assert.ok(countPaths(grainRefined) <= countPaths(grainTrace), 'and no more shapes than it started with')
