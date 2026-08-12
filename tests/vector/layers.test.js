// Layered output: one <g> per visible palette color, paint hoisted onto the group.
import assert from 'node:assert/strict'
import { layeredSvg } from '../../src/trace-core.js'
import { traceOptions, countPaths, PRESETS } from '../../src/vector.js'

/* Builds a three-band image: white, red and blue stripes stacked top to bottom.
   Takes the canvas side in pixels and the alpha to give the top band;
   returns an ImageData-shaped object the tracer accepts. */
function bands(side, topAlpha = 255){
  const data = new Uint8ClampedArray(side * side * 4)
  for(let y = 0; y < side; y++){
    const band = Math.floor(y / (side / 3))
    for(let x = 0; x < side; x++){
      const i = (y * side + x) * 4
      const rgb = [[255, 255, 255], [228, 97, 74], [46, 74, 134]][band]
      data[i] = rgb[0]; data[i+1] = rgb[1]; data[i+2] = rgb[2]
      data[i+3] = band === 0 ? topAlpha : 255
    }
  }
  return {width: side, height: side, data}
}

// minRatio stays 0 here: above it, the quantizer re-seeds thin clusters with random
// colors between cycles, which is deliberate but not reproducible.
const opts = traceOptions({...PRESETS.clipart, colors: 3, minRatio: 0})
const {svg, layers} = layeredSvg(bands(96), opts)

// three flat colors in, three groups out
assert.equal(layers, 3)
assert.equal((svg.match(/<g /g) || []).length, 3)

// groups are numbered in stacking order and carry the color as a hex data attribute
assert.match(svg, /<g id="layer-01" data-color="#[0-9a-f]{6}"/)
assert.match(svg, /<g id="layer-03" data-color="#[0-9a-f]{6}"/)
assert.match(svg, /data-color="#e4614a"/)
assert.match(svg, /data-color="#2e4a86"/)

// paint lives on the group, so the paths inside hold geometry only
assert.match(svg, /<g [^>]*fill="rgb\(228,97,74\)" stroke="rgb\(228,97,74\)"/)
for(const path of svg.match(/<path[^>]*>/g))
  assert.equal(path.includes('fill='), false, `paint leaked onto a path: ${path}`)
assert.ok(countPaths(svg) >= 3)

// the root scales and the credit survives
assert.ok(svg.startsWith('<svg viewBox="0 0 96 96"'))
assert.ok(svg.endsWith('<!-- Vectorized with Sticonize Vector -->'))

// a fully transparent band is dropped instead of emitting invisible paths
const clear = layeredSvg(bands(96, 0), opts)
assert.equal(clear.layers, 2)
assert.equal(clear.svg.includes('opacity="0"'), false)

// progress is reported once per palette entry and ends at the total
const seen = []
layeredSvg(bands(96), opts, (done, total) => seen.push([done, total]))
assert.equal(seen.length, seen[0][1])
assert.deepEqual(seen.at(-1), [seen[0][1], seen[0][1]])
