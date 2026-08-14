/* The most a source may be enlarged to reach the working size.
   Enlarging adds no detail, but it does spread the antialiased rim of every edge over
   more pixels, and that is what the tracer reads: at native size a small drawing gives it
   a one-pixel staircase to follow and every rim shade becomes a shape of its own. Past
   about eight times there is nothing left but blur, and the trace is paying for it. */
const MAX_UPSCALE = 8

/* Scales a source resolution so its longest side reaches `max`.
   Takes the source width, height and the working size in pixels;
   returns {width, height, scale} — the size to trace at, and the factor it took. */
export function fitSize(w, h, max){
  const k = Math.min(max / Math.max(w, h), MAX_UPSCALE)
  return {
    width: Math.max(Math.round(w * k), 1),
    height: Math.max(Math.round(h * k), 1),
    scale: k
  }
}

/* Perceived brightness, Rec.601 — the weighting that keeps a yellow reading lighter than
   a blue of the same numbers, which a plain average does not.
   Takes the three channels; returns the luma. */
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b

/* Finds the brightness that best splits an image in two (Otsu's method): the cut where
   the two sides are each as tight as they can be, which is the same as the cut where
   they sit furthest apart.
   The engine's own black-and-white mode cuts at a fixed level instead, which is why a
   mid-tone subject on white vanishes from it whole — nothing in the picture is dark
   enough to be called foreground. Reading the cut off the picture is what keeps the
   drawing: whatever the darker half of this image is, it stays.
   Takes the luma histogram and the number of pixels in it; returns the cut, 0–255. */
function otsu(hist, total){
  let sum = 0
  for(let i = 0; i < 256; i++) sum += i * hist[i]

  // 255 is not a cut the loop below can reach — it breaks as soon as one side is empty —
  // so it doubles as "there is nothing here to split". An image of a single tone, which
  // is what a silhouette on transparency is, comes out entirely on the dark side of it:
  // one shape, which is the drawing, rather than a blank page
  let below = 0, weight = 0, best = -1, cut = 255
  for(let t = 0; t < 256; t++){
    weight += hist[t]
    if(!weight) continue
    const rest = total - weight
    if(!rest) break
    below += t * hist[t]
    // the between-class variance, dropped of the constant divisor it shares everywhere
    const spread = weight * rest * (below / weight - (sum - below) / rest) ** 2
    if(spread > best){ best = spread; cut = t }
  }
  return cut
}

/* Takes the colour out of an image, in place, before anything is traced.
   'gray' leaves the drawing whole and only drops the hues, so the palette below becomes
   that many steps of grey. 'mono' goes on to cut it into black and white at the split the
   picture itself suggests, nudged by `bias` — the one number a picture cannot supply,
   because whether a shadow belongs to the subject or the background is a decision.
   Takes the ImageData (mutated), the tone and the bias in luma steps; returns nothing. */
export function tonemap(image, tone, bias = 0){
  if(tone !== 'gray' && tone !== 'mono') return
  const {data} = image
  const hist = new Uint32Array(256)
  let total = 0

  for(let p = 0; p < data.length; p += 4){
    if(data[p + 3] < 128) continue
    const v = Math.round(luma(data[p], data[p + 1], data[p + 2]))
    data[p] = data[p + 1] = data[p + 2] = v
    hist[v]++
    total++
  }
  if(tone === 'gray' || !total) return

  const cut = Math.min(Math.max(otsu(hist, total) + bias, 0), 255)
  for(let p = 0; p < data.length; p += 4){
    if(data[p + 3] < 128) continue
    data[p] = data[p + 1] = data[p + 2] = data[p] > cut ? 255 : 0
  }
}

/* Squared distance between a bucket and a palette entry. Squared because nothing here
   compares it to anything but another distance, and the root costs more than it says.
   Takes the bucket and the [r,g,b] entry; returns the distance. */
const gap = (c, e) => (c.r - e[0]) ** 2 + (c.g - e[1]) ** 2 + (c.b - e[2]) ** 2

/* Groups a sample of the image's pixels by colour.
   Buckets at 5 bits a channel: fine enough that two colours anyone can tell apart land in
   different buckets, coarse enough that a photograph collapses to a few thousand entries
   the picking below can afford to scan over and over.
   Takes the ImageData; returns [{r, g, b, n}] — each bucket's mean colour and how much of
   the sample it holds. */
