import { ref, watchEffect } from 'vue'

export const themes = ['dark', 'light']

export const theme = ref(
  localStorage.getItem('theme') ||
  (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
)

export const INK = { dark: '#E8EDE9', light: '#14181A' }
const PAPER = { dark: '#14181A', light: '#EFF2ED' }   

watchEffect(() => {
  localStorage.setItem('theme', theme.value)
  document.documentElement.dataset.theme = theme.value
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', PAPER[theme.value])
})
