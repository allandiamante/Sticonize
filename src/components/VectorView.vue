<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import VectorInputPanel from './VectorInputPanel.vue'
import VectorControlsPanel from './VectorControlsPanel.vue'
import { trace, refine, validateFile, withBackground, editPaths, swapFills, shapeFills, countPaths, countColors, formatBytes, recordEdit, sealEdit, undoEdit, PRESETS } from '../vector.js'
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
// the step a refine pass is on, '' when the fast trace is running or nothing is
const phase = ref('')

const opts = reactive({...PRESETS.auto, maxSide: 1024, colors: 8, threshold: 0, background: 'transparent'})

// both start tucked away. The board is what the page is for, and the tuning column is a
// wall of sliders no one needs open to drop an image and look at what came back.
const showOptions = ref(false)
const showPresets = ref(false)

const presets = Object.keys(PRESETS)
const activePreset = computed(() =>
  presets.find(n => Object.entries(PRESETS[n]).every(([k, v]) => opts[k] === v))
)

const edits = reactive({})
const swaps = reactive({})
const selected = ref(null)
const editCount = computed(() => Object.keys(edits).length)
const swapCount = computed(() => Object.keys(swaps).length)

// one entry per shape edit or palette swap, in the order they happened — each records
// which reactive map it touched and what was there before, so undo just puts it back
const history = []

// the indices and the colours only mean anything against the trace they were made on
watch(result, () => {
  selected.value = null
  for(const k of Object.keys(edits)) delete edits[k]
  for(const k of Object.keys(swaps)) delete swaps[k]
  history.length = 0
})

/* Ctrl/Cmd+Z undoes the last edit or swap; browsers have no native undo to fight here
   since the board isn't an editable text field. */
