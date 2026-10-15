import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { copyFileSync, mkdirSync } from 'fs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// VAD (modelo + worklet) e onnxruntime-web (runtime wasm): na página normal
// do CRM esses assets vêm de uma CDN (ver src/copiloto/speakerPipeline.ts),
// mas o CSP padrão de Manifest V3 só libera script-src 'self' — carregar o
// worklet de um domínio externo é bloqueado lá. Então, só pra extensão,
// copiamos os arquivos certos do node_modules pro dist (ver offscreen.ts,
// que aponta pra esses caminhos locais em vez da CDN).
const VAD_DIST = resolve(__dirname, '../node_modules/@ricky0123/vad-web/dist')
const ORT_DIST = resolve(__dirname, '../node_modules/@ricky0123/vad-web/node_modules/onnxruntime-web/dist')

// Build da extensão do Copiloto — fica dentro do repo principal (reaproveita
// node_modules e código-fonte do CRM, ver README.md desta pasta), mas gera
// um dist próprio, independente do build do CRM.
export default defineConfig({
  root: __dirname,
  // Lê o mesmo .env.local do projeto raiz — não duplica a config do
  // Firebase (VITE_FIREBASE_*), que não é segredo (chave pública de cliente).
  envDir: resolve(__dirname, '..'),
  publicDir: resolve(__dirname, 'public'),
  plugins: [
    react(),
    {
      name: 'copiloto-extensao-manifest',
      closeBundle() {
        const dist = resolve(__dirname, 'dist')
        mkdirSync(dist, { recursive: true })
        copyFileSync(resolve(__dirname, 'manifest.json'), resolve(dist, 'manifest.json'))

        const vadAssets = resolve(dist, 'vad-assets')
        mkdirSync(vadAssets, { recursive: true })
        copyFileSync(resolve(VAD_DIST, 'vad.worklet.bundle.min.js'), resolve(vadAssets, 'vad.worklet.bundle.min.js'))
        copyFileSync(resolve(VAD_DIST, 'silero_vad_v5.onnx'), resolve(vadAssets, 'silero_vad_v5.onnx'))

        const ortWasm = resolve(dist, 'ort-wasm')
        mkdirSync(ortWasm, { recursive: true })
        copyFileSync(resolve(ORT_DIST, 'ort-wasm-simd-threaded.wasm'), resolve(ortWasm, 'ort-wasm-simd-threaded.wasm'))
        copyFileSync(resolve(ORT_DIST, 'ort-wasm-simd-threaded.mjs'), resolve(ortWasm, 'ort-wasm-simd-threaded.mjs'))
      },
    },
  ],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        offscreen: resolve(__dirname, 'offscreen.html'),
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
