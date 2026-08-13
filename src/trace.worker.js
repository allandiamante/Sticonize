import init, { to_svg } from 'vtracer-wasm'
// the glue's default path resolves to `vtracer_bg.wasm`, but the package ships
// `vtracer.wasm` — passing the URL explicitly is what keeps init from 404ing
import wasmUrl from 'vtracer-wasm/vtracer.wasm?url'
import { fitSize, quantize, snapFills, finishSvg } from './trace-core.js'

let booting
/* Instantiates the tracer once and hands back the same promise afterwards.
   Takes nothing; returns a Promise resolving when the wasm module is live. */
const engine = () => (booting ??= init({module_or_path: wasmUrl}))

/* Decodes a raster file and reads it back as pixels at the working resolution.
   Takes the source Blob and the longest side allowed in pixels;
   returns a Promise of ImageData sized to fit that limit. */
async function pixels(file, maxSide){
  const bitmap = await createImageBitmap(file)
  const {width, height} = fitSize(bitmap.width, bitmap.height, maxSide)
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', {willReadFrequently: true})
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return ctx.getImageData(0, 0, width, height)
}

/* Traces one image.
   Takes a message {id, file, maxSide, colors, options} and posts back {id, error} on
   failure or {id, svg, palette, width, height, ms} on success.
   vtracer traces in a single call with no progress callback, so a trace reports only
   when it lands — hence the working-size ceiling in vector.js. */
self.onmessage = async ({data}) => {
  const {id, file, maxSide, colors, options} = data
  try{
    const started = performance.now()
    const image = await pixels(file, maxSide)
    // the palette is decided here, before the tracer sees anything: it has no
    // colour-count setting, and it re-derives colours per region on the way out
    const palette = quantize(image, colors)

    await engine()
    // a bad enum or an out-of-range field aborts the wasm instead of returning; the
    // instance survives it, so this only has to reach the caller as a normal failure
    const raw = to_svg(new Uint8Array(image.data.buffer), image.width, image.height, options)
    const svg = snapFills(finishSvg(raw, image.width, image.height), palette)
    // settings can legitimately discard everything — binary mode drops mid-tones whole,
    // and a large speckle filter eats small art. That returns valid but empty markup,
    // so it has to be reported rather than shown as a blank board.
    if(!svg.includes('<path')) throw new Error('emptyTrace')

    self.postMessage({
      id,
      svg,
      palette,
      width: image.width,
      height: image.height,
      ms: Math.round(performance.now() - started)
    })
  }catch(err){
    self.postMessage({id, error: err?.message || 'traceFail'})
  }
}
