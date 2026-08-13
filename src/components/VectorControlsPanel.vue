<script setup>
import { MODES, STACKING, TONES, WORK_SIZES, MAX_COLOR_PRECISION, MAX_THRESHOLD } from '../vector.js'
import { t } from '../i18n.js'
import InfoTip from './InfoTip.vue'

defineProps({ opts: Object, canExport: Boolean, copied: Boolean, refining: Boolean, canRefine: Boolean })
const emit = defineEmits(['download', 'copy', 'stylize', 'refine'])

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
    <p class="eyebrow">{{ t.vec.shape }}</p>

    <div class="ctrl">
      <div class="ctrl-head"><label for="mode">{{ t.vec.mode }}</label><InfoTip :tip="t.vec.tips.mode" /></div>
      <select id="mode" v-model="opts.mode">
        <option v-for="m in MODES" :key="m" :value="m">{{ t.vec.modes[m] }}</option>
      </select>
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="hierarchical">{{ t.vec.stacking }}</label><InfoTip :tip="t.vec.tips.stacking" /></div>
      <select id="hierarchical" v-model="opts.hierarchical">
        <option v-for="h in STACKING" :key="h" :value="h">{{ t.vec.stackings[h] }}</option>
      </select>
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="cornerThreshold">{{ t.vec.cornerThreshold }}</label><output>{{ opts.cornerThreshold }}°</output><InfoTip :tip="t.vec.tips.cornerThreshold" /></div>
      <input id="cornerThreshold" type="range" min="0" max="180" step="1" v-model.number="opts.cornerThreshold">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="lengthThreshold">{{ t.vec.lengthThreshold }}</label><output>{{ opts.lengthThreshold.toFixed(1) }}</output><InfoTip :tip="t.vec.tips.lengthThreshold" /></div>
      <input id="lengthThreshold" type="range" min="3.5" max="10" step="0.5" v-model.number="opts.lengthThreshold">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="spliceThreshold">{{ t.vec.spliceThreshold }}</label><output>{{ opts.spliceThreshold }}°</output><InfoTip :tip="t.vec.tips.spliceThreshold" /></div>
      <input id="spliceThreshold" type="range" min="0" max="180" step="1" v-model.number="opts.spliceThreshold">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="maxIterations">{{ t.vec.maxIterations }}</label><output>{{ opts.maxIterations }}</output><InfoTip :tip="t.vec.tips.maxIterations" /></div>
      <input id="maxIterations" type="range" min="1" max="20" step="1" v-model.number="opts.maxIterations">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="pathPrecision">{{ t.vec.pathPrecision }}</label><output>{{ opts.pathPrecision }}</output><InfoTip :tip="t.vec.tips.pathPrecision" /></div>
      <input id="pathPrecision" type="range" min="0" max="8" step="1" v-model.number="opts.pathPrecision">
    </div>

    <div class="divider"></div>
    <p class="eyebrow">{{ t.vec.palette }}</p>

    <div class="ctrl">
      <div class="ctrl-head"><label for="tone">{{ t.vec.tone }}</label><InfoTip :tip="t.vec.tips.tone" /></div>
      <select id="tone" v-model="opts.tone">
        <option v-for="x in TONES" :key="x" :value="x">{{ t.vec.tones[x] }}</option>
      </select>
    </div>

    <!-- the cut is read off the image, so this only exists to move it: no slider at all
         would leave no way to say which side of a shadow the subject is on -->
    <div v-if="opts.tone === 'mono'" class="ctrl">
      <div class="ctrl-head"><label for="threshold">{{ t.vec.threshold }}</label><output>{{ opts.threshold > 0 ? '+' : '' }}{{ opts.threshold }}</output><InfoTip :tip="t.vec.tips.threshold" /></div>
      <input id="threshold" type="range" :min="-MAX_THRESHOLD" :max="MAX_THRESHOLD" step="1" v-model.number="opts.threshold">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="colorPrecision">{{ t.vec.colorPrecision }}</label><output>{{ opts.colorPrecision }}</output><InfoTip :tip="t.vec.tips.colorPrecision" /></div>
      <input id="colorPrecision" type="range" min="1" :max="MAX_COLOR_PRECISION" step="1" :disabled="opts.tone === 'mono'" v-model.number="opts.colorPrecision">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="layerDifference">{{ t.vec.layerDifference }}</label><output>{{ opts.layerDifference }}</output><InfoTip :tip="t.vec.tips.layerDifference" /></div>
      <input id="layerDifference" type="range" min="0" max="128" step="1" :disabled="opts.tone === 'mono'" v-model.number="opts.layerDifference">
    </div>

    <div class="ctrl">
      <div class="ctrl-head"><label for="filterSpeckle">{{ t.vec.filterSpeckle }}</label><output>{{ opts.filterSpeckle }} px</output><InfoTip :tip="t.vec.tips.filterSpeckle" /></div>
      <input id="filterSpeckle" type="range" min="0" max="128" step="1" v-model.number="opts.filterSpeckle">
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
    <p class="eyebrow">{{ t.vec.refineTitle }}</p>

    <button class="btn" :disabled="!canRefine" @click="emit('refine')">
      {{ refining ? t.vec.refineBusy : t.vec.refineRun }}
    </button>
    <p class="note">{{ t.vec.refineNote }}</p>

    <div class="divider"></div>
    <p class="eyebrow">{{ t.vec.output }}</p>

    <button class="btn" :disabled="!canExport" @click="emit('download')">{{ t.vec.download }}</button>
    <button class="btn btn--ghost" :disabled="!canExport" @click="emit('copy')">{{ copied ? t.vec.copied : t.vec.copy }}</button>
    <button class="btn btn--ghost" :disabled="!canExport" @click="emit('stylize')">{{ t.vec.stylize }}</button>
  </section>
</template>
