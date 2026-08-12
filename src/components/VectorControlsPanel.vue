<script setup>
import { SAMPLING, WORK_SIZES } from '../vector.js'
import { t } from '../i18n.js'
import InfoTip from './InfoTip.vue'

defineProps({ opts: Object, canExport: Boolean, copied: Boolean })
const emit = defineEmits(['download', 'copy', 'stylize'])

const BACKGROUNDS = ['transparent', '#FFFFFF', '#14181A', '#EFF2ED']
</script>

<template>
  <section class="col col--right">
    <p class="eyebrow">{{ t.vec.resolution }}</p>

    <div class="ctrl">
      <div class="ctrl-head"><label for="maxSide">{{ t.vec.workingSize }}</label><InfoTip :tip="t.vec.tips.workingSize" /></div>
      <select id="maxSide" v-model.number="opts.maxSide">
        <option v-for="s in WORK_SIZES" :key="s" :value="s">{{ t.vec.workingSizeOpt(s) }}</option>
      </select>
    </div>

    <div class="divider"></div>
    <p class="eyebrow">{{ t.vec.detail }}</p>

    <div class="ctrl">
      <div class="ctrl-head"><label for="lineThreshold">{{ t.vec.lineThreshold }}</label><output>{{ opts.lineThreshold.toFixed(2) }}</output><InfoTip :tip="t.vec.tips.lineThreshold" /></div>
      <input id="lineThreshold" type="range" min="0.01" max="10" step="0.01" v-model.number="opts.lineThreshold">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="curveThreshold">{{ t.vec.curveThreshold }}</label><output>{{ opts.curveThreshold.toFixed(2) }}</output><InfoTip :tip="t.vec.tips.curveThreshold" /></div>
      <input id="curveThreshold" type="range" min="0.01" max="10" step="0.01" v-model.number="opts.curveThreshold">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="despeckle">{{ t.vec.despeckle }}</label><output>{{ opts.despeckle }} px</output><InfoTip :tip="t.vec.tips.despeckle" /></div>
      <input id="despeckle" type="range" min="0" max="32" step="1" v-model.number="opts.despeckle">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="blur">{{ t.vec.blur }}</label><output>{{ opts.blur }}</output><InfoTip :tip="t.vec.tips.blur" /></div>
      <input id="blur" type="range" min="0" max="5" step="1" v-model.number="opts.blur">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="precision">{{ t.vec.precision }}</label><output>{{ opts.precision }}</output><InfoTip :tip="t.vec.tips.precision" /></div>
      <input id="precision" type="range" min="0" max="3" step="1" v-model.number="opts.precision">
    </div>

    <div class="check-row">
      <label class="check"><input type="checkbox" v-model="opts.sharpCorners"> {{ t.vec.sharpCorners }}</label>
      <InfoTip :tip="t.vec.tips.sharpCorners" />
    </div>
    <div class="check-row">
      <label class="check"><input type="checkbox" v-model="opts.dropTinyPaths"> {{ t.vec.dropTinyPaths }}</label>
      <InfoTip :tip="t.vec.tips.dropTinyPaths" />
    </div>

    <div class="divider"></div>
    <p class="eyebrow">{{ t.vec.palette }}</p>

    <div class="ctrl">
      <div class="ctrl-head"><label for="colors">{{ t.vec.colors }}</label><output>{{ opts.colors }}</output><InfoTip :tip="t.vec.tips.colors" /></div>
      <input id="colors" type="range" min="2" max="64" step="1" v-model.number="opts.colors">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="cycles">{{ t.vec.cycles }}</label><output>{{ opts.cycles }}</output><InfoTip :tip="t.vec.tips.cycles" /></div>
      <input id="cycles" type="range" min="1" max="10" step="1" v-model.number="opts.cycles">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="minRatio">{{ t.vec.minRatio }}</label><output>{{ (opts.minRatio * 100).toFixed(1) }}%</output><InfoTip :tip="t.vec.tips.minRatio" /></div>
      <input id="minRatio" type="range" min="0" max="0.1" step="0.005" v-model.number="opts.minRatio">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="sampling">{{ t.vec.sampling }}</label><InfoTip :tip="t.vec.tips.sampling" /></div>
      <select id="sampling" v-model.number="opts.sampling">
        <option v-for="s in SAMPLING" :key="s" :value="s">{{ t.vec.samplings[s] }}</option>
      </select>
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="strokeWidth">{{ t.vec.seam }}</label><output>{{ opts.strokeWidth.toFixed(1) }}</output><InfoTip :tip="t.vec.tips.seam" /></div>
      <input id="strokeWidth" type="range" min="0" max="3" step="0.5" v-model.number="opts.strokeWidth">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label>{{ t.vec.background }}</label><InfoTip :tip="t.vec.tips.background" /></div>
      <div class="swatches">
        <button
          v-for="c in BACKGROUNDS"
          :key="c"
          type="button"
          class="sw"
          :class="{on: opts.background === c, 'sw--none': c === 'transparent'}"
          :style="c === 'transparent' ? null : {background: c}"
          :title="c === 'transparent' ? t.vec.bgTransparent : c"
          @click="opts.background = c"
        ></button>
        <input type="color" :title="t.vec.customBg" :value="opts.background === 'transparent' ? '#ffffff' : opts.background" @input="opts.background = $event.target.value">
      </div>
    </div>

    <div class="divider"></div>
    <p class="eyebrow">{{ t.vec.output }}</p>

    <button class="btn" :disabled="!canExport" @click="emit('download')">{{ t.vec.download }}</button>
    <button class="btn btn--ghost" :disabled="!canExport" @click="emit('copy')">{{ copied ? t.vec.copied : t.vec.copy }}</button>
    <button class="btn btn--ghost" :disabled="!canExport" @click="emit('stylize')">{{ t.vec.stylize }}</button>
  </section>
</template>
