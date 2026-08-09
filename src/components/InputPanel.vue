<script setup>
import { ref, watch } from 'vue'
import { t } from '../i18n.js'

defineProps({ items: Array, active: Number })
const emit = defineEmits(['files', 'paste', 'pick', 'select', 'remove'])

const hot = ref(false)
const showPaste = ref(false)
const pasteArea = ref(null)

function togglePaste(){
  showPaste.value = !showPaste.value
  if(showPaste.value) requestAnimationFrame(() => pasteArea.value?.focus())
}

function onDrop(e){
  hot.value = false
  if(e.dataTransfer?.files) emit('files', e.dataTransfer.files)
}

const query = ref('')
const found = ref([])
const failed = ref(false)
let timer

const iconUrl = (id, color) => `https://api.iconify.design/${id.replace(':', '/')}.svg` + (color ? `?color=${color}` : '')

watch(query, s => {
  clearTimeout(timer)
  failed.value = false
  s = s.trim()
  if(s.length < 2) return (found.value = [])
  timer = setTimeout(async () => {
    try{
      const r = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(s)}&limit=48`)
      if(!r.ok) throw new Error(r.status)   // fetch only rejects on network error; 5xx arrives as a normal response
      const data = await r.json()
      if(query.value.trim() !== s) return   
      found.value = data.icons ?? []
    }catch{
      failed.value = true
      found.value = []
    }
  }, 300)
})

async function pick(id){
  try{
    const r = await fetch(iconUrl(id))
    if(!r.ok) throw new Error(r.status)   // without this the gateway's error page goes downstream as if it were the icon
    emit('pick', id.replace(':', '-'), await r.text(), id)
  }catch{
    failed.value = true
  }
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
      <strong>{{ t.dropTitle }}</strong>
      <span>{{ t.dropHint }}</span>
      <input type="file" accept="image/svg+xml,.svg" multiple @change="emit('files', $event.target.files)">
    </label>

    <p class="note">{{ t.note[0] }}<em>{{ t.fill.none }}</em>{{ t.note[1] }}<em>{{ t.fill.hachure }}</em>{{ t.note[2] }}</p>

    <button class="paste-toggle" type="button" @click="togglePaste">{{ t.pasteToggle }}</button>
    <textarea
      v-show="showPaste"
      ref="pasteArea"
      placeholder='<svg viewBox="0 0 24 24">…</svg>'
      @input="emit('paste', $event.target.value.trim())"
    ></textarea>

    <p class="eyebrow eyebrow--gap">
      {{ t.iconify }}
      <a class="icon-link" href="https://iconify.design" target="_blank" rel="noopener" :title="t.iconifyLink">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2.857 19.429V9.642q.35-.089.67-.295l1.616-1.045v9.984h4.571v2.285H4c-.63 0-1.143-.512-1.143-1.142m7.429-8.572a1.715 1.715 0 1 1 3.43.001a1.715 1.715 0 0 1-3.43 0m-5.143-8V1.143a1.143 1.143 0 0 1 2.286 0v.235zm9.143 15.429h4.571V8.302l1.616 1.045q.32.206.67.295v9.787c0 .63-.512 1.143-1.143 1.143h-5.714Zm-.004-17.028l8.053 5.211a1.144 1.144 0 0 1-1.242 1.919l-8.041-5.203l.19-.123a2.28 2.28 0 0 0 1.04-1.804M11.38.183a1.144 1.144 0 0 1 1.242 1.92L2.907 8.387a1.144 1.144 0 0 1-1.242-1.919Zm2.6 22.103H22c.473 0 .857.384.857.857A.86.86 0 0 1 22 24H2a.86.86 0 0 1-.857-.857c0-.473.384-.857.857-.857h8.02a2.286 2.286 0 0 0 3.96 0m-.836-8.81v7.667a1.143 1.143 0 0 1-2.286 0v-7.667a2.85 2.85 0 0 0 1.143.238c.406 0 .793-.085 1.143-.238"/></svg>
        <span class="sr-only">{{ t.iconifyLink }}</span>
      </a>
    </p>
    <input class="search" type="search" v-model="query" :placeholder="t.iconifyHint">
    <p v-if="failed" class="search-msg search-msg--err">{{ t.iconifyFail }}</p>
    <p v-else-if="query.trim().length > 1 && !found.length" class="search-msg">{{ t.iconifyEmpty }}</p>
    <div v-else class="picks">
      <button
        v-for="id in found"
        :key="id"
        type="button"
        class="pick"
        :title="id"
        @click="pick(id)"
      >
        <img :src="iconUrl(id, '%23888888')" :alt="id" loading="lazy">
      </button>
    </div>

    <ul class="queue">
      <li
        v-for="(it, i) in items"
        :key="i"
        :class="{on: i === active}"
        @click="emit('select', i)"
      >
        <div class="thumb"><img :src="`data:image/svg+xml,${encodeURIComponent(it.text)}`" alt=""></div>
        <div class="nm" :title="it.name">{{ it.name }}</div>
        <button class="kill" type="button" :title="t.remove" @click.stop="emit('remove', i)">×</button>
      </li>
    </ul>
  </section>
</template>
