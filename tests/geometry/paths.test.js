// Shape-to-path conversion — pure geometry, no DOM and no framework.
import assert from 'node:assert/strict'
import { rectToPath, ellipseToPath, pointsToPath } from '../../src/scribble.js'
import { el } from '../helpers.js'

// a rect with no rounded corners becomes a closed polygon
assert.equal(rectToPath(el({x:2, y:3, width:10, height:4})), 'M2,3 H12 V7 H2 Z')

// a degenerate rect produces no path
assert.equal(rectToPath(el({width:0, height:5})), null)

// rx alone fills in ry (and vice versa), and the radius saturates at half the side
assert.equal(rectToPath(el({width:10, height:10, rx:3})), rectToPath(el({width:10, height:10, ry:3})))
assert.ok(rectToPath(el({width:10, height:10, rx:99})).startsWith('M5,0'))

// degenerate circles/ellipses are discarded
assert.equal(ellipseToPath(0, 0, 0, 5), null)
assert.ok(ellipseToPath(10, 10, 4, 2).endsWith('Z'))

// points: odd leftover coords are ignored, close controls the Z
assert.equal(pointsToPath(el({points:'0,0 4,0 4,4 9'}), true), 'M0,0 L4,0 L4,4 Z')
assert.equal(pointsToPath(el({points:'0 0 4 0'}), false), 'M0,0 L4,0')
assert.equal(pointsToPath(el({points:'1,2'}), true), null)
assert.equal(pointsToPath(el({}), true), null)
