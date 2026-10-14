import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // transformers.js usa importações dinâmicas e WASM — o Vite não deve pré-bundlar
    exclude: ['@xenova/transformers'],
  },
  worker: {
    format: 'es',
  },
})
