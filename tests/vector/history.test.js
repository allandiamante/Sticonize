// The undo stack behind Ctrl+Z: recordEdit snapshots a map key before it changes,
// undoEdit puts the most recent one back.
import assert from 'node:assert/strict'
import { recordEdit, sealEdit, undoEdit } from '../../src/vector.js'

// undoing with nothing recorded is a no-op, not a throw
const empty = []
undoEdit(empty)
assert.deepEqual(empty, [])

// a key that had nothing before is deleted on undo, not set to undefined
const edits = {0: {fill: '#00ff00'}}
const history = []
recordEdit(history, edits, 1)
edits[1] = {fill: '#ff00ff'}
undoEdit(history)
assert.deepEqual(edits, {0: {fill: '#00ff00'}})
assert.ok(!(1 in edits))

// a key that had a prior value is restored to it, not deleted
recordEdit(history, edits, 0)
edits[0] = {fill: '#123456'}
undoEdit(history)
assert.deepEqual(edits, {0: {fill: '#00ff00'}})

// undo only ever reverses one step, and only the map it was recorded against
const swaps = {}
recordEdit(history, edits, 0)
edits[0] = {removed: true}
recordEdit(history, swaps, '#e4614a')
swaps['#e4614a'] = '#00ff00'
undoEdit(history)
assert.deepEqual(swaps, {})
assert.deepEqual(edits, {0: {removed: true}}, 'earlier step in the stack is untouched until its own undo')
undoEdit(history)
assert.deepEqual(edits, {0: {fill: '#00ff00'}})

// ---- one drag is one undo ----------------------------------------------------------
// a colour input fires input on every frame of a drag in the picker. Recording each one
// as its own step is what made ctrl+z look dead: it took hundreds of presses to walk back
// a colour someone picked once.
const drag = []
const pal = {}
for(const c of ['#111111', '#222222', '#333333', '#444444']){
  recordEdit(drag, pal, '#e4614a')
  pal['#e4614a'] = c
}
assert.equal(drag.length, 1, 'a drag is one step, however many events it fires')
undoEdit(drag)
assert.deepEqual(pal, {}, 'and one undo puts the whole drag back')

// the change event that ends a drag seals it, so a second drag on the same swatch is its
// own step rather than vanishing into the first
recordEdit(drag, pal, '#e4614a')
pal['#e4614a'] = '#00ff00'
sealEdit(drag)
recordEdit(drag, pal, '#e4614a')
pal['#e4614a'] = '#0000ff'
assert.equal(drag.length, 2)
undoEdit(drag)
assert.deepEqual(pal, {'#e4614a': '#00ff00'}, 'back to where the first drag left it')

// sealing an empty history is a no-op, not a throw
sealEdit([])

// only the top step folds: alternating between two swatches keeps both
const two = []
const marks = {}
recordEdit(two, marks, 'a'); marks.a = 1
recordEdit(two, marks, 'b'); marks.b = 2
recordEdit(two, marks, 'a'); marks.a = 3
assert.equal(two.length, 3)
undoEdit(two)
assert.deepEqual(marks, {a: 1, b: 2})
