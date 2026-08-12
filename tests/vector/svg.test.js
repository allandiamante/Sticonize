// Post-processing of the traced markup: background and stats.
import assert from 'node:assert/strict'
import { withBackground, countPaths, formatBytes } from '../../src/vector.js'

const traced = '<svg viewBox="0 0 8 8" version="1.1" xmlns="http://www.w3.org/2000/svg">'
  + '<g id="layer-01" data-color="#000000" fill="rgb(0,0,0)"><path d="M0 0"/><path d="M1 1"/></g>'
  + '</svg>'

// a background lands inside the root tag, before the first layer
const filled = withBackground(traced, '#ff0000')
assert.ok(filled.indexOf('<rect width="100%" height="100%" fill="#ff0000"/>') < filled.indexOf('<g '))
assert.ok(filled.startsWith('<svg '))

// transparent and missing colors leave the markup alone
assert.equal(withBackground(traced, 'transparent'), traced)
assert.equal(withBackground(traced, ''), traced)

// paths are counted across every layer
assert.equal(countPaths(filled), 2)

// byte counts read as bytes, kilobytes then megabytes
assert.equal(formatBytes(512), '512 B')
assert.equal(formatBytes(2048), '2 KB')
assert.equal(formatBytes(10 * 1024 * 1024), '10.0 MB')
