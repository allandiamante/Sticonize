<script setup>
import { ref } from 'vue'
import { FILL_STYLES } from '../scribble.js'
import InfoTip from './InfoTip.vue'
import { t } from '../i18n.js'

const props = defineProps({ opts: Object, canDownload: Boolean, count: Number, batch: String })
const emit = defineEmits(['download', 'downloadAll'])

const SWATCHES = ['#E8EDE9', '#14181A', '#7BA1E4', '#E4614A', '#4FA97A']
const pngSize = ref(1024)
const pngBg = ref('transparent')

const fmt = ref('svg')

const dice = () => { props.opts.seed = Math.floor(Math.random() * 100000) }
const size = () => Math.min(Math.max(parseInt(pngSize.value, 10) || 1024, 32), 4096)
const args = () => [fmt.value, size(), pngBg.value]
</script>

<template>
  <section class="col col--right">
    <p class="eyebrow">{{ t.tune }}</p>

    <div class="ctrl">
      <div class="ctrl-head"><label for="roughness">{{ t.roughness }}</label><output>{{ opts.roughness.toFixed(2) }}</output><InfoTip :tip="t.tips.roughness" /></div>
      <input id="roughness" type="range" min="0" max="2" step="0.05" v-model.number="opts.roughness">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="bowing">{{ t.bowing }}</label><output>{{ opts.bowing.toFixed(1) }}</output><InfoTip :tip="t.tips.bowing" /></div>
      <input id="bowing" type="range" min="0" max="6" step="0.1" v-model.number="opts.bowing">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="strokeWidth">{{ t.strokeWidth }}</label><output>{{ opts.strokeWidth.toFixed(2) }}</output><InfoTip :tip="t.tips.strokeWidth" /></div>
      <input id="strokeWidth" type="range" min="0.1" max="3" step="0.05" v-model.number="opts.strokeWidth">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="fillStyle">{{ t.fillStyle }}</label><InfoTip :tip="t.tips.fillStyle" /></div>
      <select id="fillStyle" v-model="opts.fillStyle">
        <option v-for="f in FILL_STYLES" :key="f" :value="f">{{ t.fill[f] }}</option>
      </select>
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="hachureGap">{{ t.hachureGap }}</label><output>{{ opts.hachureGap.toFixed(1) }}</output><InfoTip :tip="t.tips.hachureGap" /></div>
      <input id="hachureGap" type="range" min="0.4" max="8" step="0.1" v-model.number="opts.hachureGap">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="hachureAngle">{{ t.hachureAngle }}</label><output>{{ opts.hachureAngle.toFixed(0) }}°</output><InfoTip :tip="t.tips.hachureAngle" /></div>
      <input id="hachureAngle" type="range" min="-90" max="90" step="1" v-model.number="opts.hachureAngle">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="passes">{{ t.passes }}</label><InfoTip :tip="t.tips.passes" /></div>
      <div class="row2">
        <select id="passes" v-model.number="opts.passes">
          <option v-for="n in 3" :key="n" :value="n">{{ t.pass(n) }}</option>
        </select>
        <button class="chip" type="button" :title="t.diceTitle" style="width:100%" @click="dice">{{ t.dice }}</button>
      </div>
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label>{{ t.inkColor }}</label><InfoTip :tip="t.tips.inkColor" /></div>
      <div class="swatches">
        <button
          v-for="c in SWATCHES"
          :key="c"
          type="button"
          class="sw"
          :class="{on: opts.color.toLowerCase() === c.toLowerCase()}"
          :style="{background: c}"
          @click="opts.color = c"
        ></button>
        <input type="color" :title="t.customColor" v-model="opts.color">
      </div>
    </div>

    <div class="divider"></div>
    <p class="eyebrow">{{ t.output }}</p>

    <div class="ctrl">
      <div class="ctrl-head"><label for="pngSize">{{ t.pngSize }}</label><InfoTip :tip="t.tips.pngSize" /></div>
      <div class="row2">
        <input id="pngSize" type="number" min="32" max="4096" step="16" v-model="pngSize">
        <select v-model="pngBg">
          <option value="transparent">{{ t.bgTransparent }}</option>
          <option value="#ffffff">{{ t.bgWhite }}</option>
          <option value="#14181A">{{ t.bgDark }}</option>
        </select>
      </div>
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="fmt">{{ t.format }}</label><InfoTip :tip="t.tips.format" /></div>
      <select id="fmt" v-model="fmt">
        <option v-for="(label, k) in t.formats" :key="k" :value="k">{{ label }}</option>
      </select>
    </div>

    <button class="btn" :disabled="!canDownload || !!batch" @click="emit('download', ...args())">{{ t.download }}</button>
    <button
      v-if="count > 1"
      class="btn btn--ghost"
      :disabled="!!batch"
      @click="emit('downloadAll', ...args())"
    >{{ batch || t.downloadAll(count) }}</button>
  </section>
</template>
