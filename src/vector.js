export const MAX_BYTES = 10 * 1024 * 1024
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

/* vtracer traces in one uninterruptible call, so the working size is a hard budget
   rather than a quality dial: a busy 1536 px image already costs seconds and megabytes
   of path data, and 2048 costs four times that. The list stops where the wait does. */
export const WORK_SIZES = [384, 512, 768, 1024, 1280, 1536]

/* The refine pass traces at twice the working size and rebuilds the outlines from there,
   so the pixel staircase it is erasing is half the size of the anchors it keeps. Doubling
   costs roughly four times the trace.
   The ceiling is memory, not patience: measured on a busy photograph, 2048 traces in
   about five seconds but peaks around 600 MB between the pixels, the engine's own tables
   and seven megabytes of path data. Raising it squares that, and a worker that runs out
   dies without an error anyone can show. */
export const REFINE_SCALE = 2
export const REFINE_MAX_SIDE = 2048

/* The steps a refine pass reports, in order. The panel names them; nothing here reads
   them except the label lookup, but a phase the dictionary has no word for renders blank,
   so the list is the contract between the worker and the panel. */
export const PHASES = ['reading', 'quantize', 'trace', 'smooth', 'anchors', 'curves', 'assemble']

/* The palette size the image is reduced to before tracing. Two is the smallest that
   still carries a shape; past ~32 the palette stops being something anyone picks. */
export const MIN_COLORS = 2
export const MAX_COLORS = 32

/* Curve modes, in the order the panel offers them — straight segments first, because
   that is what the default trace uses and what most artwork wants. */
export const MODES = ['polygon', 'pixel', 'spline']
export const STACKING = ['stacked', 'cutout']

/* What the image is reduced to before it is traced. 'color' keeps the hues and quantizes
   to the palette; 'gray' drops the hues and quantizes to that many steps of grey; 'mono'
   goes all the way to black and white.
   Black and white is the one that can throw the drawing away, so it is not left to the
   engine: the pixels are cut here, at a level read off the picture, and the engine is
   handed something already black on white. */
export const TONES = ['color', 'gray', 'mono']

/* How far the black-and-white cut may be nudged off the level the picture suggests, in
   luma steps. Wide enough to pull a whole shadow to either side, short of the ends where
   everything collapses to one tone. */
export const MAX_THRESHOLD = 64

/* Measured, not read off vtracer's CLI docs, because this build does not match them:
   raising colorPrecision *merges* regions here rather than separating them. At 7 every
   image tested collapsed to a single path, and 6 already drops regions out of flat
   artwork (a four-colour logo goes from 13 shapes to 9). 8 aborts the wasm outright.
   5 is the highest value that still returns the artwork, so the panel stops there. */
export const MAX_COLOR_PRECISION = 5

/* Starting points for the six input kinds the panel offers. Every key matches a field
   of the reactive options object driving the panel; the engine ones keep vtracer's
   names so the mapping stays a plain pick.
   colorPrecision sits at the low end everywhere except photo: low is what keeps regions
   apart here, and only a busy photograph benefits from trading some away for file size. */
export const PRESETS = {
  auto:    {tone:'color', mode:'polygon', hierarchical:'stacked', filterSpeckle:4,  colorPrecision:2, layerDifference:16, cornerThreshold:60, lengthThreshold:4,   spliceThreshold:45, maxIterations:10, pathPrecision:2},
  clipart: {tone:'color', mode:'spline',  hierarchical:'stacked', filterSpeckle:8,  colorPrecision:2, layerDifference:24, cornerThreshold:60, lengthThreshold:4,   spliceThreshold:45, maxIterations:10, pathPrecision:2},
  photo:   {tone:'color', mode:'spline',  hierarchical:'stacked', filterSpeckle:2,  colorPrecision:4, layerDifference:8,  cornerThreshold:80, lengthThreshold:4,   spliceThreshold:45, maxIterations:10, pathPrecision:2},
  drawing: {tone:'color', mode:'spline',  hierarchical:'stacked', filterSpeckle:4,  colorPrecision:1, layerDifference:32, cornerThreshold:45, lengthThreshold:4,   spliceThreshold:30, maxIterations:10, pathPrecision:2},
  logo:    {tone:'color', mode:'polygon', hierarchical:'cutout',  filterSpeckle:16, colorPrecision:1, layerDifference:32, cornerThreshold:30, lengthThreshold:6,   spliceThreshold:20, maxIterations:8,  pathPrecision:3},
  mono:    {tone:'mono',  mode:'spline',  hierarchical:'stacked', filterSpeckle:8,  colorPrecision:1, layerDifference:64, cornerThreshold:45, lengthThreshold:4,   spliceThreshold:30, maxIterations:10, pathPrecision:2}
}

