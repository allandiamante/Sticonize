import rough from 'roughjs'

const gen = rough.generator()

export const PRESETS = {
  wireframe: {roughness:0.55, bowing:1.8, strokeWidth:0.75, fillStyle:'none',        hachureGap:1.8, hachureAngle:-41, passes:2},
  hachure:   {roughness:0.45, bowing:1.6, strokeWidth:0.7,  fillStyle:'hachure',     hachureGap:1.8, hachureAngle:-41, passes:2},
  thick:     {roughness:0.6,  bowing:1.8, strokeWidth:1.3,  fillStyle:'hachure',     hachureGap:3.4, hachureAngle:-30, passes:3},
  charcoal:  {roughness:0.7,  bowing:1.2, strokeWidth:0.6,  fillStyle:'cross-hatch', hachureGap:1.2, hachureAngle:-45, passes:2},
  dots:      {roughness:0.5,  bowing:1.4, strokeWidth:0.6,  fillStyle:'dots',        hachureGap:2.4, hachureAngle:0,   passes:2},
  ink:       {roughness:0.22, bowing:0.8, strokeWidth:0.9,  fillStyle:'solid',       hachureGap:1.8, hachureAngle:-41, passes:1}
}

export const FILL_STYLES = ['none', 'hachure', 'cross-hatch', 'zigzag', 'zigzag-line', 'dashed', 'dots', 'solid']

function num(el, attr, dflt){
  const v = parseFloat(el.getAttribute(attr))
  return isNaN(v) ? (dflt || 0) : v
}

export function rectToPath(el){
  const x = num(el,'x'), y = num(el,'y')
  const w = num(el,'width'), h = num(el,'height')
  if(w <= 0 || h <= 0) return null
  let rx = el.hasAttribute('rx') ? num(el,'rx') : NaN
  let ry = el.hasAttribute('ry') ? num(el,'ry') : NaN
  if(isNaN(rx) && isNaN(ry)){ rx = ry = 0 }
  else if(isNaN(rx)) rx = ry
  else if(isNaN(ry)) ry = rx
  rx = Math.min(rx, w/2); ry = Math.min(ry, h/2)
  if(rx <= 0 || ry <= 0) return `M${x},${y} H${x+w} V${y+h} H${x} Z`
  return `M${x+rx},${y} H${x+w-rx} A${rx},${ry} 0 0 1 ${x+w},${y+ry}`
       + ` V${y+h-ry} A${rx},${ry} 0 0 1 ${x+w-rx},${y+h}`
       + ` H${x+rx} A${rx},${ry} 0 0 1 ${x},${y+h-ry}`
       + ` V${y+ry} A${rx},${ry} 0 0 1 ${x+rx},${y} Z`
}

export function ellipseToPath(cx, cy, rx, ry){
  if(rx <= 0 || ry <= 0) return null
  return `M${cx-rx},${cy} A${rx},${ry} 0 0 1 ${cx+rx},${cy}`
       + ` A${rx},${ry} 0 0 1 ${cx-rx},${cy} Z`
}

export function pointsToPath(el, close){
  const raw = (el.getAttribute('points') || '').trim()
  if(!raw) return null
  const nums = raw.split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n))
  if(nums.length < 4) return null
  let d = `M${nums[0]},${nums[1]}`
  for(let i = 2; i+1 < nums.length; i += 2) d += ` L${nums[i]},${nums[i+1]}`
  if(close) d += ' Z'
  return d
}

export function elementToD(el){
  switch(el.tagName.toLowerCase()){
    case 'path':     return el.getAttribute('d')
    case 'rect':     return rectToPath(el)
    case 'circle':   return ellipseToPath(num(el,'cx'), num(el,'cy'), num(el,'r'), num(el,'r'))
    case 'ellipse':  return ellipseToPath(num(el,'cx'), num(el,'cy'), num(el,'rx'), num(el,'ry'))
    case 'line':     return `M${num(el,'x1')},${num(el,'y1')} L${num(el,'x2')},${num(el,'y2')}`
    case 'polyline': return pointsToPath(el, false)
    case 'polygon':  return pointsToPath(el, true)
    default:         return null
  }
}

const cache = new Map()

export function parse(svgText){
  let hit = cache.get(svgText)
  if(!hit){
    hit = parseSvg(svgText)
    if(cache.size >= 64) cache.clear()
    cache.set(svgText, hit)
  }
  return hit
}

