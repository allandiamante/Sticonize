<script setup>
import { t, lang, langs } from '../i18n.js'
import { theme, themes } from '../theme.js'
import { PATHS, page, go } from '../router.js'

defineProps({ mark: String })

const setLang = l => { lang.value = l }
const setTheme = x => { theme.value = x }

/* Numbers the tabs like sheets in a drawing set.
   Takes the tab's index and returns a zero-padded label. */
const sheet = i => String(i + 1).padStart(2, '0')
</script>

<template>
  <header class="masthead">
    <div class="brand">
      <div class="logo" v-html="mark" aria-hidden="true"></div>
      <div>
        <h1>{{ t.titlePre }}<em>{{ t.titleEm }}</em></h1>
        <p>{{ page === 'vector' ? t.vec.tagline : t.tagline }}</p>
      </div>
    </div>
    <div class="masthead-side">
      <div class="pills">
        <button
          v-for="l in langs"
          :key="l"
          type="button"
          class="chip"
          :class="{on: lang === l}"
          :aria-pressed="lang === l"
          @click="setLang(l)"
        >{{ l.toUpperCase() }}</button>
      </div>

      <div class="pills">
        <button
          v-for="x in themes"
          :key="x"
          type="button"
          class="chip chip--icon"
          :class="{on: theme === x}"
          :aria-pressed="theme === x"
          :title="t.theme[x]"
          :aria-label="t.theme[x]"
          @click="setTheme(x)"
        >{{ x === 'dark' ? '☾' : '☀' }}</button>
      </div>
      <div class="stamp">{{ page === 'vector' ? t.vec.stamp : t.stamp }}</div>
    </div>
  </header>

  <!-- real links, so middle-click and open-in-new-tab reach the page directly -->
  <nav class="nav">
    <a
      v-for="(path, name, i) in PATHS"
      :key="name"
      class="nav-tab"
      :class="{on: page === name}"
      :href="path"
      :aria-current="page === name ? 'page' : null"
      @click.prevent="go(name)"
    >
      <span class="nav-no">{{ sheet(i) }}</span>{{ t.tabs[name] }}
    </a>
  </nav>
</template>
