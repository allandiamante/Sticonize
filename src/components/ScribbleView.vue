<script setup>
import { computed, reactive, ref, watch } from 'vue'
import InputPanel from './InputPanel.vue'
import ControlsPanel from './ControlsPanel.vue'
import { parse, buildSvg, sizedSvg, vueSvg, reactSvg, saveBlob, svgToPng, zipStore, PRESETS } from '../scribble.js'
import { t, errText } from '../i18n.js'
import { theme, INK } from '../theme.js'

defineProps({ mark: String })

// both start tucked away, same as the vectorize page: the board is what the page is for,
// and the tuning column is a wall of sliders no one needs open to drop an icon in
const showOptions = ref(false)
const showPresets = ref(false)

const items = ref([])   // {name, text, pasted?}
const active = ref(-1)

const opts = reactive({
  roughness: 0.45, bowing: 1.6, strokeWidth: 0.7,
  fillStyle: 'hachure', hachureGap: 1.8, hachureAngle: -41,
  passes: 2, color: INK[theme.value], seed: 42
})

const drawing = computed(() => {
  const item = items.value[active.value]
  if(!item) return null
  try{
    const parsed = parse(item.text)
    return {svg: buildSvg(parsed, opts), shapes: parsed.shapes.length, box: parsed.box}
  }catch(err){
    return {error: err}
  }
})

const presets = Object.keys(PRESETS)
const activePreset = computed(() =>
  presets.find(n => Object.entries(PRESETS[n]).every(([k, v]) => opts[k] === v))
)
const applyPreset = p => Object.assign(opts, PRESETS[p])

watch(theme, (now, before) => {
  if(opts.color.toLowerCase() === INK[before].toLowerCase()) opts.color = INK[now]
})

const meta = computed(() => {
  const d = drawing.value
  if(!d) return '—'
  if(d.error) return t.value.errorMeta
  return t.value.shapes(d.shapes, Math.round(d.box.w), Math.round(d.box.h))
})

function add(name, text, extra){
  items.value.push({name: name.replace(/\.svg$/i, ''), text, ...extra})
  active.value = items.value.length - 1
}

const isSvg = f => /\.svg$/i.test(f.name) || f.type === 'image/svg+xml'

async function onFiles(list){
  for(const f of Array.from(list)){
    if(isSvg(f)) add(f.name, await f.text())
  }
}

function onPaste(text){
  if(!text.includes('<svg')) return
  const last = items.value[items.value.length - 1]
  if(last && last.pasted) last.text = text
  else add(t.value.pasted, text, {pasted: true})
  active.value = items.value.length - 1
}

function remove(i){
  items.value.splice(i, 1)
  if(active.value >= items.value.length) active.value = items.value.length - 1
}

async function render(item, kind, size, bg){
  const svg = buildSvg(parse(item.text), opts)
  const base = item.name + t.value.suffix
  if(kind === 'svg')   return {name: base + '.svg', data: sizedSvg(svg, size), type: 'image/svg+xml;charset=utf-8'}
  if(kind === 'vue')   return {name: base + '.vue', data: vueSvg(svg, item.src), type: 'text/plain;charset=utf-8'}
  if(kind === 'react') return {name: base + '.jsx', data: reactSvg(svg, base, item.src), type: 'text/plain;charset=utf-8'}
  const png = await svgToPng(sizedSvg(svg, size), size, size, bg)
  return {name: base + '.png', data: new Uint8Array(await png.arrayBuffer()), type: 'image/png'}
}

function download(kind, size, bg){
  if(!drawing.value?.svg) return
  render(items.value[active.value], kind, size, bg)
    .then(f => saveBlob(new Blob([f.data], {type: f.type}), f.name))
    .catch(err => alert(t.value.pngFail + errText(err)))
}

const batch = ref('')
async function downloadAll(kind, size, bg){
  const files = []
  const taken = new Set()
  const enc = new TextEncoder()
  for(const [i, it] of items.value.entries()){
    batch.value = t.value.batch(i + 1, items.value.length)
    try{
      const f = await render(it, kind, size, bg)
      let name = f.name
      const [, base, ext] = name.match(/^(.*)(\.[^.]+)$/)
      for(let n = 2; taken.has(name); n++) name = `${base}-${n}${ext}`
      taken.add(name)
      files.push({name, data: typeof f.data === 'string' ? enc.encode(f.data) : f.data})
    }catch(err){ }
  }
  batch.value = ''
  if(files.length) saveBlob(new Blob([zipStore(files)], {type:'application/zip'}), t.value.zipName)
}
</script>

<template>
  <div class="wrap" :class="{'wrap--tucked': !showOptions}">
    <InputPanel
      :items="items"
      :active="active"
      @files="onFiles"
      @paste="onPaste"
      @pick="(name, text, src) => add(name, text, {src})"
      @select="active = $event"
      @remove="remove"
    />

    <section class="col col--stage">
      <p class="eyebrow">{{ t.board }}</p>
      <div class="stage" :class="{empty: !drawing}" :data-hint="t.emptyHint">
        <div v-if="drawing?.error" class="stage-error">
          {{ t.readFail }} <strong>{{ items[active].name }}</strong>.<br>{{ errText(drawing.error) }}
        </div>
        <div v-else-if="drawing" class="stage-art" v-html="drawing.svg"></div>
        <div v-else class="stage-mark" v-html="mark" aria-hidden="true"></div>
      </div>
      <div class="stage-meta">
        <span>{{ items[active]?.name ?? '—' }}</span>
        <span>{{ meta }}</span>
      </div>

      <div class="divider"></div>

      <p class="eyebrow">
        {{ t.recipes }}
        <button
          type="button"
          class="tuck"
          :aria-expanded="showPresets"
          :title="t.vec.moreOptions"
          @click="showPresets = !showPresets"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          <span class="sr-only">{{ t.vec.moreOptions }}</span>
        </button>
      </p>
      <div v-if="showPresets" class="presets">
        <button
          v-for="p in presets"
          :key="p"
          type="button"
          class="chip"
          :class="{on: activePreset === p}"
          @click="applyPreset(p)"
        >{{ t.presets[p] }}</button>
      </div>
    </section>

    <ControlsPanel
      :opts="opts"
      :can-download="!!drawing?.svg"
      :count="items.length"
      :batch="batch"
      :open="showOptions"
      @download="download"
      @download-all="downloadAll"
      @toggle="showOptions = !showOptions"
    />
  </div>
</template>
