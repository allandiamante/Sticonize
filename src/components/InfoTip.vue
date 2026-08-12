<script setup>
defineProps({ tip: String })
</script>

<!-- The balloon anchors to the row, not to this 15px box, so it can span the column's
     width without overflowing it — see .ctrl-head/.check-row position:relative. -->
<template>
  <span class="info" tabindex="0">
    <span aria-hidden="true">?</span>
    <span class="tip">{{ tip }}</span>
  </span>
</template>
