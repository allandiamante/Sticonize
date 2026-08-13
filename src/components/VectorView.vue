<script setup>
import { computed, reactive, ref, watch } from 'vue'
import VectorInputPanel from './VectorInputPanel.vue'
import VectorControlsPanel from './VectorControlsPanel.vue'
import { trace, validateFile, withBackground, editPaths, shapeFills, countPaths, countColors, formatBytes, PRESETS } from '../vector.js'
import { saveBlob } from '../scribble.js'
import { t, errText } from '../i18n.js'

defineProps({ mark: String })
const emit = defineEmits(['stylize'])

const source = ref(null)
const result = ref(null)
const error = ref('')
const busy = ref(false)
const view = ref('vector')
const copied = ref(false)

const opts = reactive({...PRESETS.auto, maxSide: 1024, colors: 8, background: 'transparent'})

const presets = Object.keys(PRESETS)
const activePreset = computed(() =>
  presets.find(n => Object.entries(PRESETS[n]).every(([k, v]) => opts[k] === v))
)

const edits = reactive({})
const selected = ref(null)
const editCount = computed(() => Object.keys(edits).length)

// the indices only mean anything against the trace they were made on
watch(result, () => {
  selected.value = null
  for(const k of Object.keys(edits)) delete edits[k]
})

// what gets exported: the edits, and nothing about what is selected on screen
const edited = computed(() => result.value && editPaths(result.value.svg, edits))
const svg = computed(() => edited.value && withBackground(edited.value, opts.background))

// what gets drawn: the same, plus the index tags a click reads and the selection mark
const board = computed(() =>
  result.value && withBackground(editPaths(result.value.svg, edits, true, selected.value), opts.background))

const palette = computed(() => result.value?.palette ?? [])

const fills = computed(() => result.value ? shapeFills(result.value.svg) : [])
const selectedFill = computed(() =>
  selected.value === null ? null : edits[selected.value]?.fill ?? fills.value[selected.value])

/* Selects the shape under the pointer, or clears the selection when the click lands on
   the background instead of a shape.
   Takes the click event; returns nothing. */
function onStagePick(e){
  const shape = e.target.closest?.('path[data-shape]')
  selected.value = shape ? Number(shape.dataset.shape) : null
}

/* Repaints the selected shape.
   Takes a CSS colour; returns nothing. */
function paintSelected(fill){
  edits[selected.value] = {...edits[selected.value], fill}
}

/* Drops the selected shape from the drawing and clears the selection.
   Takes nothing; returns nothing. */
function dropSelected(){
  edits[selected.value] = {...edits[selected.value], removed: true}
  selected.value = null
}

/* Puts every edited shape back the way the trace left it.
   Takes nothing; returns nothing. */
function resetEdits(){
  for(const k of Object.keys(edits)) delete edits[k]
  selected.value = null
}

const meta = computed(() => {
  if(!result.value) return '—'
  const out = svg.value
  return t.value.vec.meta(
    // counted before the background, whose rect would otherwise read as a traced colour
    countColors(edited.value), countPaths(out),
    result.value.width, result.value.height,
    formatBytes(out.length), (result.value.ms / 1000).toFixed(1)
  )
})

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
      result.value = await trace(file, opts)
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
      :colors="opts.colors"
      :palette="palette"
      :busy="busy"
      @file="onFile"
      @clear="clear"
      @colors="opts.colors = $event"
    />

    <section class="col col--stage">
      <p class="eyebrow">{{ t.vec.board }}</p>
      <div
        class="stage"
        :class="{empty: !source, 'stage--edit': board && view === 'vector'}"
        :data-hint="t.vec.emptyHint"
        @click="view === 'vector' && onStagePick($event)"
      >
        <img v-if="source && view === 'original'" class="stage-art" :src="source.url" alt="">
        <div v-else-if="board" class="stage-art" v-html="board"></div>
        <div v-else-if="source" class="stage-wait">{{ t.vec.tracing }}</div>
        <div v-else class="stage-mark" v-html="mark" aria-hidden="true"></div>
        <div v-if="busy && result" class="stage-badge">{{ t.vec.tracing }}</div>
      </div>
      <div class="stage-meta">
        <span>{{ source?.name ?? '—' }}</span>
        <span>{{ meta }}</span>
      </div>

      <!-- shape editing: a pointer-driven affordance, so the actions live as real
           buttons here rather than only as clicks on the drawing -->
      <div v-if="selected !== null" class="shape-bar">
        <label class="shape-swatch" :title="t.vec.shapeColor">
          <span :style="{background: selectedFill}"></span>
          <input type="color" :value="selectedFill" @input="paintSelected($event.target.value)">
        </label>
        <span class="shape-id">{{ selectedFill }}</span>
        <button type="button" class="chip" @click="dropSelected">{{ t.vec.deleteShape }}</button>
        <button type="button" class="chip" @click="selected = null">{{ t.vec.deselect }}</button>
      </div>
      <div v-else-if="editCount" class="shape-bar">
        <span class="shape-id">{{ t.vec.edited(editCount) }}</span>
        <button type="button" class="chip" @click="resetEdits">{{ t.vec.resetEdits }}</button>
      </div>
      <p v-else-if="board && view === 'vector'" class="shape-hint">{{ t.vec.editHint }}</p>

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