function buckets(image){
  const {data} = image
  const pixels = data.length / 4
  // past ~20k sampled pixels the palette stops moving, and every pixel is repainted anyway
  const step = Math.max(1, Math.round(pixels / 20000))
  const index = new Map()
  const list = []

  for(let i = 0; i < pixels; i += step){
    const p = i * 4
    if(data[p + 3] < 128) continue
    const key = (data[p] >> 3) << 10 | (data[p + 1] >> 3) << 5 | data[p + 2] >> 3
    let c = index.get(key)
    if(!c){ c = {r: 0, g: 0, b: 0, n: 0}; index.set(key, c); list.push(c) }
    c.r += data[p]; c.g += data[p + 1]; c.b += data[p + 2]; c.n++
  }
  for(const c of list){ c.r /= c.n; c.g /= c.n; c.b /= c.n }
  return list
}

/* Picks the starting palette by how far apart the colours are, not by how much of the
   image each one covers.
   Splitting the colour cube by population — median cut, which this used to do — spends
   its entries where the pixels are. A logo that is four fifths background, border and
   shadow gets those subdivided again and again, while the small red badge the whole
   drawing is about never gets an entry and comes out brown. Taking the bucket furthest
   from everything already picked finds that badge within the first few entries.
   Distance alone would pick the single furthest colour in the image, which in a
   photograph is always a lone compression artefact, so the score counts how much of the
   sample the bucket holds — but only up to a hundredth of it. Above that share a colour
   is plainly part of the drawing and competes on distance alone; below it, it is weighed
   down in proportion to how little of it there is. Counting population all the way up is
   what buried the badge in the first place: no detail outweighs a background.
   Takes the buckets and how many entries to pick; returns them as [r,g,b]. */
function seed(list, colors){
  // the first entry is the image's own average, so the second pick is what sits furthest
  // from the middle of this image rather than from an arbitrary corner of the cube
  let total = 0, r = 0, g = 0, b = 0
  for(const c of list){ total += c.n; r += c.r * c.n; g += c.g * c.n; b += c.b * c.n }
  const palette = [[r / total, g / total, b / total]]
  const enough = total / 100

  const near = list.map(c => gap(c, palette[0]))
  while(palette.length < colors){
    let pick = -1, best = 0
    for(let i = 0; i < list.length; i++){
      const score = Math.min(list[i].n, enough) * near[i]
      if(score > best){ best = score; pick = i }
    }
    if(pick < 0) break                        // every bucket already has an entry on it
    const chosen = [list[pick].r, list[pick].g, list[pick].b]
    palette.push(chosen)
    for(let i = 0; i < list.length; i++){
      const d = gap(list[i], chosen)
      if(d < near[i]) near[i] = d
    }
  }
  return palette.map(e => e.map(Math.round))
}

/* How many times the palette is re-centred. The move per pass shrinks fast, and a palette
   that has stopped moving stops early anyway. */
const SETTLE = 12

/* Re-centres each entry on the colours that actually chose it (Lloyd's step).
   Seeding puts the entries on real colours of the image but says nothing about where the
   boundaries between them fall; this walks each entry to the middle of what it won. It is
   the difference between a skin tone that reads as skin and one that reads as the average
   of skin and the shirt behind it.
   Takes the buckets and the palette (mutated); returns nothing. */
function settle(list, palette){
  for(let pass = 0; pass < SETTLE; pass++){
    const sums = palette.map(() => [0, 0, 0, 0])
    for(const c of list){
      let best = Infinity, k = 0
      for(let i = 0; i < palette.length; i++){
        const d = gap(c, palette[i])
        if(d < best){ best = d; k = i }
      }
      const s = sums[k]
      s[0] += c.r * c.n; s[1] += c.g * c.n; s[2] += c.b * c.n; s[3] += c.n
    }
    let moved = 0
    for(let i = 0; i < palette.length; i++){
      // an entry nothing chose keeps its place; the repaint below is what drops it, once
      // it is certain no pixel wanted it either
      if(!sums[i][3]) continue
      for(let ch = 0; ch < 3; ch++){
        const next = Math.round(sums[i][ch] / sums[i][3])
        moved += Math.abs(next - palette[i][ch])
        palette[i][ch] = next
      }
    }
    if(!moved) return
  }
}

/* Reduces an image to a palette of at most `colors` entries and repaints every pixel
   with its nearest entry, in place.
   The tracer has no colour-count setting of its own — it groups regions, it does not
   quantize — so the count has to be decided here, before it ever sees the pixels.
   Flattening also snaps antialiased rims to one side or the other, which is what stops
   a halo of in-between shades from becoming its own traced shape.
   Takes the ImageData (mutated) and the wanted number of colours;
   returns the palette actually used, as '#rrggbb' strings, darkest first. */
