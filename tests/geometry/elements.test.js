// elementToD: each tag to its own converter, everything else is dropped.
import assert from 'node:assert/strict'
import { elementToD } from '../../src/scribble.js'
import { el } from '../helpers.js'

const tag = (name, attrs = {}) => el(attrs, name)

assert.equal(elementToD(tag('path', {d:'M1,2'})), 'M1,2')
assert.equal(elementToD(tag('PATH', {d:'M1,2'})), 'M1,2')   // the DOM returns an uppercase tagName in HTML
assert.equal(elementToD(tag('path')), null)                 // a path with no d yields nothing
assert.equal(elementToD(tag('rect', {width:4, height:2})), 'M0,0 H4 V2 H0 Z')
assert.equal(elementToD(tag('circle', {cx:5, cy:5, r:3})), 'M2,5 A3,3 0 0 1 8,5 A3,3 0 0 1 2,5 Z')
assert.equal(elementToD(tag('circle', {cx:5, cy:5, r:0})), null)
assert.equal(elementToD(tag('ellipse', {rx:4, ry:2})), 'M-4,0 A4,2 0 0 1 4,0 A4,2 0 0 1 -4,0 Z')
assert.equal(elementToD(tag('line', {x1:1, y1:2, x2:3, y2:4})), 'M1,2 L3,4')
assert.equal(elementToD(tag('polyline', {points:'0,0 1,1'})), 'M0,0 L1,1')
assert.equal(elementToD(tag('polygon', {points:'0,0 1,1 2,0'})), 'M0,0 L1,1 L2,0 Z')
assert.equal(elementToD(tag('text')), null)                 // a tag with no outline is ignored

// ponytail: line is the only one that keeps the degenerate case — it becomes a dot and rough scribbles over it
assert.equal(elementToD(tag('line')), 'M0,0 L0,0')
