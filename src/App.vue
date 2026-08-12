<script setup>
import AppHeader from './components/AppHeader.vue'
import ScribbleView from './components/ScribbleView.vue'
import VectorView from './components/VectorView.vue'
import { page, go } from './router.js'
import logo from './public/sticonize-logo.svg?raw'
import { ref } from 'vue'

const mark = logo
  .replace(/#14181A/gi, 'currentColor')
  .replace(/viewBox="[^"]*"/, 'viewBox="83 83 89 89"')

const scribble = ref(null)

// both pages stay mounted (v-show, not v-if): navigating must not throw away a queue
// of icons or a trace that took seconds to compute
/* Queues a traced SVG on the stylize page and navigates there.
   Takes the file's base name and its SVG markup; returns nothing. */
function stylize(name, text){
  go('scribble')
  scribble.value.add(name, text)
}
</script>

<template>
  <AppHeader :mark="mark" />
  <ScribbleView ref="scribble" v-show="page === 'scribble'" :mark="mark" />
  <VectorView v-show="page === 'vector'" :mark="mark" @stylize="stylize" />
</template>
