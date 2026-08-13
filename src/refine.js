/* The refine pass, run on the traced markup after the engine is done with it.
   The live trace has to answer while a slider is still moving, so it stops at whatever
   the engine hands back: outlines that follow the pixel staircase, an anchor every few
   pixels, and a visible kink wherever two of the engine's curve pieces meet. Refining
   spends the time the preview cannot: it flattens each outline back to points, throws
   away the anchors that were only describing the staircase, relaxes what is left, and
   fits fresh Béziers through it.
   ponytail: the fit is Catmull-Rom through the kept anchors, not a least-squares fit
   (Schneider) of the original curve — it interpolates rather than approximates, which is
   what keeps corners on the pixel they were traced at. A least-squares fit would use
   fewer anchors for the same error; swap it in if file size ever matters more than that. */

// vtracer emits flat, self-closing paths, each hanging off a translate, and writes only
// absolute M/L/C/Z — which is why these can be read by pattern rather than parsed
const SHAPE = /<path\b[^>]*\/>/g
const D = /\sd="([^"]*)"/
const FILL = /\sfill="([^"]*)"/
const MOVE = /translate\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/
const SIMPLE_D = /^[MLCZ\s\d.,+-]*$/
const NUM = /[-+]?\d*\.?\d+/g

/* How far a kept anchor may sit from the outline it replaces, in traced pixels. The
   refine pass traces at twice the working size, so two pixels here is one pixel of the
   source: under what anyone can see, over the raster noise it is there to drop.
   Measured against a traced disc, this is also where the trade turns: below 2 the anchor
   count climbs with nothing to show for it, and above 4 the outline starts rounding off
   detail it should have kept. */
const TOLERANCE = 2

/* Relaxation passes over the kept anchors. Each pass is a Taubin pair (a smoothing step
   followed by a slightly larger unshrinking one), so the outline settles without
   creeping inward — plain averaging would pull every shape off its neighbours and open
   seams between the layers. */
const SMOOTHING = 3

/* Reads the shapes out of traced markup.
   Takes the SVG; returns [{fill, dx, dy, d}] in paint order. */
function readShapes(svg){
  return [...svg.matchAll(SHAPE)].map(tag => {
    const t = MOVE.exec(tag[0])
    return {
      markup: tag[0],
      fill: (FILL.exec(tag[0]) || [, '#000000'])[1],
      dx: t ? +t[1] : 0,
      dy: t ? +t[2] : 0,
      d: (D.exec(tag[0]) || [, ''])[1]
    }
  })
}

/* Samples one cubic into the running point list, densely enough that the resimplify
   below decides the anchor spacing rather than this does.
   Takes the output array, the start point and the three remaining cubic points;
   returns nothing, appending every sample after the start. */
function cubic(out, x0, y0, x1, y1, x2, y2, x3, y3){
  const net = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2)
  const steps = Math.min(Math.max(Math.ceil(net / 2), 1), 32)
  for(let i = 1; i <= steps; i++){
    const t = i / steps, u = 1 - t
    out.push({
      x: u*u*u*x0 + 3*u*u*t*x1 + 3*u*t*t*x2 + t*t*t*x3,
      y: u*u*u*y0 + 3*u*u*t*y1 + 3*u*t*t*y2 + t*t*t*y3
    })
  }
}

/* Flattens one shape's outlines into closed point loops, with its translate baked in so
   every shape ends up in the same coordinate space.
   Takes a shape from readShapes; returns an array of point arrays, or null when the
   path uses anything beyond absolute M/L/C/Z — an unreadable path is passed through
   untouched rather than guessed at. */
function flatten({d, dx, dy}){
  if(!d || !SIMPLE_D.test(d)) return null
  const loops = []
  let loop = null, x = 0, y = 0
  for(const [, cmd, args] of d.matchAll(/([MLCZ])([^MLCZ]*)/g)){
    const n = (args.match(NUM) || []).map(Number)
    if(cmd === 'Z') continue                       // every loop is closed implicitly
    if(cmd === 'M'){
      if(loop?.length > 2) loops.push(loop)
      loop = []
      x = n[0] + dx; y = n[1] + dy
      loop.push({x, y})
      // a moveto carrying extra pairs is an implicit lineto run
      for(let i = 2; i + 1 < n.length; i += 2){ x = n[i] + dx; y = n[i+1] + dy; loop.push({x, y}) }
    }else if(cmd === 'L'){
      for(let i = 0; i + 1 < n.length; i += 2){ x = n[i] + dx; y = n[i+1] + dy; loop.push({x, y}) }
    }else{
      for(let i = 0; i + 5 < n.length; i += 6){
        cubic(loop, x, y, n[i] + dx, n[i+1] + dy, n[i+2] + dx, n[i+3] + dy, n[i+4] + dx, n[i+5] + dy)
        x = n[i+4] + dx; y = n[i+5] + dy
      }
    }
  }
  if(loop?.length > 2) loops.push(loop)
  return loops
}

