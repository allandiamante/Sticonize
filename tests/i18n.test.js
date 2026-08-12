// Dictionary drift. Three languages and ~300 keys are edited by hand, and a template
// that reads a key which moved fails silently — it renders an empty string, or
// "undefined" where a number should be. Both shipped at least once.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// the dictionary is evaluated without vue: only `dict` matters here
const source = fs.readFileSync('src/i18n.js', 'utf8')
const dict = new Function(
  source.slice(source.indexOf('const dict'), source.indexOf('export const langs')) + '; return dict'
)()

const langs = Object.keys(dict)
assert.ok(langs.length >= 2, 'more than one language to keep in step')

/* Flattens an object into dotted key paths, treating arrays as leaves.
   Takes the object and an optional prefix; returns an array of paths. */
const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) =>
  v && typeof v === 'object' && !Array.isArray(v) ? keys(v, p + k + '.') : [p + k])

/* Walks a dotted path.
   Takes the root object and the path; returns the value, or undefined. */
const get = (o, p) => p.split('.').reduce((a, k) => a?.[k], o)

// every language carries exactly the same keys: a missing one is a blank label, an
// extra one is a translation nothing reads
const [first, ...rest] = langs
const shape = new Set(keys(dict[first]))
for(const lang of rest){
  const other = new Set(keys(dict[lang]))
  assert.deepEqual([...shape].filter(k => !other.has(k)), [], `${lang} is missing keys`)
  assert.deepEqual([...other].filter(k => !shape.has(k)), [], `${lang} has keys no other language has`)
}

/* Collects every source file the templates and view logic live in.
   Takes a directory; returns absolute paths to its .vue and .js files. */
function sources(dir){
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => {
    const full = path.join(dir, e.name)
    if(e.isDirectory()) return sources(full)
    return /\.(vue|js)$/.test(e.name) && e.name !== 'i18n.js' ? [full] : []
  })
}

/* Splits a call's argument list on the commas that sit at depth one, so a nested call or
   an object literal counts as one argument. Commas inside comments and string literals
   are skipped — a comma in an explanatory comment is not an argument.
   Takes the source and the index just past the opening parenthesis;
   returns the number of arguments, or null if the call is never closed. */
function arity(src, open){
  let depth = 1, args = 0, seen = false
  for(let i = open; i < src.length; i++){
    const c = src[i], next = src[i + 1]

    if(c === '/' && next === '/'){ i = src.indexOf('\n', i); if(i < 0) return null; continue }
    if(c === '/' && next === '*'){ i = src.indexOf('*/', i); if(i < 0) return null; i++; continue }
    if(c === '"' || c === "'" || c === '`'){
      // a quoted argument is opaque: whatever punctuation it holds is not syntax
      for(i++; i < src.length && src[i] !== c; i++) if(src[i] === '\\') i++
      if(i >= src.length) return null
      seen = true
      continue
    }

    if('([{'.includes(c)) depth++
    else if(')]}'.includes(c)){
      depth--
      if(depth === 0) return seen ? args + 1 : 0
    }
    else if(c === ',' && depth === 1) args++
    if(depth === 1 && !'\n\r\t '.includes(c)) seen = true
  }
  return null
}

const used = []
for(const file of sources('src')){
  const src = fs.readFileSync(file, 'utf8')
  for(const m of src.matchAll(/\bt\.(?:value\.)?([a-zA-Z]+(?:\.[a-zA-Z]+)*)\s*(\()?/g)){
    used.push({file, key: m[1], called: !!m[2], open: m.index + m[0].length})
  }
}
assert.ok(used.length > 40, 'the scan actually found the call sites')

for(const lang of langs){
  for(const {file, key, called, open} of used){
    const value = get(dict[lang], key)
    const where = `${path.relative('src', file)} → t.${key} [${lang}]`
    assert.notEqual(value, undefined, `${where} is not in the dictionary`)

    if(!called){
      assert.notEqual(typeof value, 'function', `${where} is a function but is rendered directly`)
      continue
    }
    // a call site that hands over the wrong number of arguments is the failure that
    // renders "undefined" into the page instead of throwing
    assert.equal(typeof value, 'function', `${where} is called but is not a function`)
    const count = arity(fs.readFileSync(file, 'utf8'), open)
    assert.notEqual(count, null, `${where} has an unbalanced call`)
    assert.equal(count, value.length, `${where} takes ${value.length} arguments, called with ${count}`)
  }
}