/* Clamps a number into a range.
   Takes the value, the lower bound and the upper bound; returns the clamped number. */
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi)

/* Rejects a file the tracer cannot handle, before any decoding work is spent on it.
   Takes a File (only `type` and `size` are read) and returns nothing;
   throws an Error whose message is an i18n key for errText. */
export function validateFile(file){
  if(!ACCEPTED_TYPES.includes(file.type)) throw new Error('badType')
  if(file.size > MAX_BYTES) throw new Error('tooBig')
  if(!file.size) throw new Error('emptyFile')
}

/* Picks the engine fields out of the panel state and pins every one of them into a
   range vtracer survives. A field it cannot parse aborts the wasm rather than
   returning an error, so this is the guard, not a formality.
   Takes the reactive options object shaped like a PRESETS entry;
   returns a plain config object for to_svg. */
export function traceOptions(o){
  return {
    // the pixels reach the engine already black on white, so its own cut has nothing left
    // to throw away — this only asks for the single-shape output that goes with them
    binary: o.tone === 'mono',
    mode: MODES.includes(o.mode) ? o.mode : 'polygon',
    hierarchical: STACKING.includes(o.hierarchical) ? o.hierarchical : 'stacked',
    filterSpeckle: clamp(Math.round(o.filterSpeckle), 0, 128),
    colorPrecision: clamp(Math.round(o.colorPrecision), 1, MAX_COLOR_PRECISION),
    layerDifference: clamp(Math.round(o.layerDifference), 0, 128),
    cornerThreshold: clamp(Math.round(o.cornerThreshold), 0, 180),
    lengthThreshold: clamp(o.lengthThreshold, 3.5, 10),
    spliceThreshold: clamp(Math.round(o.spliceThreshold), 0, 180),
    maxIterations: clamp(Math.round(o.maxIterations), 1, 20),
    pathPrecision: clamp(Math.round(o.pathPrecision), 0, 8)
  }
}

/* Paints a solid background behind the traced layers.
   Takes the SVG markup and a CSS color, or 'transparent' to leave it untouched;
   returns the SVG markup with a full-bleed rect inserted after the root tag. */
export function withBackground(svg, color){
  if(!color || color === 'transparent') return svg
  return svg.replace(/<svg[^>]*>/, m => `${m}<rect width="100%" height="100%" fill="${color}"/>`)
}

// vtracer emits flat, self-closing shapes with no nesting, which is why they can be
// rewritten by pattern rather than parsed
const SHAPE = /<path\b[^>]*?\/>/g

/* Sets a shape's fill, adding the attribute when the shape has none — binary traces
   emit shapes that inherit their colour instead of carrying one.
   Takes the shape's markup and a CSS colour; returns the rewritten markup. */
const paint = (shape, fill) => /\sfill="/.test(shape)
  ? shape.replace(/\sfill="[^"]*"/, ` fill="${fill}"`)
  : shape.replace('<path', `<path fill="${fill}"`)

/* Reads the colour of every shape in a trace, in order.
   Takes the traced SVG; returns an array of CSS colour strings. */
export function shapeFills(svg){
  return [...svg.matchAll(SHAPE)].map(m => (m[0].match(/\sfill="([^"]*)"/) || [, '#000000'])[1])
}

/* Repaints every shape drawn in one of the swapped colours, wherever it appears.
   A trace can carry hundreds of shapes in one palette entry, so this is the difference
   between recolouring a drawing and clicking through it. Shapes are matched by the colour
   they carry rather than by index, which is also what lets it run before the per-shape
   edits and leave those on top: a shape someone painted by hand stays as they painted it.
   Takes the traced SVG and a map of palette colour to replacement, both lower-case;
   returns the rewritten markup. */
export function swapFills(svg, swaps){
  if(!swaps || !Object.keys(swaps).length) return svg
  return svg.replace(SHAPE, shape => {
    // a shape with no fill of its own is black, the same way shapeFills reads it
    const fill = (shape.match(/\sfill="([^"]*)"/) || [, '#000000'])[1].toLowerCase()
    return swaps[fill] ? paint(shape, swaps[fill]) : shape
  })
}

/* Applies the per-shape edits to traced markup. Shapes are numbered by their position
   in the untouched trace, so deleting one never renumbers the ones after it and a
   selection stays pointing at the same shape.
   Takes the traced SVG, the edits keyed by shape index, whether to tag each shape with
   its index for the board, and a Set of the selected indices. The tags and the selection
   are board-only: the export must not carry them.
   Returns the rewritten markup. */
export function editPaths(svg, edits, tagged = false, selected = null){
  let i = -1
  return svg.replace(SHAPE, shape => {
    const n = ++i
    const edit = edits?.[n]
    if(edit?.removed) return ''
    let out = edit?.fill ? paint(shape, edit.fill) : shape
    if(tagged) out = out.replace('<path', `<path data-shape="${n}"${selected?.has(n) ? ' class="sel"' : ''}`)
    return out
  })
}

/* How far a shape may have moved, changed size or drifted in colour between two traces
   and still count as the same shape. The three distances are each a fraction of their own
   range, so this is a tenth of the canvas across, a tenth of it in size, or a tenth of the
   way across the colour cube. Loose enough for a re-trace at another resolution, which
   moves nothing but redraws everything; tight enough that an edit with nothing to land on
   is dropped rather than moved onto a stranger. */
const MATCH_MAX = 0.12

/* How far a palette entry may drift between two traces and still be the same colour.
   Re-quantizing the same image at another resolution moves a centroid by a few steps;
   switching tone moves it across the cube. */
const PALETTE_MAX = 0.1

/* Distance between two CSS hex colours, as a fraction of the colour cube's diagonal.
   Takes two '#rrggbb' strings; returns 0 for a pair that matches, 1 for black against
   white and for anything that is not a plain hex colour. */
function colorGap(a, b){
  if(a === b) return 0
  if(!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return 1
  const [x, y] = [a, b].map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)))
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) / 441.7
}