/* Flags the points sharp enough to be corners, so relaxing and simplifying can leave
   them alone. Reuses the panel's corner angle: the same number that decides what the
   engine keeps sharp decides what survives here. The flag rides on the point rather than
   in a parallel mask, because the point is what the later steps keep or drop.
   Takes a closed point loop and the corner angle in degrees; returns nothing. */
function mark(pts, degrees){
  // the turn is measured against straight-on, so a turn past the threshold is a dot
  // product below its cosine
  const limit = Math.cos(degrees * Math.PI / 180)
  const n = pts.length
  for(let i = 0; i < n; i++){
    const p = pts[(i + n - 1) % n], c = pts[i], q = pts[(i + 1) % n]
    const ax = c.x - p.x, ay = c.y - p.y, bx = q.x - c.x, by = q.y - c.y
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by)
    if(!la || !lb || (ax * bx + ay * by) / (la * lb) <= limit) c.corner = 1
  }
}

/* Relaxes the outline between its corners.
   Runs on the dense sampling, not on the anchors kept later: measured against a traced
   disc, relaxing the kept anchors instead pulls the outline off the shape by more than
   the trace was off to begin with — they sit unevenly along the curve, so averaging a
   neighbour drags each one sideways as much as inward. On the dense loop the spacing is
   even, and the averaging only takes off what the raster put there.
   Takes a closed point loop and the number of passes;
   returns the moved points, leaving corners exactly where they were. */
function relax(pts, passes){
  const n = pts.length
  if(n < 4) return pts
  let cur = pts
  for(let pass = 0; pass < passes * 2; pass++){
    const w = pass % 2 ? -0.53 : 0.5           // Taubin: shrink, then push back out
    const next = new Array(n)
    for(let i = 0; i < n; i++){
      if(cur[i].corner){ next[i] = cur[i]; continue }
      const p = cur[(i + n - 1) % n], q = cur[(i + 1) % n]
      next[i] = {
        x: cur[i].x + w * ((p.x + q.x) / 2 - cur[i].x),
        y: cur[i].y + w * ((p.y + q.y) / 2 - cur[i].y)
      }
    }
    cur = next
  }
  return cur
}

/* Thins one open run of points down to the ones it actually turns on
   (Ramer–Douglas–Peucker), keeping both ends.
   Takes the run and the allowed deviation in pixels; returns the kept points. */
function thin(run, tolerance){
  if(run.length < 3) return run
  const keep = new Uint8Array(run.length)
  keep[0] = keep[run.length - 1] = 1
  const stack = [[0, run.length - 1]]
  while(stack.length){
    const [a, b] = stack.pop()
    if(b - a < 2) continue
    const ax = run[a].x, ay = run[a].y
    const vx = run[b].x - ax, vy = run[b].y - ay
    const len = Math.hypot(vx, vy)
    let far = -1, worst = tolerance
    for(let i = a + 1; i < b; i++){
      const px = run[i].x - ax, py = run[i].y - ay
      const off = len ? Math.abs(px * vy - py * vx) / len : Math.hypot(px, py)
      if(off > worst){ worst = off; far = i }
    }
    if(far < 0) continue
    keep[far] = 1
    stack.push([a, far], [far, b])
  }
  return run.filter((_, i) => keep[i])
}

/* Picks the anchors to keep out of a relaxed loop.
   The loop is cut at its corners and each run thinned on its own, which is what keeps a
   corner from being averaged away as just another deviation. A loop with no corner at
   all is cut at its first point instead: that pins one arbitrary anchor, costing a single
   node and keeping the closure exact.
   Takes a closed point loop and the allowed deviation; returns the kept points. */
function anchors(pts, tolerance){
  const n = pts.length
  if(n < 4) return pts
  const cuts = []
  for(let i = 0; i < n; i++) if(pts[i].corner) cuts.push(i)
  if(!cuts.length) cuts.push(0)

  const out = []
  for(let c = 0; c < cuts.length; c++){
    const from = cuts[c], to = cuts[(c + 1) % cuts.length]
    // one cut means the run wraps the whole loop and closes on itself
    const steps = (to - from + n) % n || n
    const run = []
    for(let k = 0; k <= steps; k++) run.push(pts[(from + k) % n])
    // the run ends on the next run's first point, which only one of them may keep
    out.push(...thin(run, tolerance).slice(0, -1))
  }
  return out
}

/* Shortens a control handle so it cannot reach past its own segment, which is what turns
   a tight anchor spacing into a loop or a bulge.
   Takes the handle vector and the longest it may be; returns the capped [x, y]. */
