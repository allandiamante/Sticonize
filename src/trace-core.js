import ImageTracer from 'imagetracerjs'

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

/* Formats a quantized palette entry as a hex color, for the layer's data attribute.
   Takes a {r, g, b} color object and returns a '#rrggbb' string. */
function hex({r, g, b}){
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

/* Traces pixels into layered SVG markup: the palette is walked colour by colour and
   each one becomes its own <g>, stacked back to front, with the paint hoisted onto
   the group so the paths inside carry geometry only. Fully transparent palette
   entries are dropped instead of emitting invisible paths.
   Takes the ImageData, the imagetracer options object, and an optional callback
   invoked with (tracedLayers, totalLayers) after every colour;
   returns {svg, layers} — the markup and how many groups it actually contains. */
export function layeredSvg(image, options, onLayer){
  const quantized = ImageTracer.colorquantization(image, options)
  const palette = quantized.palette
  const width = (quantized.array[0].length - 2) * options.scale
  const height = (quantized.array.length - 2) * options.scale

  let body = ''
  let layers = 0

  for(let c = 0; c < palette.length; c++){
    if(palette[c].a){
      const traced = ImageTracer.batchtracepaths(
        ImageTracer.internodes(
          ImageTracer.pathscan(ImageTracer.layeringstep(quantized, c), options.pathomit),
          options
        ),
        options.ltres,
        options.qtres
      )
      const one = {layers: [traced], palette: [palette[c]], width, height}
      let group = ''
      for(let p = 0; p < traced.length; p++)
        if(!traced[p].isholepath) group += ImageTracer.svgpathstring(one, 0, p, options)

      if(group){
        const paint = ImageTracer.tosvgcolorstr(palette[c], options)
        layers++
        body += `<g id="layer-${String(layers).padStart(2, '0')}" data-color="${hex(palette[c])}" ${paint}>`
             + group.split(paint).join('')
             + '</g>'
      }
    }
    onLayer?.(c + 1, palette.length)
  }

  return {
    svg: `<svg viewBox="0 0 ${width} ${height}" version="1.1" xmlns="http://www.w3.org/2000/svg">`
       + body
       + '</svg>\n<!-- Vectorized with Sticonize Vector -->',
    layers
  }
}