const STRIP = 'script,style,foreignObject,desc,title,image,use,animate,animateTransform,animateMotion,set'

export function parseSvg(svgText){
  const doc = new DOMParser().parseFromString(svgText, 'text/html')
  const src = doc.querySelector('svg')
  if(!src) throw new Error('noSvgTag')  
  src.querySelectorAll(STRIP).forEach(el => el.remove())
  for(const el of [src, ...src.querySelectorAll('*')])
    for(const a of [...el.attributes]) if(/^on/i.test(a.name)) el.removeAttributeNode(a)

  const holder = document.createElement('div')
  holder.style.cssText = 'position:absolute;left:-99999px;top:0;width:600px;height:600px;opacity:0;pointer-events:none'
  const svg = holder.appendChild(document.importNode(src, true))
  document.body.appendChild(holder)

  try{
    const vb = svg.getAttribute('viewBox')
    let box
    if(vb){
      const p = vb.trim().split(/[\s,]+/).map(parseFloat)
      box = {x: p[0]||0, y: p[1]||0, w: p[2]||100, h: p[3]||100}
    } else {
      box = {x:0, y:0, w: parseFloat(svg.getAttribute('width')) || 100, h: parseFloat(svg.getAttribute('height')) || 100}
    }

    const shapes = []
    let rootCTM = null
    try { rootCTM = svg.getScreenCTM() } catch(e){}

    svg.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon').forEach(el => {
      if(el.closest('defs,clipPath,mask,marker,pattern,symbol')) return
      const d = elementToD(el)
      if(!d) return

      const cs = window.getComputedStyle(el)
      const isNone = v => !v || v === 'none' || v === 'transparent' || v === 'rgba(0, 0, 0, 0)'
      const hasFill = !isNone((el.getAttribute('fill') || cs.fill || '').trim())
      const hasStroke = !isNone((el.getAttribute('stroke') || cs.stroke || '').trim())

      let m = null
      try{
        const ctm = el.getScreenCTM()
        if(ctm && rootCTM) m = rootCTM.inverse().multiply(ctm)
      }catch(e){}
      let matrix = null
      if(m && (Math.abs(m.a-1) > 1e-6 || Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6 ||
               Math.abs(m.d-1) > 1e-6 || Math.abs(m.e) > 1e-6 || Math.abs(m.f) > 1e-6)){
        matrix = [m.a, m.b, m.c, m.d, m.e, m.f]
      }

      shapes.push({d, hasFill, hasStroke, matrix})
    })

    if(!shapes.length) throw new Error('noShapes')
    return {box, shapes}
  } finally {
    holder.remove()
  }
}

