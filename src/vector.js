export const MAX_BYTES = 10 * 1024 * 1024
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const WORK_SIZES = [512, 768, 1024, 1536, 2048, 3072]

// index into t.vec.samplings — the labels live in i18n.js like every other visible string
export const SAMPLING = [0, 1, 2]

/* Starting points for the six input kinds the panel offers. They favour fidelity over
   speed: low thresholds keep small segments, low despeckle keeps small shapes, and the
   colour counts are high enough that shading survives quantization.
   Every key matches a field of the reactive options object driving the panel. */
export const PRESETS = {
  auto:    {colors:24, cycles:4, sampling:2, minRatio:0,     lineThreshold:0.1,  curveThreshold:0.1,  despeckle:1, blur:0, sharpCorners:true,  dropTinyPaths:false, precision:1, strokeWidth:1},
  clipart: {colors:12, cycles:5, sampling:2, minRatio:0.002, lineThreshold:0.1,  curveThreshold:0.1,  despeckle:2, blur:0, sharpCorners:true,  dropTinyPaths:false, precision:1, strokeWidth:1},
  photo:   {colors:64, cycles:5, sampling:2, minRatio:0,     lineThreshold:0.05, curveThreshold:0.05, despeckle:0, blur:0, sharpCorners:false, dropTinyPaths:false, precision:1, strokeWidth:1},
  drawing: {colors:8,  cycles:3, sampling:2, minRatio:0,     lineThreshold:0.05, curveThreshold:0.05, despeckle:1, blur:0, sharpCorners:true,  dropTinyPaths:false, precision:1, strokeWidth:1},
  logo:    {colors:8,  cycles:6, sampling:0, minRatio:0.005, lineThreshold:0.02, curveThreshold:0.02, despeckle:3, blur:0, sharpCorners:true,  dropTinyPaths:false, precision:2, strokeWidth:0},
  mono:    {colors:2,  cycles:1, sampling:0, minRatio:0,     lineThreshold:0.05, curveThreshold:0.05, despeckle:1, blur:0, sharpCorners:true,  dropTinyPaths:false, precision:2, strokeWidth:0}
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
   colour count, despeckle and working size tuned to this image, and a t.vec.notes key
   explaining the choice. */
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

  // anti-aliased edges inflate the bucket count on flat art, so it is divided back down;
  // shaded art is mapped on a log scale instead, where tone counts run into the thousands
  const colors = flat
    ? clamp(Math.ceil(tones / 4), 2, 32)
    : clamp(Math.round(4 * Math.log2(Math.max(tones, 2))), 16, 64)

  // never trace above the source resolution, except for fine detail that is worth
  // supersampling; the ceiling keeps a 10 MB photo from proposing a minutes-long trace
  const native = Math.max(width, height)
  const wanted = edgeRatio >= 0.2 ? native * 1.5 : native
  const maxSide = Math.min(WORK_SIZES.find(s => s >= wanted) ?? 2048, 2048)

  return {
    preset,
    note,
    options: {
      ...PRESETS[preset],
      colors,
      despeckle: edgeRatio >= 0.3 ? 2 : PRESETS[preset].despeckle,
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

/* Translates the panel state into the option names imagetracer expects.
   Takes the reactive options object shaped like a PRESETS entry;
   returns a plain options object for the tracing helpers. */
export function traceOptions(o){
  return {
    ltres: o.lineThreshold,
    qtres: o.curveThreshold,
    pathomit: o.despeckle,
    rightangleenhance: o.sharpCorners,
    colorsampling: o.sampling,
    numberofcolors: o.colors,
    mincolorratio: o.minRatio,
    colorquantcycles: o.cycles,
    strokewidth: o.strokeWidth,
    linefilter: o.dropTinyPaths,
    scale: 1,
    roundcoords: o.precision,
    blurradius: o.blur,
    blurdelta: 20
  }
}

/* Paints a solid background behind the traced layers.
   Takes the SVG markup and a CSS color, or 'transparent' to leave it untouched;
   returns the SVG markup with a full-bleed rect inserted as the first child. */
export function withBackground(svg, color){
  if(!color || color === 'transparent') return svg
  return svg.replace(/>/, `><rect width="100%" height="100%" fill="${color}"/>`)
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
    if(data.progress !== undefined) return job.onProgress?.(data.progress)
    pending.delete(data.id)
    data.error ? job.reject(new Error(data.error)) : job.resolve(data)
  }
  return worker
}

/* Traces one raster image into layered SVG off the main thread, so the panel stays
   responsive while a detailed trace runs.
   Takes the source File, the panel options object, and a callback receiving a 0..1
   completion fraction as each colour layer lands;
   returns a Promise of {svg, layers, width, height, ms} — the traced markup, its group
   count, the working resolution it was traced at, and the trace time in milliseconds. */
export function trace(file, opts, onProgress){
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, {resolve, reject, onProgress})
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