export function quantize(image, colors){
  const list = buckets(image)
  if(!list.length) return []

  const palette = seed(list, colors)
  settle(list, palette)
  // sorted last, so the swatches read dark to light
  palette.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]))

  // nearest-entry lookup cached per 15-bit colour bucket: a photograph asks the same
  // question millions of times, and the answer only changes every 8 levels
  const {data} = image
  const cache = new Int16Array(32768).fill(-1)
  const used = new Uint8Array(palette.length)
  for(let p = 0; p < data.length; p += 4){
    // the colour under a transparent pixel is cleared along with the alpha, because the
    // engine reads it anyway. In the source those pixels are one flat colour and it never
    // shows, but resampling to the working size mixes the drawing into them — and a
    // transparent region carrying a spread of colours comes back as a traced background
    if(data[p + 3] < 128){ data[p] = data[p + 1] = data[p + 2] = data[p + 3] = 0; continue }
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
    used[k] = 1
    data[p] = palette[k][0]; data[p + 1] = palette[k][1]; data[p + 2] = palette[k][2]
  }

  // an entry no pixel picked is not a colour of this image, and no shape can be traced in
  // it either. An image with fewer colours than were asked for comes back with the ones
  // it has rather than with padding — black-and-white artwork asked for eight is two.
  return palette
    .filter((_, i) => used[i])
    .map(c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''))
}

/* The colours the transparency may be filled with. Corners of the colour cube, because
   the only thing the fill has to be is far from everything the drawing is painted in.
   White and black are not offered: artwork uses them, and a fill the drawing shares is a
   fill that cannot be told back out of the trace. */
const KEYS = [[255, 0, 255], [0, 255, 0], [0, 255, 255], [255, 255, 0], [255, 0, 0], [0, 0, 255]]

/* How close a traced fill has to sit to the key colour to be the filled transparency
   rather than the drawing. The filled region is one flat colour, so its shape comes back
   in the key itself, give or take the speckles the engine merged into it. */
const NEAR = 3 * 32 ** 2

/* Distance from a colour to the nearest entry of a palette.
   Takes an [r,g,b] and the palette as [r,g,b]s; returns the squared distance. */
const spread = (c, rgb) => rgb.reduce(
  (min, e) => Math.min(min, (c[0] - e[0]) ** 2 + (c[1] - e[1]) ** 2 + (c[2] - e[2]) ** 2), Infinity)

/* Paints the transparent pixels an opaque colour, because the engine only reads the alpha
   channel while it stacks colour layers. Cutting out replaces every transparent pixel with
   a colour of its own and lays that under the drawing, and black-and-white reads them as
   ink — either way artwork that had no background comes back with one.
   Black and white gets white, which is background there by definition and needs nothing
   done to the trace afterwards. Colour gets whichever candidate sits furthest from the
   palette, so the fill neither merges into the region beside it nor passes for one on the
   way out; dropFill takes those shapes off the trace.
   Takes the ImageData (mutated), the palette from quantize and whether the trace is black
   and white; returns the fill to drop afterwards, or '' when there is nothing to drop. */
export function fillTransparent(image, palette, mono){
  const {data} = image
  let transparent = false
  for(let p = 3; p < data.length; p += 4) if(!data[p]){ transparent = true; break }
  if(!transparent) return ''

  const rgb = palette.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)))
  const key = mono ? [255, 255, 255]
    : KEYS.reduce((best, c) => spread(c, rgb) > spread(best, rgb) ? c : best)

  for(let p = 0; p < data.length; p += 4){
    if(data[p + 3]) continue
    data[p] = key[0]; data[p + 1] = key[1]; data[p + 2] = key[2]; data[p + 3] = 255
  }
  return mono ? '' : '#' + key.map(v => v.toString(16).padStart(2, '0')).join('')
}

/* Takes the shapes the engine drew over the filled transparency back off the trace. They
   are the only ones painted anywhere near the key colour — that is what picking it far
   from the palette bought.
   Runs before snapFills, which would otherwise pull the key onto a palette entry and turn
   the background into a colour of the drawing.
   Takes the traced SVG and the key colour, '' for nothing to drop; returns the markup. */
export function dropFill(svg, key){
  if(!key) return svg
  const c = [1, 3, 5].map(i => parseInt(key.slice(i, i + 2), 16))
  return svg.replace(/<path\b[^>]*?\/>/g, shape => {
    const hex = (shape.match(/fill="#([0-9a-fA-F]{6})"/) || [])[1]
    if(!hex) return shape
    const f = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16))
    return spread(f, [c]) < NEAR ? '' : shape
  })
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