export function buildSvg({box, shapes}, ui){
  const k = Math.max(box.w, box.h) / 100

  let body = ''
  shapes.forEach((sh, i) => {
    let mk = 1
    if(sh.matrix){
      const [a, b, c, d] = sh.matrix
      mk = Math.max((Math.hypot(a,b) + Math.hypot(c,d)) / 2, 0.0001)
    }
    const s = k / mk

    const o = {
      seed: ui.seed + i * 977,
      roughness: ui.roughness * s,
      bowing: ui.bowing,
      stroke: ui.color,
      strokeWidth: ui.strokeWidth * s,
      disableMultiStroke: ui.passes === 1,
      preserveVertices: false
    }
    if(sh.hasFill && ui.fillStyle !== 'none'){
      o.fill = ui.color
      o.fillStyle = ui.fillStyle
      o.hachureGap = ui.hachureGap * s
      o.hachureAngle = ui.hachureAngle
      o.fillWeight = ui.strokeWidth * s * 0.52
    }

    let drawable
    try { drawable = gen.path(sh.d, o) }
    catch(e){ return }

    const paths = gen.toPaths(drawable)
    let inner = ''
    for(let r = 0; r < (ui.passes >= 3 ? 2 : 1); r++){
      const off = r === 0 ? '' : ` transform="translate(${(0.35*s).toFixed(2)},${(0.3*s).toFixed(2)})" opacity="0.6"`
      const seg = paths.map(p =>
        `<path d="${p.d}" stroke="${p.stroke || 'none'}" stroke-width="${(p.strokeWidth || 0).toFixed(3)}"`
        + ` fill="${p.fill && p.fill !== 'none' ? p.fill : 'none'}" stroke-linecap="round" stroke-linejoin="round"/>`
      ).join('')
      inner += off ? `<g${off}>${seg}</g>` : seg
    }

    body += sh.matrix
      ? `<g transform="matrix(${sh.matrix.map(n => n.toFixed(6)).join(',')})">${inner}</g>`
      : inner
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.w} ${box.h}">`
       + `<g fill="none">${body}</g></svg>`
}

export function sizedSvg(svgText, size){
  return svgText.replace('<svg ', `<svg width="${size}" height="${size}" `)
}

function indentSvg(svgText, pad){
  let depth = 0
  return svgText.replace(/></g, '>\n<').split('\n').map(line => {
    if(line.startsWith('</')) depth--
    const out = pad + '  '.repeat(depth) + line
    if(!line.startsWith('</') && !line.endsWith('/>')) depth++
    return out
  }).join('\n')
}

const credit = src => src
  ? `${src} — icon from Iconify: https://icon-sets.iconify.design/${src.replace(':', '/')}/\nCheck the icon set's license before shipping.`
  : ''

export function vueSvg(svgText, src){
  const body = svgText.replace(/(stroke|fill)="#[0-9a-fA-F]{3,8}"/g, '$1="currentColor"')
                      .replace('<svg ', '<svg fill="currentColor" ')
  const head = src ? `<!--\n${credit(src)}\n-->\n` : ''
  return `${head}<template>\n${indentSvg(body, '  ')}\n</template>\n`
}

function pascal(name){
  const p = name.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
                .map(w => w[0].toUpperCase() + w.slice(1)).join('')
  return /^[A-Za-z]/.test(p) ? p : 'Icon' + p
}

export function reactSvg(svgText, name, src){
  const body = svgText
    .replace(/(stroke|fill)="#[0-9a-fA-F]{3,8}"/g, '$1="currentColor"')
    .replace(/([a-z]+)-([a-z]+)=/g, (m, a, b) => `${a}${b[0].toUpperCase()}${b.slice(1)}=`)
    .replace('<svg ', '<svg fill="currentColor" ')
    .replace('>', ' {...props}>')
  const head = src ? `/*\n${credit(src)}\n*/\n` : ''
  return `${head}export default function ${pascal(name)}(props) {\n  return (\n${indentSvg(body, '    ')}\n  );\n}\n`
}

const CRC = Uint32Array.from({length: 256}, (_, n) => {
  for(let k = 0; k < 8; k++) n = n & 1 ? 0xEDB88320 ^ (n >>> 1) : n >>> 1
  return n
})
function crc32(buf){
  let c = -1
  for(const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

export function zipStore(files, date = new Date()){
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const day  = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  const enc = new TextEncoder()
  const entries = files.map(f => ({name: enc.encode(f.name), data: f.data, crc: crc32(f.data)}))

  const size = entries.reduce((n, e) => n + 76 + e.name.length * 2 + e.data.length, 0) + 22
  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  let p = 0
  const u16 = v => { view.setUint16(p, v, true); p += 2 }
  const u32 = v => { view.setUint32(p, v, true); p += 4 }
  const raw = b => { out.set(b, p); p += b.length }

  for(const e of entries){
    e.at = p                                             
    u32(0x04034b50); u16(20); u16(0x0800); u16(0)         
    u16(time); u16(day)
    u32(e.crc); u32(e.data.length); u32(e.data.length)
    u16(e.name.length); u16(0)
    raw(e.name); raw(e.data)
  }

  const cdAt = p
  for(const e of entries){
    u32(0x02014b50); u16(20); u16(20); u16(0x0800); u16(0)
    u16(time); u16(day)
    u32(e.crc); u32(e.data.length); u32(e.data.length)
    u16(e.name.length); u16(0); u16(0)
    u16(0); u16(0); u32(0)
    u32(e.at)
    raw(e.name)
  }
  const cdSize = p - cdAt

  u32(0x06054b50); u16(0); u16(0)
  u16(entries.length); u16(entries.length)
  u32(cdSize); u32(cdAt); u16(0)

  return out
}

export function saveBlob(blob, filename){
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function svgToPng(svgText, w, h, bg){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgText], {type:'image/svg+xml;charset=utf-8'}))
    const img = new Image()
    img.onload = () => {
      const cv = document.createElement('canvas')
      cv.width = w
      cv.height = h
      const ctx = cv.getContext('2d')
      if(bg && bg !== 'transparent'){
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, w, h)
      }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      cv.toBlob(b => b ? resolve(b) : reject(new Error('pngEncode')), 'image/png')
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('pngLoad')) }
    img.src = url
  })
}
