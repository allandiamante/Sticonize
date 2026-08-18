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

// ---- redo -------------------------------------------------------------------------
// undo and redo are one move: undoEdit hands the step it reversed to the other stack,
// so calling it with the stacks swapped walks forward again.
const back = []
const forward = []
const cells = {}
recordEdit(back, cells, 'a'); cells.a = 1
recordEdit(back, cells, 'b'); cells.b = 2

undoEdit(back, forward)
assert.deepEqual(cells, {a: 1}, 'undo drops the key that had nothing before')
undoEdit(forward, back)
assert.deepEqual(cells, {a: 1, b: 2}, 'and redo puts it back exactly as it was')

undoEdit(back, forward)
undoEdit(back, forward)
assert.deepEqual(cells, {}, 'undo walks the whole stack')
undoEdit(forward, back)
undoEdit(forward, back)
assert.deepEqual(cells, {a: 1, b: 2}, 'redo walks all of it back')

// redoing with nothing undone is a no-op, not a throw
undoEdit(forward, back)
assert.deepEqual(cells, {a: 1, b: 2})

// a whole drag redoes as the one step it undid as
const dragBack = []
const dragFwd = []
const sw = {}
for(const c of ['#111111', '#222222', '#333333']){
  recordEdit(dragBack, sw, '#e4614a')
  sw['#e4614a'] = c
}
undoEdit(dragBack, dragFwd)
assert.deepEqual(sw, {})
undoEdit(dragFwd, dragBack)
assert.deepEqual(sw, {'#e4614a': '#333333'}, 'redo restores where the drag ended, not where it started')

// the old one-argument call still works — undo with nowhere to record just forgets
const solo = []
const only = {}
recordEdit(solo, only, 'x'); only.x = 9
undoEdit(solo)
assert.deepEqual(only, {})

// ---- a group of shapes is one step -------------------------------------------------
// a colour dropped on several selected shapes at once has to come back off them at once,
// and a drag over the group still folds into the single step it started
const group = []
const gEdits = {1: {fill: '#000000'}}
for(const c of ['#111111', '#222222']){
  recordEdit(group, gEdits, [0, 1, 2])
  for(const n of [0, 1, 2]) gEdits[n] = {fill: c}
}
assert.equal(group.length, 1, 'the drag over the group is one step')
undoEdit(group)
assert.deepEqual(gEdits, {1: {fill: '#000000'}}, 'one undo puts the whole group back')
assert.ok(!(0 in gEdits) && !(2 in gEdits), 'keys that had nothing before are deleted again')

// a different group is its own step, even while the first is still open
recordEdit(group, gEdits, [0, 1]); gEdits[0] = gEdits[1] = {fill: '#333333'}
recordEdit(group, gEdits, [0]); gEdits[0] = {fill: '#444444'}
assert.equal(group.length, 2)
undoEdit(group)
assert.deepEqual(gEdits[0], {fill: '#333333'})

// and a group redoes as one step too
const gFwd = []
undoEdit(group, gFwd)
assert.deepEqual(gEdits, {1: {fill: '#000000'}}, 'the group goes back to what each key held before it')
undoEdit(gFwd, group)
assert.deepEqual(gEdits, {0: {fill: '#333333'}, 1: {fill: '#333333'}})
