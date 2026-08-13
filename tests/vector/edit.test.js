// Per-shape editing on a finished trace: recolour, delete, and the index bookkeeping
// that keeps a selection pointing at the shape the user clicked.
import assert from 'node:assert/strict'
import { editPaths, shapeFills, countPaths, withBackground } from '../../src/vector.js'

const traced = '<svg viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg">'
  + '<path d="M0 0" fill="#FFFFFF"/>'
  + '<path d="M1 1" fill="#E4614A"/>'
  + '<path d="M2 2" fill="#2E4A86"/>'
  + '</svg>'

// no edits is a pass-through, so an untouched trace exports byte-for-byte
assert.equal(editPaths(traced, {}), traced)

// colours are read in document order, which is the order the indices count in
assert.deepEqual(shapeFills(traced), ['#FFFFFF', '#E4614A', '#2E4A86'])

// recolouring rewrites one shape and leaves its geometry alone
const painted = editPaths(traced, {1: {fill: '#00FF00'}})
assert.ok(painted.includes('<path d="M1 1" fill="#00FF00"/>'))
assert.deepEqual(shapeFills(painted), ['#FFFFFF', '#00FF00', '#2E4A86'])

// deleting drops the shape and nothing else
const cut = editPaths(traced, {0: {removed: true}})
assert.equal(countPaths(cut), 2)
assert.ok(!cut.includes('#FFFFFF'))
assert.ok(cut.includes('#E4614A') && cut.includes('#2E4A86'))

// the indices are positions in the untouched trace, so deleting an early shape must not
// renumber the later ones — otherwise a second edit lands on the wrong shape
const both = editPaths(traced, {0: {removed: true}, 2: {fill: '#00FF00'}})
assert.deepEqual(shapeFills(both), ['#E4614A', '#00FF00'])

// a binary trace emits shapes with no fill of their own; recolouring has to add one
const bare = '<svg><path d="M0 0"/><path d="M1 1"/></svg>'
assert.ok(editPaths(bare, {1: {fill: '#123456'}}).includes('<path fill="#123456" d="M1 1"/>'))
assert.deepEqual(shapeFills(bare), ['#000000', '#000000'])

// the board tags every shape with its index so a click can name it, and marks the
// selected one — neither may reach the export
const board = editPaths(traced, {}, true, 2)
assert.ok(board.includes('data-shape="0"') && board.includes('data-shape="2"'))
assert.equal((board.match(/class="sel"/g) || []).length, 1)
assert.ok(board.includes('data-shape="2" class="sel"'))
assert.ok(!editPaths(traced, {}).includes('data-shape'))
assert.ok(!editPaths(traced, {}).includes('class="sel"'))

// tags follow the original index even when an earlier shape was deleted
const boardCut = editPaths(traced, {0: {removed: true}}, true, null)
assert.ok(!boardCut.includes('data-shape="0"'))
assert.ok(boardCut.includes('data-shape="1"') && boardCut.includes('data-shape="2"'))

// nothing selected means no mark at all
assert.ok(!boardCut.includes('class="sel"'))

// the background rect is not a shape: it must never take an index or shift the numbering
const withBg = editPaths(withBackground(traced, '#ff0000'), {}, true, 0)
assert.equal((withBg.match(/data-shape=/g) || []).length, 3)
assert.ok(withBg.indexOf('<rect') < withBg.indexOf('data-shape="0"'))
