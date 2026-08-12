import { fitSize, layeredSvg, analyzeImage } from './trace-core.js'

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

/* Handles one request from the main thread: either measuring an image or tracing it.
   A trace reports progress per colour layer, because a detailed one runs for seconds.
   Takes a message {id, kind, file, maxSide, options} and posts back {id, error} on
   failure, {id, stats} for kind 'analyze', or {id, progress} updates followed by
   {id, svg, layers, width, height, ms} for a trace. */
self.onmessage = async ({data}) => {
  const {id, kind, file, maxSide, options} = data
  try{
    const started = performance.now()
    const image = await pixels(file, maxSide)

    if(kind === 'analyze'){
      self.postMessage({id, stats: analyzeImage(image)})
      return
    }

    const {svg, layers} = layeredSvg(image, options, (done, total) =>
      self.postMessage({id, progress: done / total})
    )
    self.postMessage({id, svg, layers, width: image.width, height: image.height, ms: Math.round(performance.now() - started)})
  }catch(err){
    self.postMessage({id, error: err?.message || 'traceFail'})
  }
}
