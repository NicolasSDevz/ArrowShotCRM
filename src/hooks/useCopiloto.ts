import { useCallback, useEffect, useRef, useState } from 'react'
import { MicVAD } from '@ricky0123/vad-web'
import { useAuth } from '../context/AuthContext'
import { criarChamada, encerrarChamada, salvarBlocos } from '../services/chamadaService'
import { GroqTranscriptionQueue, type GroqQueueStatus } from '../utils/groqRateLimiter'
import { isHallucination } from '../utils/transcriptionHallucinations'
import type { BlocoTranscricao } from '../types/chamada'

export type CopilotoStatus = 'aguardando_inicio' | 'ativa' | 'encerrando' | 'encerrada'

type Speaker = 'Bruno' | 'Cliente'

const SAVE_INTERVAL_MS = 15_000
const SAMPLE_RATE = 16_000
/** Limites do Groq (free tier): fala curta ("sim", "aham") junta com a
 *  próxima em vez de virar uma requisição só pra ela — ver TAREFA. */
const MERGE_MIN_SEC = 4
const MERGE_MAX_SEC = 15
const MERGE_SILENCE_MS = 2000
/** Média móvel das últimas N medições de atraso (fim da fala -> texto). */
const ATRASO_JANELA = 10

// Assets do VAD (modelo Silero ONNX + worklet) servidos via CDN — não dá pra
// importar os arquivos locais do node_modules com o Vite sem copiá-los pro
// build; o pacote recomenda apontar pra esses dois caminhos.
const VAD_ASSET_BASE = 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.31/dist/'
const ORT_WASM_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/'

