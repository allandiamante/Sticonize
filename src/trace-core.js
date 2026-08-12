/* Scales a source resolution down so its longest side fits `max`, never scaling up.
   Takes the source width, height and the maximum allowed side in pixels;
   returns {width, height} as positive integers. */
export function fitSize(w, h, max){
  const k = Math.min(max / Math.max(w, h), 1)
  return {width: Math.max(Math.round(w * k), 1), height: Math.max(Math.round(h * k), 1)}
}

/* Measures what kind of artwork an image is, so the panel can propose settings for it.
   Pixels are sampled on a stride rather than read whole: the ratios it reports are
   stable well below full resolution, and this runs before the first trace.
   Takes the ImageData;
   returns {tones, edgeRatio, flatRatio, alphaRatio} — the number of distinct 15-bit
   color buckets found, the share of samples sitting on a luminance edge, the share
   inside a uniformly colored neighbourhood, and the share that is not fully opaque. */
export function analyzeImage(image){
  const {data, width, height} = image
  const step = Math.max(1, Math.round(Math.sqrt(width * height / 40000)))
  // neighbours are read a share of the image away rather than adjacent, and the distance
  // scales with it: over one pixel even a steep ramp moves less than a quantization step,
  // so a gradient would be indistinguishable from a flat fill
  const gap = Math.min(Math.max(Math.round(Math.max(width, height) / 64), 3), 12)
  const luma = i => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  const bucket = i => (data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | data[i + 2] >> 3
  // a flat fill holds its exact value across the gap; one level of slack covers
  // compression noise without letting a gradient through
  const apart = (i, j) => Math.max(Math.abs(data[i] - data[j]), Math.abs(data[i+1] - data[j+1]), Math.abs(data[i+2] - data[j+2]))

  const seen = new Set()
  let samples = 0, edges = 0, flat = 0, translucent = 0

  for(let y = 0; y + gap < height; y += step){
    for(let x = 0; x + gap < width; x += step){
      const i = (y * width + x) * 4
      if(data[i + 3] < 250) translucent++
      if(data[i + 3] < 8) continue
      samples++
      seen.add(bucket(i))
      const right = i + gap * 4
      const down = i + gap * width * 4
      if(Math.max(Math.abs(luma(i) - luma(right)), Math.abs(luma(i) - luma(down))) > 24) edges++
      else if(Math.max(apart(i, right), apart(i, down)) <= 1) flat++
    }
  }

  const per = n => samples ? n / samples : 0
  return {tones: seen.size, edgeRatio: per(edges), flatRatio: per(flat), alphaRatio: per(translucent)}
}

/* Makes vtracer's output embeddable. The engine emits an XML prolog, a generator
   comment and an <svg> carrying width/height but no viewBox — without one the markup
   cannot scale to the board, and the prolog is invalid inside an HTML document.
   Takes the raw SVG string and the traced pixel size;
   returns markup starting at <svg>, with a viewBox and a credit comment. */
export function finishSvg(svg, width, height){
  const open = svg.indexOf('<svg ')
  if(open < 0) throw new Error('traceFail')
  return svg.slice(open).replace('<svg ', `<svg viewBox="0 0 ${width} ${height}" `).trimEnd()
       + '\n<!-- Vectorized with Sticonize -->'
}
