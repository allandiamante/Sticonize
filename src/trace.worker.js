import init, { to_svg } from 'vtracer-wasm'
// the glue's default path resolves to `vtracer_bg.wasm`, but the package ships
// `vtracer.wasm` — passing the URL explicitly is what keeps init from 404ing
import wasmUrl from 'vtracer-wasm/vtracer.wasm?url'
import { fitSize, tonemap, quantize, snapFills, finishSvg } from './trace-core.js'
import { refineSvg } from './refine.js'

let booting
/* Instantiates the tracer once and hands back the same promise afterwards.
   Takes nothing; returns a Promise resolving when the wasm module is live. */
const engine = () => (booting ??= init({module_or_path: wasmUrl}))

/* Decodes a raster file and reads it back as pixels at the working resolution.
   Takes the source Blob and the working size in pixels;
   returns a Promise of {image, scale} — the pixels to trace, and how far the source was
   scaled to reach them. */
async function pixels(file, maxSide){
  const bitmap = await createImageBitmap(file)
  const {width, height, scale} = fitSize(bitmap.width, bitmap.height, maxSide)
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', {willReadFrequently: true})
  // the resampler is the whole point when the source is being enlarged: the default is
  // allowed to be a nearest-neighbour blit, which would hand the tracer the same staircase
  // it had at native size, only bigger
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return {image: ctx.getImageData(0, 0, width, height), scale}
}

/* Traces one image, and refines the result when asked to.
   Takes a message {id, file, maxSide, colors, options, refine} and posts back {id, error}
   on failure or {id, svg, palette, width, height, ms, refined} on success. A refine pass
   also posts {id, phase} as it moves between steps.
   vtracer traces in a single call with no progress callback, so the trace itself reports
   only when it lands — hence the working-size ceiling in vector.js. */
self.onmessage = async ({data}) => {
  const {id, file, maxSide, colors, tone, threshold, options, refine} = data

  /* Announces the step about to start and yields, so the message leaves before the
     thread is busy again. Takes the step's name; returns a Promise. */
  const phase = name => new Promise(done => {
    self.postMessage({id, phase: name})
    setTimeout(done)
  })

  try{
    const started = performance.now()
    if(refine) await phase('reading')
    const {image, scale} = await pixels(file, maxSide)

    // the palette is decided here, before the tracer sees anything: it has no
    // colour-count setting, and it re-derives colours per region on the way out. Black
    // and white is decided here too, for the opposite reason — the engine has a cut of
    // its own and it is the wrong one.
    if(refine) await phase('quantize')
    tonemap(image, tone, threshold)
    const palette = quantize(image, colors)

    if(refine) await phase('trace')
    await engine()
    // the speckle filter counts traced pixels, the panel offers it in source pixels, and
    // enlarging squares the difference: a four-pixel blot of scanner noise covers 256 of
    // them at eight times, and would sail through the filter set to discard it. Never
    // below the panel's own number — shrinking the source has already averaged those
    // blots away rather than made them bigger.
    const grown = Math.max(scale, 1) ** 2
    const sized = {
      ...options,
      filterSpeckle: Math.min(Math.round(options.filterSpeckle * grown), 128)
    }
    // a bad enum or an out-of-range field aborts the wasm instead of returning; the
    // instance survives it, so this only has to reach the caller as a normal failure
    const raw = to_svg(new Uint8Array(image.data.buffer), image.width, image.height, sized)
    let svg = snapFills(finishSvg(raw, image.width, image.height), palette)
    // settings can legitimately discard everything — binary mode drops mid-tones whole,
    // and a large speckle filter eats small art. That returns valid but empty markup,
    // so it has to be reported rather than shown as a blank board.
    if(!svg.includes('<path')) throw new Error('emptyTrace')

    if(refine) svg = await refineSvg(
      svg, {corner: options.cornerThreshold, precision: options.pathPrecision}, phase)

    self.postMessage({
      id,
      svg,
      palette,
      refined: !!refine,
      width: image.width,
      height: image.height,
      ms: Math.round(performance.now() - started)
    })
  }catch(err){
    self.postMessage({id, error: err?.message || 'traceFail'})
  }
}