/* Where each shape sits, how big it is and what colour it carries, in fractions of the
   canvas so two traces of the same image at different resolutions can be compared.
   vtracer emits absolute M/L/C only — no arcs, no H/V — so every number in a `d` is half
   of an x,y pair and the centre can be averaged off them without parsing the grammar.
   Takes the traced SVG; returns one {x, y, r, fill} per shape, in index order. */
export function shapeMarks(svg){
  const [, w, h] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/) ?? [, 1, 1]
  return [...svg.matchAll(SHAPE)].map(([shape]) => {
    const fill = (shape.match(/\sfill="([^"]*)"/) || [, '#000000'])[1].toLowerCase()
    const nums = (shape.match(/\sd="([^"]*)"/)?.[1] ?? '').match(/-?\d*\.?\d+/g) ?? []
    let sx = 0, sy = 0, n = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for(let i = 0; i + 1 < nums.length; i += 2){
      const x = +nums[i] / w, y = +nums[i + 1] / h
      sx += x; sy += y; n++
      x0 = Math.min(x0, x); y0 = Math.min(y0, y)
      x1 = Math.max(x1, x); y1 = Math.max(y1, y)
    }
    return n ? {x: sx / n, y: sy / n, r: Math.hypot(x1 - x0, y1 - y0), fill}
             : {x: 0, y: 0, r: 0, fill}
  })
}

/* Carries the per-shape edits over to a fresh trace of the same image. The indices they
   are keyed by mean nothing across traces — another working size redraws every shape and
   renumbers all of them — so each edited shape is looked up again by where it sits, how
   big it is and what colour it was traced in, and takes the index of whatever answers.
   Each shape in the new trace can be claimed once, and an edit with nothing close enough
   is dropped: a delete landing on the wrong shape is worse than a delete that is lost.
   Takes the edits and the marks of the trace they were made on and of the new one;
   returns a fresh edits object keyed by the new indices. */
export function remapEdits(edits, from, to){
  const out = {}
  const taken = new Set()
  for(const [k, edit] of Object.entries(edits)){
    const a = from[k]
    if(!a) continue
    let best = -1, score = MATCH_MAX
    for(let i = 0; i < to.length; i++){
      if(taken.has(i)) continue
      const b = to[i]
      const s = Math.hypot(a.x - b.x, a.y - b.y) + Math.abs(a.r - b.r) + colorGap(a.fill, b.fill)
      if(s < score){ score = s; best = i }
    }
    if(best < 0) continue
    taken.add(best)
    out[best] = edit
  }
  return out
}

/* Carries the palette swaps over to a fresh trace. They are keyed by the colour the trace
   produced, and re-quantizing the same image at another resolution nudges every centroid,
   so each key is pulled onto the nearest entry of the new palette. A key with nothing near
   it — what switching tone leaves behind — is dropped.
   Takes the swaps and the new palette; returns a fresh swaps object. */
export function remapSwaps(swaps, palette){
  const out = {}
  for(const [key, value] of Object.entries(swaps)){
    let best = null, gap = PALETTE_MAX
    for(const c of palette){
      const d = colorGap(key, c)
      if(d < gap){ gap = d; best = c.toLowerCase() }
    }
    if(best) out[best] = value
  }
  return out
}

