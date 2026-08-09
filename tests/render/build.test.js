// buildSvg: the core. No DOM — rough.js generates exactly the same under node.
import assert from 'node:assert/strict'
import { buildSvg } from '../../src/scribble.js'

const UI = {
  seed: 42, roughness: 0.45, bowing: 1.6, strokeWidth: 0.7, color: '#E8EDE9',
  fillStyle: 'hachure', hachureGap: 1.8, hachureAngle: -41, passes: 2
}
const scene = (shapes, box = {x:0, y:0, w:100, h:100}) => ({box, shapes})
const tri = {d:'M0,0 L10,10 L0,10 Z', hasFill:true, hasStroke:true, matrix:null}
const widths = svg => [...svg.matchAll(/stroke-width="([^"]+)"/g)].map(m => m[1])

// fixed frame, and the original viewBox x/y survives (icon with a shifted origin)
const plain = buildSvg(scene([tri]), UI)
assert.ok(plain.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none">'))
assert.ok(plain.endsWith('</g></svg>'))
assert.ok(buildSvg(scene([tri], {x:-4, y:8, w:24, h:32}), UI).includes('viewBox="-4 8 24 32"'))

// the seed reproduces the same scribble — that is what makes the "shuffle" button the only source of variation
assert.equal(buildSvg(scene([tri]), UI), plain)
assert.notEqual(buildSvg(scene([tri]), {...UI, seed:43}), plain)

// each shape gets seed + i*977: two identical shapes don't come out overlapping.
// With no fill there's one <path> per shape, so they can be compared to each other.
const twins = [...buildSvg(scene([tri, tri]), {...UI, fillStyle:'none'}).matchAll(/<path d="([^"]+)"/g)].map(m => m[1])
assert.equal(twins.length, 2)
assert.notEqual(twins[0], twins[1])

// scale k = max(w,h)/100: a viewBox twice as big thickens the stroke by the same ratio.
// The order comes from rough: hachure threads first (strokeWidth*0.52), then the outline.
assert.deepEqual(widths(plain), ['0.364', '0.700'])
assert.deepEqual(widths(buildSvg(scene([tri], {x:0, y:0, w:200, h:200}), UI)), ['0.728', '1.400'])

// the element transform goes into a <g> and its scale is compensated: mk=2 → half the stroke
const mat = buildSvg(scene([{...tri, matrix:[2, 0, 0, 2, 5, 6]}]), UI)
assert.ok(mat.includes('<g transform="matrix(2.000000,0.000000,0.000000,2.000000,5.000000,6.000000)">'))
assert.equal(widths(mat).at(-1), '0.350')

// passes: 1 turns off rough's double stroke, 3 duplicates the drawing in an offset <g>
const strokes = svg => (svg.match(/<path d="([^"]+)"/)[1].match(/M/g) || []).length
const oneLine = {d:'M0,0 L10,10', hasFill:false, hasStroke:true}
assert.equal(strokes(buildSvg(scene([oneLine]), {...UI, passes:1})), 1)
assert.equal(strokes(buildSvg(scene([oneLine]), {...UI, passes:2})), 2)
assert.ok(!buildSvg(scene([tri]), {...UI, passes:2}).includes('opacity'))
assert.ok(buildSvg(scene([tri]), {...UI, passes:3}).includes('<g transform="translate(0.35,0.30)" opacity="0.6">'))

// fill only comes out if the original shape had one — otherwise fillStyle is ignored entirely
assert.ok(buildSvg(scene([tri]), {...UI, fillStyle:'solid'}).includes('fill="#E8EDE9"'))
const noFill = buildSvg(scene([{...tri, hasFill:false}]), {...UI, fillStyle:'solid'})
assert.ok(!noFill.includes('fill="#E8EDE9"'))
assert.equal(noFill, buildSvg(scene([tri]), {...UI, fillStyle:'none'}))

// a shape rough can't swallow is skipped, the rest of the icon still comes out
const mixed = buildSvg(scene([{d:'NAO E PATH', hasFill:false, hasStroke:true}, tri]), UI)
assert.ok(mixed.includes('<path d=') && mixed.endsWith('</g></svg>'))
assert.equal(buildSvg(scene([]), UI), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none"></g></svg>')
