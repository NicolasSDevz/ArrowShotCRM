import { MicVAD } from '@ricky0123/vad-web'
import type { GroqTranscriptionQueue } from '../utils/groqRateLimiter'
import { isHallucination } from '../utils/transcriptionHallucinations'
import type { BlocoTranscricao } from '../types/chamada'

/** Núcleo da captura por falante (VAD + merge de falas curtas + fila do
 *  Groq), extraído de useCopiloto.ts pra ser reaproveitado tanto pela
 *  página /copiloto (aba do CRM) quanto pelo offscreen document da extensão
 *  do Chrome (Copiloto dentro do Meet) — a única diferença entre os dois é
 *  COMO o MediaStream de cada falante é obtido (getUserMedia/getDisplayMedia
 *  na página; getUserMedia/chrome.tabCapture na extensão); o processamento
 *  em si é idêntico e mora só aqui. */

export type Speaker = 'Bruno' | 'Cliente'

export const SAMPLE_RATE = 16_000
/** Limites do Groq (free tier): fala curta ("sim", "aham") junta com a
 *  próxima em vez de virar uma requisição só pra ela. */
const MERGE_MIN_SEC = 4
const MERGE_MAX_SEC = 15
const MERGE_SILENCE_MS = 2000

// Assets do VAD (modelo Silero ONNX + worklet) servidos via CDN — não dá pra
// importar os arquivos locais do node_modules com o Vite sem copiá-los pro
// build; o pacote recomenda apontar pra esses dois caminhos.
export const VAD_ASSET_BASE = 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.31/dist/'
export const ORT_WASM_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/'

function concatFloat32(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

export interface SpeakerPipeline {
  destroy: () => Promise<void>
}

export interface SpeakerPipelineCallbacks {
  queue: GroqTranscriptionQueue
  /** Epoch ms de quando a chamada começou — pra calcular o timestamp de
   *  cada bloco relativo ao início. */
  startTimeMs: number
  onBloco: (bloco: BlocoTranscricao) => void
  onTranscrevendoChange: (segmentoId: string, ativo: boolean) => void
  onAtraso?: (atrasoMs: number) => void
  /** Onde buscar os assets do VAD (modelo + worklet) e do runtime wasm do
   *  onnxruntime — por padrão a CDN (ver VAD_ASSET_BASE/ORT_WASM_BASE), mas
   *  a extensão do Chrome (offscreen.ts) passa caminhos locais
   *  (chrome.runtime.getURL(...)): o CSP padrão de Manifest V3 só libera
   *  script-src 'self', e carregar o worklet de um domínio externo é
   *  tratado como script — fica bloqueado lá, diferente da página normal. */
  baseAssetPath?: string
  onnxWASMBasePath?: string
}

/** VAD + buffer de merge de falas curtas pra uma fonte de áudio (mic do
 *  Bruno, ou aba do Meet do Cliente) — cada fonte roda seu próprio VAD, em
 *  paralelo, sem fila alternada entre as duas. */
export async function criarSpeakerPipeline(
  speaker: Speaker,
  stream: MediaStream,
  {
    queue,
    startTimeMs,
    onBloco,
    onTranscrevendoChange,
    onAtraso,
    baseAssetPath = VAD_ASSET_BASE,
    onnxWASMBasePath = ORT_WASM_BASE,
  }: SpeakerPipelineCallbacks
): Promise<SpeakerPipeline> {
  let acumulado: Float32Array | null = null
  let inicioMs = 0
  // Silêncio acumulado desde o último onSpeechEnd, em ms de áudio real (não
  // wall-clock) — contado a cada frame processado pelo VAD. Evita
  // setTimeout/setInterval pra essa decisão: o AudioWorklet que processa os
  // frames não é throttlado quando a aba/documento vai pra segundo plano
  // (Chrome throttla temporizadores JS, não o grafo de áudio).
  let silenciodesdeUltimaFalaMs = 0
  let pendingFlush: Promise<void> = Promise.resolve()

  const flush = (): Promise<void> => {
    silenciodesdeUltimaFalaMs = 0
    if (!acumulado || acumulado.length === 0) return Promise.resolve()
    const audio = acumulado
    const startMs = inicioMs
    const durationSec = audio.length / SAMPLE_RATE
    acumulado = null

    const segmentoId = crypto.randomUUID()
    onTranscrevendoChange(segmentoId, true)
    const endEpochMs = Date.now()

    const promise = queue.enqueue(audio, durationSec).then(
      (texto) => {
        onAtraso?.(Date.now() - endEpochMs)
        if (isHallucination(texto, durationSec)) return
        onBloco({ id: crypto.randomUUID(), speaker, texto: texto.trim(), timestampMs: startMs })
      },
      (err) => {
        console.warn(`[copiloto] falha ao transcrever trecho de ${speaker}:`, err)
      }
    )

    return promise.finally(() => onTranscrevendoChange(segmentoId, false))
  }

  // startOnLoad (padrão: true) já inicia sozinho dentro de MicVAD.new — sem
  // chamada extra a .start().
  const vad = await MicVAD.new({
    getStream: async () => stream,
    pauseStream: async () => {},
    resumeStream: async () => stream,
    baseAssetPath,
    onnxWASMBasePath,
    model: 'v5',
    minSpeechMs: 150,
    redemptionMs: 500,
    preSpeechPadMs: 200,
    onSpeechStart: () => {
      if (!acumulado) inicioMs = Date.now() - startTimeMs
      silenciodesdeUltimaFalaMs = 0
    },
    onSpeechEnd: (audio) => {
      acumulado = acumulado ? concatFloat32(acumulado, audio) : audio
      silenciodesdeUltimaFalaMs = 0
      const durationSec = acumulado.length / SAMPLE_RATE
      if (durationSec >= MERGE_MIN_SEC || durationSec >= MERGE_MAX_SEC) {
        pendingFlush = flush()
      }
      // Senão, espera: onFrameProcessed (abaixo) conta o silêncio até bater
      // MERGE_SILENCE_MS e decide se junta com a próxima fala ou envia.
    },
    onFrameProcessed: (_probs, frame) => {
      if (!acumulado) return
      silenciodesdeUltimaFalaMs += (frame.length / SAMPLE_RATE) * 1000
      if (silenciodesdeUltimaFalaMs >= MERGE_SILENCE_MS) {
        pendingFlush = flush()
      }
    },
    onVADMisfire: () => {
      /* segmento descartado pelo próprio VAD (menor que minSpeechMs) — ruído, não fala */
    },
  })

  return {
    destroy: async () => {
      await pendingFlush
      await flush()
      await vad.destroy()
    },
  }
}
