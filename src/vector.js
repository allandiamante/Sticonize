export const MAX_BYTES = 10 * 1024 * 1024
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

/* vtracer traces in one uninterruptible call, so the working size is a hard budget
   rather than a quality dial: a busy 1536 px image already costs seconds and megabytes
   of path data, and 2048 costs four times that. The list stops where the wait does. */
export const WORK_SIZES = [384, 512, 768, 1024, 1280, 1536]

/* The palette size the image is reduced to before tracing. Two is the smallest that
   still carries a shape; past ~32 the palette stops being something anyone picks. */
export const MIN_COLORS = 2
export const MAX_COLORS = 32

export const MODES = ['spline', 'polygon', 'pixel']
export const STACKING = ['stacked', 'cutout']

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
  auto:    {binary:false, mode:'spline',  hierarchical:'stacked', filterSpeckle:4,  colorPrecision:2, layerDifference:16, cornerThreshold:60, lengthThreshold:4,   spliceThreshold:45, maxIterations:10, pathPrecision:2},
  clipart: {binary:false, mode:'spline',  hierarchical:'stacked', filterSpeckle:8,  colorPrecision:2, layerDifference:24, cornerThreshold:60, lengthThreshold:4,   spliceThreshold:45, maxIterations:10, pathPrecision:2},
  photo:   {binary:false, mode:'spline',  hierarchical:'stacked', filterSpeckle:2,  colorPrecision:4, layerDifference:8,  cornerThreshold:80, lengthThreshold:4,   spliceThreshold:45, maxIterations:10, pathPrecision:2},
  drawing: {binary:false, mode:'spline',  hierarchical:'stacked', filterSpeckle:4,  colorPrecision:1, layerDifference:32, cornerThreshold:45, lengthThreshold:4,   spliceThreshold:30, maxIterations:10, pathPrecision:2},
  logo:    {binary:false, mode:'polygon', hierarchical:'cutout',  filterSpeckle:16, colorPrecision:1, layerDifference:32, cornerThreshold:30, lengthThreshold:6,   spliceThreshold:20, maxIterations:8,  pathPrecision:3},
  mono:    {binary:true,  mode:'spline',  hierarchical:'stacked', filterSpeckle:8,  colorPrecision:1, layerDifference:64, cornerThreshold:45, lengthThreshold:4,   spliceThreshold:30, maxIterations:10, pathPrecision:2}
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
    binary: !!o.binary,
    mode: MODES.includes(o.mode) ? o.mode : 'spline',
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

/* Applies the per-shape edits to traced markup. Shapes are numbered by their position
   in the untouched trace, so deleting one never renumbers the ones after it and a
   selection stays pointing at the same shape.
   Takes the traced SVG, the edits keyed by shape index, whether to tag each shape with
   its index for the board, and which index is selected. The tags and the selection are
   board-only: the export must not carry them.
   Returns the rewritten markup. */
export function editPaths(svg, edits, tagged = false, selected = null){
  let i = -1
  return svg.replace(SHAPE, shape => {
    const n = ++i
    const edit = edits?.[n]
    if(edit?.removed) return ''
    let out = edit?.fill ? paint(shape, edit.fill) : shape
    if(tagged) out = out.replace('<path', `<path data-shape="${n}"${n === selected ? ' class="sel"' : ''}`)
    return out
  })
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
    pending.delete(data.id)
    data.error ? job.reject(new Error(data.error)) : job.resolve(data)
  }
  return worker
}

/* Traces one raster image into SVG off the main thread, so the panel stays responsive
   while the trace runs.
   Takes the source File and the panel options object;
   returns a Promise of {svg, palette, width, height, ms} — the traced markup, the
   palette it was reduced to, the working resolution, and the trace time in ms. */
export function trace(file, opts){
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, {resolve, reject})
    tracer().postMessage({
      id, file,
      maxSide: opts.maxSide,
      colors: clamp(Math.round(opts.colors), MIN_COLORS, MAX_COLORS),
      options: traceOptions(opts)
    })
  })
}
