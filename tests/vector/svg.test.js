// Post-processing of the traced markup: background and stats.
import assert from 'node:assert/strict'
import { withBackground, countPaths, countColors, formatBytes } from '../../src/vector.js'
import { finishSvg } from '../../src/trace-core.js'

// vtracer's shape: an XML prolog, a generator comment, a root tag with no viewBox,
// then flat paths — no one group per colour to hang anything off
const engineOut = '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<!-- Generator: visioncortex VTracer 0.1.0 -->\n'
  + '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="8" height="8">\n'
  + '<path d="M0 0" fill="#FFFFFF"/><path d="M1 1" fill="#e4614a"/>\n'
  + '</svg>\n'

// finishSvg drops the prolog, which is invalid inside an HTML document, and adds the
// viewBox the engine leaves out — without it the markup cannot scale to the board
const traced = finishSvg(engineOut, 8, 8)
assert.ok(traced.startsWith('<svg '))
assert.ok(traced.includes('viewBox="0 0 8 8"'))
assert.ok(!traced.includes('<?xml'))

// a background lands inside the root tag, before the first shape
const filled = withBackground(traced, '#ff0000')
assert.ok(filled.indexOf('<rect width="100%" height="100%" fill="#ff0000"/>') < filled.indexOf('<path'))
assert.ok(filled.startsWith('<svg '))

// the rect anchors on the root tag, not on the first '>' in the document: given the raw
// engine output it must not land inside the prolog
const rawFilled = withBackground(engineOut, '#ff0000')
assert.ok(rawFilled.indexOf('<rect') > rawFilled.indexOf('<svg '))

// transparent and missing colors leave the markup alone
assert.equal(withBackground(traced, 'transparent'), traced)
assert.equal(withBackground(traced, ''), traced)

// shapes are counted across the whole document, colors case-insensitively
assert.equal(countPaths(filled), 2)
assert.equal(countColors(traced), 2)
assert.equal(countColors('<path fill="#ABCDEF"/><path fill="#abcdef"/>'), 1)

// markup without a root tag is a failed trace, not something to hand to the page
assert.throws(() => finishSvg('not svg at all', 8, 8), /traceFail/)

// byte counts read as bytes, kilobytes then megabytes
assert.equal(formatBytes(512), '512 B')
assert.equal(formatBytes(2048), '2 KB')
assert.equal(formatBytes(10 * 1024 * 1024), '10.0 MB')
