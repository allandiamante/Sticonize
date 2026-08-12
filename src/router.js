import { ref, watchEffect } from 'vue'
import { t } from './i18n.js'

/* The two pages, keyed by the name the views and the i18n dictionary use.
   Real paths rather than a hash, so the pages are linkable and indexable —
   nginx serves index.html for both (see the Dockerfile's try_files). */
export const PATHS = {scribble: '/', vector: '/vectorize'}

/* Reads the page out of the address bar, tolerating a trailing slash.
   Takes nothing; returns a page name, falling back to the first page. */
function at(){
  const path = location.pathname.replace(/\/+$/, '') || '/'
  return Object.keys(PATHS).find(k => PATHS[k] === path) ?? 'scribble'
}

export const page = ref(at())

/* Navigates to a page, pushing a history entry so Back and Forward work.
   Takes the page name; returns nothing. */
export function go(name){
  if(name === page.value) return
  history.pushState(null, '', PATHS[name])
  page.value = name
}

addEventListener('popstate', () => (page.value = at()))

const canonical = document.querySelector('link[rel="canonical"]')
const site = canonical ? new URL(canonical.href).origin : location.origin

// the title follows the page and the language, so history entries stay tellable apart;
// the canonical follows it too, or both pages would claim to be the same document
watchEffect(() => {
  document.title = page.value === 'vector' ? t.value.vec.docTitle : t.value.docTitle
  if(canonical) canonical.href = site + PATHS[page.value]
})
