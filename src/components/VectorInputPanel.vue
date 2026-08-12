<script setup>
import { ref } from 'vue'
import { ACCEPTED_TYPES, MAX_BYTES, formatBytes } from '../vector.js'
import { t } from '../i18n.js'

defineProps({ source: Object, error: String, stats: Object, suggestion: Object, applied: Boolean })
const emit = defineEmits(['file', 'clear', 'apply'])

const hot = ref(false)

/* Formats a 0..1 ratio for the measurement list.
   Takes the ratio and returns a rounded percentage string. */
const pct = n => `${Math.round(n * 100)}%`

/* Forwards the first dropped file and clears the drag highlight.
   Takes the DragEvent; returns nothing. */
function onDrop(e){
  hot.value = false
  const file = e.dataTransfer?.files?.[0]
  if(file) emit('file', file)
}
</script>

<template>
  <section class="col col--left">
    <p class="eyebrow">
      {{ t.input }}
      <a class="icon-link" href="https://github.com/allandiamante/Sticonize" target="_blank" rel="noopener" :title="t.repoLink">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6c-.6-1.4-1.4-1.8-1.4-1.8c-1-.7.1-.7.1-.7c1.2.1 1.8 1.2 1.8 1.2c1 1.8 2.8 1.3 3.5 1c.1-.8.4-1.3.7-1.6c-2.7-.3-5.5-1.3-5.5-6c0-1.2.5-2.3 1.3-3.1c-.2-.4-.6-1.6.1-3.2c0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2c.7 1.6.2 2.8.1 3.2c.8.8 1.2 1.9 1.2 3.2c0 4.6-2.8 5.6-5.5 5.9c.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3"/></svg>
        <span class="sr-only">{{ t.repoLink }}</span>
      </a>
    </p>

    <label
      class="drop"
      :class="{hot}"
      @dragenter.prevent="hot = true"
      @dragover.prevent="hot = true"
      @dragleave.prevent="hot = false"
      @drop.prevent="onDrop"
    >
      <strong>{{ t.vec.dropTitle }}</strong>
      <span>{{ t.vec.dropHint(formatBytes(MAX_BYTES)) }}</span>
      <input type="file" :accept="ACCEPTED_TYPES.join(',')" @change="emit('file', $event.target.files[0]); $event.target.value = ''">
    </label>

    <p v-if="error" class="search-msg search-msg--err">{{ error }}</p>

    <div v-if="source" class="source">
      <div class="thumb"><img :src="source.url" alt=""></div>
      <div class="source-info">
        <div class="nm" :title="source.name">{{ source.name }}</div>
        <div class="dim">{{ source.width }}×{{ source.height }} · {{ formatBytes(source.size) }}</div>
      </div>
      <button class="kill" type="button" :title="t.vec.remove" @click="emit('clear')">×</button>
    </div>

    <template v-if="source">
      <p class="eyebrow eyebrow--gap">{{ t.vec.suggested }}</p>

      <p v-if="!stats" class="search-msg">{{ t.vec.measuring }}</p>

      <div v-else class="guide">
        <dl class="guide-stats">
          <div><dt>{{ t.vec.tones }}</dt><dd>{{ stats.tones >= 40000 ? '40 000+' : stats.tones.toLocaleString('en') }}</dd></div>
          <div><dt>{{ t.vec.flatAreas }}</dt><dd>{{ pct(stats.flatRatio) }}</dd></div>
          <div><dt>{{ t.vec.edgePixels }}</dt><dd>{{ pct(stats.edgeRatio) }}</dd></div>
          <div><dt>{{ t.vec.transparency }}</dt><dd>{{ stats.alphaRatio >= 0.01 ? pct(stats.alphaRatio) : t.vec.none }}</dd></div>
        </dl>

        <p class="guide-note">{{ t.vec.notes[suggestion.note] }}</p>

        <p class="guide-pick">
          <span class="guide-preset">{{ t.vec.presets[suggestion.preset] }}</span>
          {{ t.vec.pick(suggestion.options.colors, suggestion.options.maxSide, suggestion.options.despeckle) }}
        </p>

        <button class="btn btn--ghost" type="button" :disabled="applied" @click="emit('apply')">
          {{ applied ? t.vec.applied : t.vec.apply }}
        </button>
      </div>
    </template>

    <p class="note">{{ t.vec.guideNote }}</p>

    <p class="eyebrow eyebrow--gap">{{ t.vec.privacy }}</p>
    <p class="note note--plain">{{ t.vec.privacyNote }}</p>
  </section>
</template>