function cap(vx, vy, limit){
  const len = Math.hypot(vx, vy)
  const k = len > limit ? limit / len : 1
  return [vx * k, vy * k]
}

/* Fits cubic Béziers through the anchors and writes them out.
   Every anchor gets a tangent along the chord between its neighbours; a corner gets none,
   so the curve arrives and leaves it straight and the corner stays a corner. A segment
   with no tangent at either end is written as a line rather than a curve that pretends
   to be one.
   Takes a closed point loop and the decimal places to keep;
   returns the `d` string for that loop, closed. */
function curve(pts, precision){
  const n = pts.length
  const r = v => +v.toFixed(precision)
  const tangents = pts.map((p, i) => p.corner ? {x: 0, y: 0} : {
    x: (pts[(i + 1) % n].x - pts[(i + n - 1) % n].x) / 2,
    y: (pts[(i + 1) % n].y - pts[(i + n - 1) % n].y) / 2
  })

  let d = `M${r(pts[0].x)} ${r(pts[0].y)}`
  for(let i = 0; i < n; i++){
    const a = pts[i], b = pts[(i + 1) % n], ta = tangents[i], tb = tangents[(i + 1) % n]
    if(!ta.x && !ta.y && !tb.x && !tb.y){
      // the last segment of a straight run is what Z already draws
      if(i < n - 1) d += `L${r(b.x)} ${r(b.y)}`
      continue
    }
    const limit = Math.hypot(b.x - a.x, b.y - a.y) * 0.4
    const [c1x, c1y] = cap(ta.x / 3, ta.y / 3, limit)
    const [c2x, c2y] = cap(tb.x / 3, tb.y / 3, limit)
    d += `C${r(a.x + c1x)} ${r(a.y + c1y)} ${r(b.x - c2x)} ${r(b.y - c2y)} ${r(b.x)} ${r(b.y)}`
  }
  return d + 'Z'
}

/* The area a loop encloses, used only to tell a real region from a sliver.
   Takes a closed point loop; returns the signed area. */
function area(pts){
  let sum = 0
  for(let i = 0, n = pts.length; i < n; i++){
    const a = pts[i], b = pts[(i + 1) % n]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/* Assembles the finished shapes back into one drawing.
   Neighbouring shapes that ended up the same colour are welded into a single path, which
   is where most of the shape count goes. Only neighbours: the layers are painted in
   order and each one covers what is under it, so pulling a shape out of its run would
   move it in front of something it was behind.
   Takes the shapes and the SVG's opening tag; returns the complete markup. */
function assemble(shapes, head){
  const out = []
  for(const s of shapes){
    const last = out[out.length - 1]
    if(s.markup) out.push(s)                                       // passed through, ends the run
    else if(last && !last.markup && last.fill === s.fill) last.d += s.d
    else out.push({...s})
  }
  const body = out
    .map(s => s.markup ?? `<path d="${s.d}" fill="${s.fill}"/>`)
    .join('\n')
  return `${head}\n${body}\n</svg>\n<!-- Vectorized with Sticonize -->`
}

/* Runs the whole refine pass over traced markup.
   Takes the traced SVG (already snapped to its palette, so shapes that share a colour can
   be welded), {corner, precision, tolerance, smoothing}, and a callback awaited before
   each phase so the caller can report progress and let the thread breathe.
   Returns a Promise of the refined markup. */
export async function refineSvg(svg, {corner = 60, precision = 2, tolerance = TOLERANCE, smoothing = SMOOTHING} = {}, onPhase = async () => {}){
  const head = svg.slice(0, svg.indexOf('>') + 1)

  await onPhase('smooth')
  // flattening and relaxing happen shape by shape: the dense sampling of a whole drawing
  // at once is far larger than the drawing itself, and this way each one is collectable
  // as soon as its own outline has settled
  const shapes = readShapes(svg).map(s => {
    const loops = flatten(s)
    if(!loops) return {markup: s.markup}
    return {
      fill: s.fill,
      loops: loops.map(pts => {
        mark(pts, corner)
        return relax(pts, smoothing)
      })
    }
  })

  await onPhase('anchors')
  for(const s of shapes){
    if(s.markup) continue
    s.loops = s.loops
      .map(pts => anchors(pts, tolerance))
      // a loop with no area left is not a shape, whatever the engine thought it traced
      .filter(pts => pts.length >= 3 && Math.abs(area(pts)) >= 1)
  }

  await onPhase('curves')
  for(const s of shapes){
    if(s.markup) continue
    s.d = s.loops.map(pts => curve(pts, precision)).join('')
    s.loops = null
  }

  await onPhase('assemble')
  const out = assemble(shapes.filter(s => s.markup || s.d), head)
  if(!out.includes('<path')) throw new Error('emptyTrace')
  return out
}