function concatFloat32(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

interface SpeakerPipeline {
  destroy: () => Promise<void>
}

export interface OuvindoStatus {
  Bruno: boolean
  Cliente: boolean
}

export function useCopiloto(leadId: string) {
  const { profile } = useAuth()

  // Não há mais download/carregamento de modelo local (Groq é uma API) —
  // já nasce pronto pra iniciar.
  const [status, setStatus] = useState<CopilotoStatus>('aguardando_inicio')
  const [blocos, setBlocos] = useState<BlocoTranscricao[]>([])
  // id do segmento -> quem está falando (os dois falantes transcrevem em
  // paralelo agora, então pode ter um de cada ao mesmo tempo).
  const [transcrevendo, setTranscrevendo] = useState<Map<string, Speaker>>(new Map())
  const [ouvindo, setOuvindo] = useState<OuvindoStatus>({ Bruno: false, Cliente: false })
  const [atrasoMedioMs, setAtrasoMedioMs] = useState<number | null>(null)
  const [groqStatus, setGroqStatus] = useState<GroqQueueStatus>({
    requestsThisMinute: 0,
    audioSecondsToday: 0,
    dailyLimitReached: false,
  })
  const [chamadaId, setChamadaId] = useState<string | null>(null)
  const [erroCaptura, setErroCaptura] = useState<string | null>(null)
  const [semAudioCliente, setSemAudioCliente] = useState(false)

  const blocosRef = useRef<BlocoTranscricao[]>([])
  const chamadaIdRef = useRef<string | null>(null)
  const startTimeRef = useRef(0)
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const queueRef = useRef<GroqTranscriptionQueue | null>(null)
  const pipelinesRef = useRef<Partial<Record<Speaker, SpeakerPipeline>>>({})
  const streamsRef = useRef<Partial<Record<Speaker, MediaStream>>>({})
  const atrasosRef = useRef<number[]>([])

  useEffect(() => {
    blocosRef.current = blocos
  }, [blocos])
  useEffect(() => {
    chamadaIdRef.current = chamadaId
  }, [chamadaId])

  const insertBlocoSorted = useCallback((novo: BlocoTranscricao) => {
    setBlocos((prev) => {
      const next = [...prev, novo].sort((a, b) => a.timestampMs - b.timestampMs)
      blocosRef.current = next
      return next
    })
  }, [])

  const periodicSave = useCallback(async () => {
    if (!profile || !chamadaIdRef.current || !blocosRef.current.length) return
    try {
      await salvarBlocos(leadId, chamadaIdRef.current, blocosRef.current, profile.id)
    } catch (err) {
      console.warn('[copiloto] auto-save falhou:', err)
    }
  }, [leadId, profile])

  /** VAD + buffer de merge de falas curtas pra uma fonte de áudio (mic do
   *  Bruno ou aba do Meet do Cliente) — cada fonte roda seu próprio VAD, em
   *  paralelo, sem fila alternada entre as duas. */
  const criarPipeline = useCallback(
    async (speaker: Speaker, stream: MediaStream): Promise<SpeakerPipeline> => {
      let acumulado: Float32Array | null = null
      let inicioMs = 0
      let silenceTimer: ReturnType<typeof setTimeout> | null = null
      let pendingFlush: Promise<void> = Promise.resolve()

      const flush = (): Promise<void> => {
        if (silenceTimer) {
          clearTimeout(silenceTimer)
          silenceTimer = null
        }
        if (!acumulado || acumulado.length === 0) return Promise.resolve()
        const audio = acumulado
        const startMs = inicioMs
        const durationSec = audio.length / SAMPLE_RATE
        acumulado = null

        const segmentoId = crypto.randomUUID()
        setTranscrevendo((prev) => new Map(prev).set(segmentoId, speaker))
        const endEpochMs = Date.now()

        const queue = queueRef.current
        const promise = queue
          ? queue.enqueue(audio, durationSec).then(
              (texto) => {
                const atraso = Date.now() - endEpochMs
                atrasosRef.current = [...atrasosRef.current.slice(-(ATRASO_JANELA - 1)), atraso]
                setAtrasoMedioMs(Math.round(atrasosRef.current.reduce((s, v) => s + v, 0) / atrasosRef.current.length))

                if (isHallucination(texto, durationSec)) return
                insertBlocoSorted({ id: crypto.randomUUID(), speaker, texto: texto.trim(), timestampMs: startMs })
              },
              (err) => {
                console.warn(`[copiloto] falha ao transcrever trecho de ${speaker}:`, err)
              }
            )
          : Promise.resolve()

        return promise.finally(() => {
          setTranscrevendo((prev) => {
            const next = new Map(prev)
            next.delete(segmentoId)
            return next
          })
        })
      }

      // startOnLoad (padrão: true) já inicia sozinho dentro de MicVAD.new —
      // sem chamada extra a .start().
      const vad = await MicVAD.new({
        getStream: async () => stream,
        pauseStream: async () => {},
        resumeStream: async () => stream,
        baseAssetPath: VAD_ASSET_BASE,
        onnxWASMBasePath: ORT_WASM_BASE,
        model: 'v5',
        minSpeechMs: 150,
        redemptionMs: 500,
        preSpeechPadMs: 200,
        onSpeechStart: () => {
          if (!acumulado) inicioMs = Date.now() - startTimeRef.current
        },
        onSpeechEnd: (audio) => {
          acumulado = acumulado ? concatFloat32(acumulado, audio) : audio
          const durationSec = acumulado.length / SAMPLE_RATE
          if (silenceTimer) {
            clearTimeout(silenceTimer)
            silenceTimer = null
          }
          if (durationSec >= MERGE_MIN_SEC || durationSec >= MERGE_MAX_SEC) {
            pendingFlush = flush()
          } else {
            silenceTimer = setTimeout(() => {
              pendingFlush = flush()
            }, MERGE_SILENCE_MS)
          }
        },
        onVADMisfire: () => {
          /* segmento descartado pelo próprio VAD (menor que minSpeechMs) — ruído, não fala */
        },
      })

      return {
        destroy: async () => {
          if (silenceTimer) {
            clearTimeout(silenceTimer)
            silenceTimer = null
          }
          await pendingFlush
          await flush()
          await vad.destroy()
        },
      }
    },
    [insertBlocoSorted]
  )

  const iniciar = useCallback(async () => {
    if (!profile) return
    setErroCaptura(null)
    setSemAudioCliente(false)

    // 1. Microfone (Bruno)
    let micStream: MediaStream
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setErroCaptura(`Não foi possível acessar o microfone: ${msg}`)
      return
    }

    // 2. Aba do Meet (Cliente) — getDisplayMedia exige video: true para funcionar no Chrome
    let tabStream: MediaStream | null = null
    try {
      tabStream = await (navigator.mediaDevices as MediaDevices).getDisplayMedia({
        video: { frameRate: 1 },
        audio: true,
      } as DisplayMediaStreamOptions)

      const hasAudio = tabStream.getAudioTracks().length > 0
      if (!hasAudio) {
        setSemAudioCliente(true)
        tabStream.getTracks().forEach((t) => t.stop())
        tabStream = null
      }
    } catch {
      // Usuário cancelou ou browser não suporta — continua só com mic
      setSemAudioCliente(true)
    }

    // 3. Cria a chamada no Firestore
    let cid: string
    try {
      cid = await criarChamada(leadId, profile.id)
    } catch {
      micStream.getTracks().forEach((t) => t.stop())
      tabStream?.getTracks().forEach((t) => t.stop())
      setErroCaptura('Erro ao criar chamada no Firestore. Tente novamente.')
      return
    }

    setChamadaId(cid)
    chamadaIdRef.current = cid
    startTimeRef.current = Date.now()
    setBlocos([])
    blocosRef.current = []
    atrasosRef.current = []
    setAtrasoMedioMs(null)
    queueRef.current = new GroqTranscriptionQueue(setGroqStatus)

    // 4. VAD independente por fonte — sem fila alternada entre Bruno e Cliente
    streamsRef.current.Bruno = micStream
    pipelinesRef.current.Bruno = await criarPipeline('Bruno', micStream)
    setOuvindo((o) => ({ ...o, Bruno: true }))

    if (tabStream) {
      streamsRef.current.Cliente = tabStream
      pipelinesRef.current.Cliente = await criarPipeline('Cliente', tabStream)
      setOuvindo((o) => ({ ...o, Cliente: true }))

      const videoTrack = tabStream.getVideoTracks()[0]
      videoTrack?.addEventListener('ended', () => {
        setSemAudioCliente(true)
        setOuvindo((o) => ({ ...o, Cliente: false }))
        void pipelinesRef.current.Cliente?.destroy()
        pipelinesRef.current.Cliente = undefined
      })
    }

    // 5. Auto-save periódico
    saveTimerRef.current = setInterval(periodicSave, SAVE_INTERVAL_MS)

    setStatus('ativa')
  }, [leadId, profile, criarPipeline, periodicSave])

  const encerrar = useCallback(async () => {
    if (!profile || !chamadaIdRef.current) return
    setStatus('encerrando')

    if (saveTimerRef.current) {
      clearInterval(saveTimerRef.current)
      saveTimerRef.current = null
    }

    // Espera o último trecho de cada fonte terminar de transcrever antes de
    // salvar — senão a última fala antes de "Encerrar" podia ficar de fora
    // do Firestore (o auto-save já tinha parado).
    await Promise.all([pipelinesRef.current.Bruno?.destroy(), pipelinesRef.current.Cliente?.destroy()])
    pipelinesRef.current = {}

    Object.values(streamsRef.current).forEach((s) => s?.getTracks().forEach((t) => t.stop()))
    streamsRef.current = {}
    setOuvindo({ Bruno: false, Cliente: false })

    try {
      await encerrarChamada(leadId, chamadaIdRef.current, blocosRef.current, profile.id)
    } catch (err) {
      console.error('[copiloto] erro ao encerrar:', err)
    }

    setStatus('encerrada')
  }, [leadId, profile])

  // Limpeza ao desmontar a página (segurança)
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current)
      void pipelinesRef.current.Bruno?.destroy()
      void pipelinesRef.current.Cliente?.destroy()
      Object.values(streamsRef.current).forEach((s) => s?.getTracks().forEach((t) => t.stop()))
    }
  }, [])

  return {
    status,
    blocos,
    transcrevendo,
    ouvindo,
    atrasoMedioMs,
    groqStatus,
    chamadaId,
    erroCaptura,
    semAudioCliente,
    iniciar,
    encerrar,
  }
}
