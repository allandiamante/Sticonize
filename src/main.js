import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

window.addEventListener('dragover', e => e.preventDefault())
window.addEventListener('drop', e => e.preventDefault())

createApp(App).mount('#app')