/* Records what a reactive map held at one or more keys just before they change, so
   undoEdit can put them back — the recolour or delete itself still happens at the call
   site. A group of keys recorded together undoes together, which is what a colour
   dropped on several selected shapes at once has to do.
   A colour input fires all the way through a drag in the picker, hundreds of times for
   one colour someone picked once, so a record that lands on the same keys the open step
   is already holding folds into it: the whole drag undoes as one step. sealEdit ends it.
   Takes the history array, the map about to change, and a key or an array of keys;
   returns nothing. */
export function recordEdit(history, map, key){
  const keys = Array.isArray(key) ? key : [key]
  const top = history[history.length - 1]
  if(top?.open && top.map === map && top.keys.length === keys.length
     && top.keys.every((k, i) => k === keys[i])) return
  history.push({map, keys, prev: keys.map(k => map[k]), open: true})
}

/* Closes the step on top of the history, so the next record starts a new one rather than
   folding into it — what a colour input's change event marks, and what keeps a second
   drag on the same swatch from disappearing into the first.
   Takes the history array; returns nothing. */
export function sealEdit(history){
  const top = history[history.length - 1]
  if(top) top.open = false
}

/* Reverses the most recently recorded change: a key that had nothing before is deleted,
   otherwise it's put back to what it held. What the key held on the way out is recorded
   on the opposite stack, so undo and redo are the same move read in either direction —
   redo is this function called with the stacks swapped.
   Takes the stack to reverse a step from and optionally the stack to record it on;
   returns nothing. */
export function undoEdit(history, redo){
  const last = history.pop()
  if(!last) return
  const cur = last.keys.map(k => last.map[k])
  last.keys.forEach((k, i) => {
    if(last.prev[i] === undefined) delete last.map[k]
    else last.map[k] = last.prev[i]
  })
  redo?.push({map: last.map, keys: last.keys, prev: cur})
}

/* Formats a byte count for display.
   Takes a number of bytes and returns a short human-readable string. */
export function formatBytes(n){
  if(n < 1024) return `${n} B`
  if(n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/* Counts the shapes in traced SVG markup.
   Takes the SVG markup and returns the number of <path> elements. */
export function countPaths(svg){
  return (svg.match(/<path/g) || []).length
}

/* Counts the distinct fills in traced SVG markup. vtracer emits flat paths rather than
   one group per colour, so this is what stands in for a layer count.
   Takes the SVG markup and returns the number of distinct fill colors. */
export function countColors(svg){
  return new Set([...svg.matchAll(/fill="([^"]+)"/g)].map(m => m[1].toLowerCase())).size
}

let worker
let nextId = 0
const pending = new Map()

/* Boots the tracing worker on first use and routes its replies back to the callers.
   Takes nothing and returns the shared Worker instance. */
function tracer(){
  if(worker) return worker
  worker = new Worker(new URL('./trace.worker.js', import.meta.url), {type: 'module'})
  worker.onmessage = ({data}) => {
    const job = pending.get(data.id)
    if(!job) return
    // a phase is a progress report, not an answer: the job stays open
    if(data.phase){ job.onPhase?.(data.phase); return }
    pending.delete(data.id)
    data.error ? job.reject(new Error(data.error)) : job.resolve(data)
  }
  return worker
}

/* Hands one job to the worker and keeps its callbacks until it answers.
   Takes the message minus its id, the working resolution, the panel options and an
   optional phase callback; returns a Promise of the worker's reply. */
function send(file, maxSide, opts, extra, onPhase){
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, {resolve, reject, onPhase})
    tracer().postMessage({
      id, file, maxSide,
      colors: clamp(Math.round(opts.colors), MIN_COLORS, MAX_COLORS),
      tone: TONES.includes(opts.tone) ? opts.tone : 'color',
      threshold: clamp(Math.round(opts.threshold || 0), -MAX_THRESHOLD, MAX_THRESHOLD),
      options: traceOptions(opts),
      ...extra
    })
  })
}

/* Traces one raster image into SVG off the main thread, so the panel stays responsive
   while the trace runs.
   Takes the source File and the panel options object;
   returns a Promise of {svg, palette, width, height, ms} — the traced markup, the
   palette it was reduced to, the working resolution, and the trace time in ms. */
export function trace(file, opts){
  return send(file, opts.maxSide, opts, null, null)
}

/* Traces the same image the slow way: a re-centred palette, twice the resolution, and
   the outlines rebuilt afterwards. Minutes rather than seconds, so it is a button rather
   than something an option change sets off.
   Takes the source File, the panel options object and a callback called with each phase
   name as it starts; returns the same shape trace does, plus refined: true. */
export function refine(file, opts, onPhase){
  const side = Math.min(opts.maxSide * REFINE_SCALE, REFINE_MAX_SIDE)
  return send(file, side, opts, {refine: true}, onPhase)
}
