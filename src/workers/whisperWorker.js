// Web Worker — transcrição local com Whisper (transformers.js)
// Roda fora do thread principal para não bloquear a UI.
// O áudio nunca sai do computador.
//
// Protocolo Main → Worker:
//   { type: 'init' }                                       → carrega o modelo
//   { type: 'transcribe', id, speaker, audio: Float32Array } → transcreve um bloco
//
// Protocolo Worker → Main:
//   { type: 'progress', file, progress }   → progresso do download
//   { type: 'ready' }                      → modelo pronto
//   { type: 'error', message }             → erro fatal ao carregar
//   { type: 'transcribing', id, speaker } → processamento iniciado
//   { type: 'result', id, speaker, text } → transcrição concluída (texto vazio = silêncio)
//   { type: 'chunk_error', id, speaker, message } → erro não-fatal num bloco

import { pipeline, env } from '@xenova/transformers'

// Usa cache do browser (IndexedDB) para não baixar toda vez
env.allowLocalModels = false
env.useBrowserCache = true

let transcriber = null

async function initModel() {
  const onProgress = (p) => {
    if (p.status === 'progress' || p.status === 'downloading') {
      self.postMessage({ type: 'progress', file: p.file ?? '', progress: p.progress ?? 0 })
    }
  }

  // Tenta WebGPU (Chrome 113+) primeiro; cai para WASM se não disponível
  const devices = ['webgpu', 'wasm']
  let lastErr = null

  for (const device of devices) {
    try {
      transcriber = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-small',
        {
          dtype: device === 'webgpu' ? 'fp16' : 'fp32',
          device,
          progress_callback: onProgress,
        }
      )
      console.info(`[whisperWorker] carregado via ${device}`)
      return
    } catch (err) {
      console.warn(`[whisperWorker] falhou com ${device}:`, err.message)
      lastErr = err
      transcriber = null
    }
  }

  throw lastErr ?? new Error('Não foi possível inicializar o Whisper')
}

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      await initModel()
      self.postMessage({ type: 'ready' })
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message })
    }
    return
  }

  if (data.type === 'transcribe') {
    const { id, speaker, audio } = data

    if (!transcriber) {
      self.postMessage({ type: 'chunk_error', id, speaker, message: 'Modelo não carregado' })
      return
    }

    self.postMessage({ type: 'transcribing', id, speaker })

    try {
      const result = await transcriber(audio, {
        language: 'portuguese',
        task: 'transcribe',
        sampling_rate: 16000,
        return_timestamps: false,
      })
      const text = (result?.text ?? '').trim()
      self.postMessage({ type: 'result', id, speaker, text })
    } catch (err) {
      console.error('[whisperWorker] erro ao transcrever bloco:', err.message)
      self.postMessage({ type: 'chunk_error', id, speaker, message: err.message })
    }
  }
}