function onKeydown(e){
  if(!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return
  e.preventDefault()
  undoEdit(history)
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// the palette swaps come first and the per-shape edits are laid over them, so recolouring
// a whole colour never undoes a shape someone painted by hand
const recolored = computed(() => result.value && swapFills(result.value.svg, swaps))

// what gets exported: the edits, and nothing about what is selected on screen
const edited = computed(() => recolored.value && editPaths(recolored.value, edits))
const svg = computed(() => edited.value && withBackground(edited.value, opts.background))

// what gets drawn: the same, plus the index tags a click reads and the selection mark
const board = computed(() =>
  recolored.value && withBackground(editPaths(recolored.value, edits, true, selected.value), opts.background))

// the palette as the trace produced it — what a swap is keyed on, whatever it now draws as
const palette = computed(() => result.value?.palette ?? [])

const fills = computed(() => recolored.value ? shapeFills(recolored.value) : [])
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
  recordEdit(history, edits, selected.value)
  edits[selected.value] = {...edits[selected.value], fill}
}

/* Ends the step a colour picker was holding open, so the next drag undoes on its own.
   Takes nothing; returns nothing. */
function endPick(){
  sealEdit(history)
}

/* Drops the selected shape from the drawing and clears the selection.
   Takes nothing; returns nothing. */
function dropSelected(){
  // a delete is one deliberate click, never part of the drag that may have preceded it
  sealEdit(history)
  recordEdit(history, edits, selected.value)
  sealEdit(history)
  edits[selected.value] = {...edits[selected.value], removed: true}
  selected.value = null
}

/* Puts every edited shape back the way the trace left it.
   Takes nothing; returns nothing. */
function resetEdits(){
  for(const k of Object.keys(edits)) delete edits[k]
  selected.value = null
  history.length = 0
}

/* Redraws one of the palette's colours everywhere it appears.
   Takes the colour as the trace produced it and the colour to draw it in; setting it back
   to what it was drops the swap rather than recording one. Returns nothing. */
function swapColor(from, to){
  const next = to.toLowerCase()
  recordEdit(history, swaps, from)
  if(next === from) delete swaps[from]
  else swaps[from] = next
}

/* Puts every swapped colour back the way the trace produced it.
   Takes nothing; returns nothing. */
function resetColors(){
  for(const k of Object.keys(swaps)) delete swaps[k]
  history.length = 0
}

const meta = computed(() => {
  if(!result.value) return '—'
  const out = svg.value
  const line = t.value.vec.meta(
    // counted before the background, whose rect would otherwise read as a traced colour
    countColors(edited.value), countPaths(out),
    result.value.width, result.value.height,
    formatBytes(out.length), (result.value.ms / 1000).toFixed(1)
  )
  // a minute of work is worth saying out loud, not least because touching any option
  // re-traces the fast way and drops it
  const parts = [line]
  if(result.value.refined) parts.push(t.value.vec.refined)
  // there is no other sign the board is zoomed once the drawing fills it
  if(zoom.value !== 1) parts.push(`${Math.round(zoom.value * 100)}%`)
  return parts.join(' · ')
})

// what the board says while it waits: the refine pass names its step, the fast trace has
// nothing to report between starting and landing
const waiting = computed(() => phase.value ? t.value.vec.phases[phase.value] : t.value.vec.tracing)

/* How far in the board goes. Past about sixteen times a traced shape is a wall of colour
   with its edges off screen, which is no longer looking closely at anything. */
const ZOOM_MAX = 16

const zoom = ref(1)
const pan = reactive({x: 0, y: 0})

// a new image starts fitted to the frame
watch(source, resetZoom)

/* Puts the board back to fitting the frame.
   Takes nothing; returns nothing. */
function resetZoom(){
  zoom.value = 1
  pan.x = pan.y = 0
}

/* Zooms the board around the pointer, so the detail being looked at stays under the
   cursor instead of sliding off while it grows. That anchoring is also what stands in for
   dragging: zoom out, move the pointer, zoom back in somewhere else.
   Takes the WheelEvent; returns nothing. */
function onWheel(e){
  // a wheel notch is ~100 in pixels, ~3 in lines, 1 in pages — Firefox reports lines on
  // most mice, and taking deltaY raw there moves the zoom by a third of a percent
  const step = e.deltaMode === 1 ? e.deltaY * 16
             : e.deltaMode === 2 ? e.deltaY * 400
             : e.deltaY
  const next = Math.min(Math.max(zoom.value * Math.exp(-step / 400), 1), ZOOM_MAX)
  if(next === zoom.value) return
  // all the way back out is the reset: the offset has nowhere to be when nothing is
  // cropped, and leaving it would park a fitted drawing off centre
  if(next === 1) return resetZoom()

  const r = e.currentTarget.getBoundingClientRect()
  const cx = e.clientX - r.left - r.width / 2
  const cy = e.clientY - r.top - r.height / 2
  const k = next / zoom.value
  pan.x = cx - (cx - pan.x) * k
  pan.y = cy - (cy - pan.y) * k
  zoom.value = next
}

/* The board's transform, and the scale the stylesheet divides the selection outline by —
   a hairline is only a hairline until the whole drawing is scaled sixteen times with it. */
const art = computed(() => ({
  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom.value})`,
  '--zoom': zoom.value
}))

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

/* Traces the current image the slow way — seconds where the preview takes tenths, so it
   is never set off by an option change, only by the button, and never while something
   else is running.
   Takes nothing and returns a Promise that settles when the pass lands or fails. */
async function runRefine(){
  if(busy.value || !source.value) return
  busy.value = true
  phase.value = 'reading'
  try{
    result.value = await refine(source.value.file, opts, p => (phase.value = p))
    error.value = ''
  }catch(err){
    error.value = errText(err)
  }
  phase.value = ''
  busy.value = false
  // options moved while it ran, so the preview owes the panel a pass at the new settings
  if(dirty) run()
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
  <div class="wrap" :class="{'wrap--tucked': !showOptions}">
    <VectorInputPanel
      :source="source"
      :error="error"
      :colors="opts.colors"
      :tone="opts.tone"
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
        @wheel.prevent="source && onWheel($event)"
      >
        <img v-if="source && view === 'original'" class="stage-art" :src="source.url" :style="art" alt="">
        <div v-else-if="board" class="stage-art" :style="art" v-html="board"></div>
        <div v-else-if="source" class="stage-wait">{{ waiting }}</div>
        <div v-else class="stage-mark" v-html="mark" aria-hidden="true"></div>
        <div v-if="busy && result" class="stage-badge">{{ waiting }}</div>
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
          <input type="color" :value="selectedFill" @input="paintSelected($event.target.value)" @change="endPick">
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

      <!-- the palette, under the drawing it belongs to. Swapping an entry repaints every
           shape carrying it, which on a trace is hundreds of them. It stays one step
           behind while a new trace runs — dimmed rather than hidden, which would make the
           column jump on every step of the colour slider. -->
      <template v-if="source">
        <div v-if="palette.length" class="shape-bar palette" :class="{stale: busy}">
          <label
            v-for="c in palette"
            :key="c"
            class="shape-swatch"
            :title="t.vec.paletteColor"
          >
            <span :style="{background: swaps[c] ?? c}"></span>
            <input type="color" :value="swaps[c] ?? c" @input="swapColor(c, $event.target.value)" @change="endPick">
          </label>
          <button v-if="swapCount" type="button" class="chip" @click="resetColors">{{ t.vec.resetColors }}</button>
        </div>
        <p v-else class="shape-hint">{{ t.vec.reading }}</p>
        <p v-if="palette.length" class="shape-hint">{{ t.vec.paletteHint }}</p>
      </template>

      <div class="presets presets--view">
        <button type="button" class="chip" :class="{on: view === 'vector'}" @click="view = 'vector'">{{ t.vec.viewVector }}</button>
        <button type="button" class="chip" :class="{on: view === 'original'}" :disabled="!source" @click="view = 'original'">{{ t.vec.viewOriginal }}</button>
      </div>

      <div class="divider"></div>

      <p class="eyebrow">
        {{ t.vec.imageType }}
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
          @click="Object.assign(opts, PRESETS[p])"
        >{{ t.vec.presets[p] }}</button>
      </div>
    </section>

    <VectorControlsPanel
      :opts="opts"
      :can-export="!!svg"
      :copied="copied"
      :refining="!!phase"
      :can-refine="!!source && !busy"
      :open="showOptions"
      @download="download"
      @copy="copy"
      @stylize="stylize"
      @refine="runRefine"
      @toggle="showOptions = !showOptions"
    />
  </div>
</template>
