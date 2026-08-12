export const MAX_BYTES = 10 * 1024 * 1024
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

/* vtracer traces in one uninterruptible call, so the working size is a hard budget
   rather than a quality dial: a busy 1536 px image already costs seconds and megabytes
   of path data, and 2048 costs four times that. The list stops where the wait does. */
export const WORK_SIZES = [384, 512, 768, 1024, 1280, 1536]

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

export const ANALYZE_SIDE = 512

/* Clamps a number into a range.
   Takes the value, the lower bound and the upper bound; returns the clamped number. */
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi)

/* Turns a measured image into the settings it is likely to trace best with. This is a
   starting point shown as a guide, not something applied behind the user's back — the
   measurements it is based on are shown next to it.
   Takes the stats from analyzeImage plus the source image's pixel width and height;
   returns {preset, options, note} — the preset it picked, a full options patch with the
   colour precision, speckle filter and working size tuned to this image, and a
   t.vec.notes key explaining the choice. */
export function recommend(stats, width, height){
  const {tones, edgeRatio, flatRatio} = stats
  const flat = flatRatio >= 0.55

  let preset, note
  if(tones <= 4){
    preset = 'mono'
    note = 'twoTone'
  }else if(tones <= 24 && edgeRatio >= 0.15){
    preset = 'drawing'
    note = 'lineArt'
  }else if(flatRatio >= 0.85){
    preset = tones <= 64 ? 'logo' : 'clipart'
    note = 'hardEdges'
  }else if(flat){
    preset = 'clipart'
    note = 'flatFills'
  }else if(flatRatio >= 0.3){
    preset = 'auto'
    note = 'mixed'
  }else{
    preset = 'photo'
    note = 'shaded'
  }

  // raising colorPrecision merges regions in this build, so it buys file size, not
  // fidelity. Flat artwork has few regions and nothing to gain, so it stays at the
  // faithful end; only a busy image is worth simplifying, and then on a log scale
  // because the region count is what runs away.
  const colorPrecision = flat
    ? 1
    : clamp(Math.round(Math.log2(Math.max(tones, 2)) / 4), 1, MAX_COLOR_PRECISION)

  // never trace above the source resolution; the ceiling keeps a 10 MB photo from
  // proposing a trace that runs for seconds and emits megabytes of path data
  const native = Math.max(width, height)
  const wanted = edgeRatio >= 0.2 ? native * 1.5 : native
  const top = WORK_SIZES[WORK_SIZES.length - 1]
  const maxSide = Math.min(WORK_SIZES.find(s => s >= wanted) ?? top, top)

  return {
    preset,
    note,
    options: {
      ...PRESETS[preset],
      colorPrecision,
      filterSpeckle: edgeRatio >= 0.3 ? 8 : PRESETS[preset].filterSpeckle,
      maxSide
    }
  }
}

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
   returns a Promise of {svg, width, height, ms} — the traced markup, the working
   resolution it was traced at, and the trace time in milliseconds. */
export function trace(file, opts){
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, {resolve, reject})
    tracer().postMessage({id, kind: 'trace', file, maxSide: opts.maxSide, options: traceOptions(opts)})
  })
}

/* Measures an image so the panel can suggest settings for it, before any trace runs.
   Takes the source File;
   returns a Promise of the stats object described on analyzeImage. */
export function analyze(file){
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, {resolve, reject})
    tracer().postMessage({id, kind: 'analyze', file, maxSide: ANALYZE_SIDE})
  }).then(data => data.stats)
}
