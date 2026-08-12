<script setup>
import { computed, reactive, ref, watch } from 'vue'
import VectorInputPanel from './VectorInputPanel.vue'
import VectorControlsPanel from './VectorControlsPanel.vue'
import { trace, analyze, recommend, validateFile, withBackground, countPaths, formatBytes, PRESETS } from '../vector.js'
import { saveBlob } from '../scribble.js'
import { t, errText } from '../i18n.js'

defineProps({ mark: String })
const emit = defineEmits(['stylize'])

const source = ref(null)
const result = ref(null)
const stats = ref(null)
const error = ref('')
const busy = ref(false)
const progress = ref(0)
const view = ref('vector')
const copied = ref(false)

const opts = reactive({...PRESETS.auto, maxSide: 1536, background: 'transparent'})

const presets = Object.keys(PRESETS)
const activePreset = computed(() =>
  presets.find(n => Object.entries(PRESETS[n]).every(([k, v]) => opts[k] === v))
)

const suggestion = computed(() =>
  stats.value && source.value ? recommend(stats.value, source.value.width, source.value.height) : null
)

const suggestionApplied = computed(() =>
  !!suggestion.value && Object.entries(suggestion.value.options).every(([k, v]) => opts[k] === v)
)

const svg = computed(() => result.value && withBackground(result.value.svg, opts.background))

const meta = computed(() => {
  if(!result.value) return '—'
  const out = svg.value
  return t.value.vec.meta(
    result.value.layers, countPaths(out),
    result.value.width, result.value.height,
    formatBytes(out.length), (result.value.ms / 1000).toFixed(1)
  )
})

const percent = computed(() => t.value.vec.tracing(Math.round(progress.value * 100)))

/* Reads the picked file, keeps a preview URL and its natural size, and kicks off a trace.
   Takes the File chosen through the drop zone or file input; returns nothing. */
async function onFile(file){
  try{
    validateFile(file)
  }catch(err){
    error.value = errText(err)
    return
  }
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.onload = () => {
    clear()
    error.value = ''
    // measured before the source lands, so the guide's request reaches the worker
    // ahead of the first trace rather than queueing behind it
    analyze(file).then(s => (stats.value = s)).catch(() => (stats.value = null))
    source.value = {file, url, name: file.name, size: file.size, width: image.naturalWidth, height: image.naturalHeight}
  }
  image.onerror = () => {
    URL.revokeObjectURL(url)
    error.value = t.value.err.decodeFail
  }
  image.src = url
}

/* Drops the current image, its preview URL, its measurements and its trace.
   Takes nothing and returns nothing. */
function clear(){
  if(source.value) URL.revokeObjectURL(source.value.url)
  source.value = null
  result.value = null
  stats.value = null
}

let dirty = false

/* Traces the current image, coalescing option changes that arrive while a trace runs
   so a slider drag never queues more than one pending pass.
   Takes nothing and returns a Promise that settles when no work is left. */
async function run(){
  if(busy.value){
    dirty = true
    return
  }
  busy.value = true
  do{
    dirty = false
    const file = source.value?.file
    if(!file){
      result.value = null
      break
    }
    try{
      progress.value = 0
      result.value = await trace(file, opts, p => (progress.value = p))
      error.value = ''
    }catch(err){
      result.value = null
      error.value = errText(err)
    }
  }while(dirty)
  busy.value = false
}

watch([opts, source], run)

/* The traced SVG's file name, without the source image's extension.
   Takes nothing and returns the base name. */
const baseName = () => source.value.name.replace(/\.[^.]+$/, '') + t.value.vec.suffix

/* Saves the traced SVG next to the source image's name.
   Takes nothing and returns nothing. */
function download(){
  saveBlob(new Blob([svg.value], {type: 'image/svg+xml;charset=utf-8'}), `${baseName()}.svg`)
}

/* Puts the traced SVG markup on the clipboard and flashes the button label.
   Takes nothing and returns nothing. */
async function copy(){
  try{
    await navigator.clipboard.writeText(svg.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1600)
  }catch{
    error.value = t.value.err.clipboard
  }
}

/* Hands the traced SVG to the stylize tab.
   ponytail: a photo trace can be thousands of paths, which scribbles slowly — the
   presets aimed at icons (logo, mono) are the ones worth sending on.
   Takes nothing and returns nothing. */
function stylize(){
  if(svg.value) emit('stylize', baseName(), svg.value)
}
</script>

<template>
  <div class="wrap">
    <VectorInputPanel
      :source="source"
      :error="error"
      :stats="stats"
      :suggestion="suggestion"
      :applied="suggestionApplied"
      @file="onFile"
      @clear="clear"
      @apply="Object.assign(opts, suggestion.options)"
    />

    <section class="col col--stage">
      <p class="eyebrow">{{ t.vec.board }}</p>
      <div
        class="stage"
        :class="{empty: !source, 'stage--send': svg && view === 'vector'}"
        :data-hint="t.vec.emptyHint"
        :title="svg && view === 'vector' ? t.vec.stylizeHint : null"
        @click="view === 'vector' && stylize()"
      >
        <img v-if="source && view === 'original'" class="stage-art" :src="source.url" alt="">
        <div v-else-if="svg" class="stage-art" v-html="svg"></div>
        <div v-else-if="source" class="stage-wait">{{ percent }}</div>
        <div v-else class="stage-mark" v-html="mark" aria-hidden="true"></div>
        <div v-if="busy && result" class="stage-badge">{{ percent }}</div>
      </div>
      <div class="stage-meta">
        <span>{{ source?.name ?? '—' }}</span>
        <span>{{ meta }}</span>
      </div>

      <div class="presets presets--view">
        <button type="button" class="chip" :class="{on: view === 'vector'}" @click="view = 'vector'">{{ t.vec.viewVector }}</button>
        <button type="button" class="chip" :class="{on: view === 'original'}" :disabled="!source" @click="view = 'original'">{{ t.vec.viewOriginal }}</button>
      </div>

      <div class="divider"></div>

      <p class="eyebrow">{{ t.vec.imageType }}</p>
      <div class="presets">
        <button
          v-for="p in presets"
          :key="p"
          type="button"
          class="chip"
          :class="{on: activePreset === p}"
          @click="Object.assign(opts, PRESETS[p])"
        >{{ t.vec.presets[p] }}</button>
      </div>
    </section>

    <VectorControlsPanel
      :opts="opts"
      :can-export="!!svg"
      :copied="copied"
      @download="download"
      @copy="copy"
      @stylize="stylize"
    />
  </div>
</template>
