// Output: sized SVG and the Vue/React components.
import assert from 'node:assert/strict'
import { sizedSvg, vueSvg, reactSvg } from '../../src/scribble.js'

// sizedSvg: width/height go in without wiping the attributes already there
assert.equal(sizedSvg('<svg xmlns="x"><path/></svg>', 64), '<svg width="64" height="64" xmlns="x"><path/></svg>')

// --- vueSvg: ink becomes currentColor, fill="none" survives ---
const vue = vueSvg('<svg xmlns="x" viewBox="0 0 10 10"><path d="M0,0" stroke="#E8EDE9" fill="none"/><path fill="#e8edE9"/></svg>')
assert.ok(vue.startsWith('<template>') && vue.trimEnd().endsWith('</template>'))
assert.ok(vue.includes('<svg fill="currentColor" xmlns='))
assert.equal(vue.match(/currentColor/g).length, 3)   // root + stroke + fill
assert.ok(vue.includes('fill="none"'))
// indentation: <svg> at 2, children at 4, </svg> back to 2
assert.ok(vue.includes('\n  <svg fill="currentColor"'))
assert.ok(vue.includes('\n    <path d="M0,0"'))
assert.ok(vue.includes('\n  </svg>'))

// --- reactSvg: dashed attributes become camelCase, {...props} closes the root tag ---
const jsx = reactSvg(
  '<svg xmlns="x" viewBox="0 0 10 10"><path d="M0,0 l-5-5" stroke="#E8EDE9" stroke-width="0.700" stroke-linecap="round" fill="none"/></svg>',
  'star-scribbled'
)
assert.ok(jsx.startsWith('export default function StarScribbled(props) {'))
assert.ok(jsx.includes('<svg fill="currentColor" xmlns="x" viewBox="0 0 10 10" {...props}>'))
assert.ok(jsx.includes('strokeWidth="0.700"') && jsx.includes('strokeLinecap="round"'))
assert.ok(!jsx.includes('stroke-'))
assert.ok(jsx.includes('d="M0,0 l-5-5"'))            // the dash inside the path data is not camelCased
assert.ok(jsx.includes('stroke="currentColor"') && jsx.includes('fill="none"'))
assert.ok(jsx.trimEnd().endsWith('  );\n}'))
// indentation: root at 4 (aligned with the return), children at 6
assert.ok(jsx.includes('\n    <svg fill="currentColor"'))
assert.ok(jsx.includes('\n      <path d="M0,0 l-5-5"'))
assert.ok(jsx.includes('\n    </svg>'))

// a name not starting with a letter gets a prefix, an empty name becomes Icon
assert.ok(reactSvg('<svg ></svg>', '2-arrows').includes('function Icon2Arrows(props)'))
assert.ok(reactSvg('<svg ></svg>', '---').includes('function Icon(props)'))

// --- Iconify credit: only emitted when the item came from the search ---
assert.ok(!vue.includes('Iconify') && !jsx.includes('Iconify'))   // no src, no header
const credited = vueSvg('<svg ></svg>', 'mdi:home')
assert.ok(credited.startsWith('<!--\nmdi:home — icon from Iconify:'))
assert.ok(credited.includes('https://icon-sets.iconify.design/mdi/home/'))
assert.ok(credited.includes('-->\n<template>'))
const creditedJsx = reactSvg('<svg ></svg>', 'home-scribbled', 'mdi:home')
assert.ok(creditedJsx.startsWith('/*\nmdi:home — icon from Iconify:'))
assert.ok(creditedJsx.includes('*/\nexport default function HomeScribbled(props)'))
