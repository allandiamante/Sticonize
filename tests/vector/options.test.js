// Panel state to tracer options — pure mapping, no DOM and no framework.
import assert from 'node:assert/strict'
import { traceOptions, PRESETS } from '../../src/vector.js'

const opts = traceOptions({...PRESETS.auto, maxSide: 1024, background: '#fff'})

// every UI field lands on the option name imagetracer reads
assert.equal(opts.numberofcolors, PRESETS.auto.colors)
assert.equal(opts.colorquantcycles, PRESETS.auto.cycles)
assert.equal(opts.pathomit, PRESETS.auto.despeckle)
assert.equal(opts.ltres, PRESETS.auto.lineThreshold)
assert.equal(opts.qtres, PRESETS.auto.curveThreshold)
assert.equal(opts.blurradius, PRESETS.auto.blur)
assert.equal(opts.rightangleenhance, PRESETS.auto.sharpCorners)
assert.equal(opts.linefilter, PRESETS.auto.dropTinyPaths)
assert.equal(opts.roundcoords, PRESETS.auto.precision)
assert.equal(opts.strokewidth, PRESETS.auto.strokeWidth)

// coordinates come out in source pixels, and panel-only fields never leak through
assert.equal(opts.scale, 1)
assert.equal(opts.maxSide, undefined)
assert.equal(opts.background, undefined)

// every preset covers the same fields, so switching one never leaves a stale value behind
const keys = Object.keys(PRESETS.auto).sort().join()
for(const [name, preset] of Object.entries(PRESETS))
  assert.equal(Object.keys(preset).sort().join(), keys, `preset ${name} has different fields`)
