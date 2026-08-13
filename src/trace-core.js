/* Scales a source resolution down so its longest side fits `max`, never scaling up.
   Takes the source width, height and the maximum allowed side in pixels;
   returns {width, height} as positive integers. */
export function fitSize(w, h, max){
  const k = Math.min(max / Math.max(w, h), 1)
  return {width: Math.max(Math.round(w * k), 1), height: Math.max(Math.round(h * k), 1)}
}

/* Averages a bucket of colours.
   Takes an array of [r,g,b]; returns the rounded mean as [r,g,b]. */
function mean(box){
  const sum = box.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0])
  return sum.map(v => Math.round(v / box.length))
}

/* Measures how far a bucket spreads on its widest channel.
   Takes an array of [r,g,b]; returns {channel, range}. */
function spread(box){
  let channel = 0, range = -1
  for(let c = 0; c < 3; c++){
    let lo = 255, hi = 0
    for(const p of box){
      if(p[c] < lo) lo = p[c]
      if(p[c] > hi) hi = p[c]
    }
    if(hi - lo > range){ range = hi - lo; channel = c }
  }
  return {channel, range}
}

/* Reduces an image to a palette of at most `colors` entries and repaints every pixel
   with its nearest entry, in place.
   The tracer has no colour-count setting of its own — it groups regions, it does not
   quantize — so the count has to be decided here, before it ever sees the pixels.
   Flattening also snaps antialiased rims to one side or the other, which is what stops
   a halo of in-between shades from becoming its own traced shape.
   ponytail: median cut, which is deterministic and cheap; k-means would place the
   entries better on photographs, at the cost of iterating.
   Takes the ImageData (mutated) and the wanted number of colours;
   returns the palette actually used, as '#rrggbb' strings, darkest first. */
export function quantize(image, colors){
  const {data} = image
  const pixels = data.length / 4
  // the palette is built from a sample: past ~20k pixels the buckets stop moving, and
  // every pixel still gets repainted below
  const step = Math.max(1, Math.round(pixels / 20000))
  const sample = []
  for(let i = 0; i < pixels; i += step){
    const p = i * 4
    if(data[p + 3] >= 128) sample.push([data[p], data[p + 1], data[p + 2]])
  }
  if(!sample.length) return []

  let boxes = [sample]
  while(boxes.length < colors){
    let pick = -1, widest = 0
    for(let i = 0; i < boxes.length; i++){
      const {range} = spread(boxes[i])
      if(boxes[i].length > 1 && range > widest){ widest = range; pick = i }
    }
    if(pick < 0) break                       // every bucket is already a single colour
    const box = boxes[pick]
    const {channel} = spread(box)
    const sorted = box.slice().sort((a, b) => a[channel] - b[channel])
    const mid = sorted.length >> 1
    boxes.splice(pick, 1, sorted.slice(0, mid), sorted.slice(mid))
  }

  const palette = boxes.map(mean)
    .sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]))

  // nearest-entry lookup cached per 15-bit colour bucket: a photograph asks the same
  // question millions of times, and the answer only changes every 8 levels
  const cache = new Int16Array(32768).fill(-1)
  for(let p = 0; p < data.length; p += 4){
    if(data[p + 3] < 128){ data[p + 3] = 0; continue }
    data[p + 3] = 255
    const key = (data[p] >> 3) << 10 | (data[p + 1] >> 3) << 5 | data[p + 2] >> 3
    let k = cache[key]
    if(k < 0){
      let best = Infinity
      for(let i = 0; i < palette.length; i++){
        const d = (data[p] - palette[i][0]) ** 2
                + (data[p + 1] - palette[i][1]) ** 2
                + (data[p + 2] - palette[i][2]) ** 2
        if(d < best){ best = d; k = i }
      }
      cache[key] = k
    }
    data[p] = palette[k][0]; data[p + 1] = palette[k][1]; data[p + 2] = palette[k][2]
  }

  return palette.map(c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''))
}

/* Forces the traced shapes back onto the chosen palette.
   The tracer averages the pixels inside each region to decide that region's colour, so
   it invents in-between shades no matter how flat the input is — asking for 8 colours
   and quantizing to 8 still comes back with 67. Snapping the fills afterwards is what
   actually makes the count a promise rather than a hint.
   Takes the traced SVG and the palette from quantize;
   returns the markup with every fill replaced by its nearest palette entry. */
export function snapFills(svg, palette){
  if(!palette?.length) return svg
  const rgb = palette.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)))
  const cache = new Map()
  return svg.replace(/fill="#([0-9a-fA-F]{6})"/g, (m, hex) => {
    let hit = cache.get(hex)
    if(!hit){
      const c = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16))
      let best = Infinity
      for(let i = 0; i < rgb.length; i++){
        const d = (c[0] - rgb[i][0]) ** 2 + (c[1] - rgb[i][1]) ** 2 + (c[2] - rgb[i][2]) ** 2
        if(d < best){ best = d; hit = palette[i] }
      }
      cache.set(hex, hit)
    }
    return `fill="${hit}"`
  })
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
