import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// two entry HTMLs, one per page: /vectorize has to ship its own <title> and copy,
// or a crawler reads the scribble page's words on both URLs
export default defineConfig({
  plugins: [vue()],
  build: {rollupOptions: {input: ['index.html', 'vectorize.html']}}
})
