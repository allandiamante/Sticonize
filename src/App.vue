<script setup>
import AppHeader from './components/AppHeader.vue'
import ScribbleView from './components/ScribbleView.vue'
import VectorView from './components/VectorView.vue'
import { page } from './router.js'
import logo from './public/sticonize-logo.svg?raw'

const mark = logo
  .replace(/#14181A/gi, 'currentColor')
  .replace(/viewBox="[^"]*"/, 'viewBox="83 83 89 89"')

// both pages stay mounted (v-show, not v-if): navigating must not throw away a queue
// of icons or a trace that took seconds to compute
</script>

<template>
  <AppHeader :mark="mark" />
  <ScribbleView v-show="page === 'scribble'" :mark="mark" />
  <VectorView v-show="page === 'vector'" :mark="mark" />
</template>
