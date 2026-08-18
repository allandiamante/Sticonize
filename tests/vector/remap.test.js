// Carrying edits across a re-trace: another working size or a refine pass renumbers every
// shape and nudges every palette entry, so the recolours and deletes have to be found
// again in the new trace instead of being thrown away with the old one.
import assert from 'node:assert/strict'
import { shapeMarks, remapEdits, remapSwaps } from '../../src/vector.js'

// the same drawing traced at two resolutions: same three shapes in the same places, drawn
// with different coordinates, one extra speck the finer trace picked up, and the palette
// centroids a step off where the coarse pass put them
const coarse = '<svg viewBox="0 0 10 10">'
  + '<path d="M0 0 L2 0 L2 2 L0 2" fill="#e4614a"/>'
  + '<path d="M6 6 L8 6 L8 8 L6 8" fill="#2e4a86"/>'
  + '<path d="M0 8 L2 8 L2 10 L0 10" fill="#ffffff"/>'
  + '</svg>'

const fine = '<svg viewBox="0 0 20 20">'
  + '<path d="M11 3 L13 3 L13 5 L11 5" fill="#2f4b85"/>'   // the speck, and a renumbering
  + '<path d="M0 0 L4 0 L4 4 L0 4" fill="#e5604b"/>'
  + '<path d="M12 12 L16 12 L16 16 L12 16" fill="#2f4b85"/>'
  + '<path d="M0 16 L4 16 L4 20 L0 20" fill="#fefefe"/>'
  + '</svg>'

// the marks are fractions of the canvas, so the two traces are measured on one scale
const [a, b] = [shapeMarks(coarse), shapeMarks(fine)]
assert.equal(a.length, 3)
assert.equal(b.length, 4)
assert.ok(Math.abs(a[0].x - b[1].x) < 0.02 && Math.abs(a[0].y - b[1].y) < 0.02)

// a delete and a recolour survive the re-trace, landing on the shapes they were made on
// rather than on the indices those shapes used to have
const moved = remapEdits({0: {removed: true}, 1: {fill: '#00ff00'}}, a, b)
assert.deepEqual(moved, {1: {removed: true}, 2: {fill: '#00ff00'}})

// two edits never collapse onto one shape, however close the runners-up are
const crowded = remapEdits({0: {fill: '#111111'}, 1: {fill: '#222222'}, 2: {fill: '#333333'}}, a, b)
assert.equal(new Set(Object.keys(crowded)).size, 3)

// an edit whose shape is gone from the new trace is dropped, not moved onto a stranger:
// putting someone's delete on the wrong shape is worse than losing it
const gone = '<svg viewBox="0 0 20 20"><path d="M0 0 L4 0 L4 4 L0 4" fill="#e5604b"/></svg>'
assert.deepEqual(remapEdits({1: {removed: true}}, a, shapeMarks(gone)), {})

// swaps are keyed by the colour the trace produced, so they follow the palette's drift
assert.deepEqual(remapSwaps({'#2e4a86': '#000000'}, ['#e5604b', '#2f4b85']), {'#2f4b85': '#000000'})

// but a palette with nothing near the old key — switching tone to mono — drops it rather
// than repainting some unrelated colour
assert.deepEqual(remapSwaps({'#2e4a86': '#000000'}, ['#000000', '#ffffff']), {})

// a shape with no fill of its own is black, the same way shapeFills reads it
assert.equal(shapeMarks('<svg><path d="M0 0"/></svg>')[0].fill, '#000000')

console.log('ok')
