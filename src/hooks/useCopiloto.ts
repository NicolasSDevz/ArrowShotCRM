import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { criarChamada, encerrarChamada, salvarBlocos } from '../services/chamadaService'
import type { BlocoTranscricao } from '../types/chamada'

export type CopilotoStatus =
  | 'idle'
  | 'carregando_modelo'
  | 'aguardando_inicio'
  | 'ativa'
  | 'encerrando'
  | 'encerrada'

export interface ModelProgress {
  file: string
  progress: number
}

// ~7 s de audio a 16 kHz
const SAMPLE_RATE = 16_000
const CHUNK_SAMPLES = SAMPLE_RATE * 7
const SAVE_INTERVAL_MS = 15_000

interface AudioCapture {
  stream: MediaStream
  context: AudioContext
  processor: ScriptProcessorNode
  buffer: Float32Array[]
  bufferLength: number
}

export function useCopiloto(leadId: string) {
  const { profile } = useAuth()

  const [status, setStatus] = useState<CopilotoStatus>('idle')
  const [blocos, setBlocos] = useState<BlocoTranscricao[]>([])
  const [modelProgress, setModelProgress] = useState<ModelProgress | null>(null)
  const [modelReady, setModelReady] = useState(false)
  const [transcrevendo, setTranscrevendo] = useState<Set<string>>(new Set())
  const [chamadaId, setChamadaId] = useState<string | null>(null)
  const [erroCaptura, setErroCaptura] = useState<string | null>(null)
  const [semAudioCliente, setSemAudioCliente] = useState(false)

  // Refs para acesso sem fechar sobre estado antigo
  const workerRef = useRef<Worker | null>(null)
  const brunoRef = useRef<AudioCapture | null>(null)
  const clienteRef = useRef<AudioCapture | null>(null)
  const blocosRef = useRef<BlocoTranscricao[]>([])
  const chamadaIdRef = useRef<string | null>(null)
  const startTimeRef = useRef<number>(0)
  const chunkIdRef = useRef(0)
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Mantém refs em sincronia com o estado
  useEffect(() => { blocosRef.current = blocos }, [blocos])
  useEffect(() => { chamadaIdRef.current = chamadaId }, [chamadaId])

  // Inicializa o worker uma vez ao montar
  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/whisperWorker.js', import.meta.url),
      { type: 'module' }
    )

    worker.onmessage = ({ data }: MessageEvent) => {
      switch (data.type) {
        case 'progress':
          setModelProgress({ file: data.file, progress: data.progress })
          break

        case 'ready':
          setModelReady(true)
          setModelProgress(null)
          setStatus('aguardando_inicio')
          break

        case 'error':
          console.error('[copiloto] worker fatal:', data.message)
          break

        case 'transcribing':
          setTranscrevendo((prev) => new Set([...prev, String(data.id)]))
          break

        case 'result': {
          setTranscrevendo((prev) => {
            const next = new Set(prev)
            next.delete(String(data.id))
            return next
          })
          if (data.text) {
            const bloco: BlocoTranscricao = {
              id: crypto.randomUUID(),
              speaker: data.speaker,
              texto: data.text,
              timestampMs: Date.now() - startTimeRef.current,
            }
            setBlocos((prev) => {
              const next = [...prev, bloco]
              blocosRef.current = next
              return next
            })
          }
          break
        }

        case 'chunk_error':
          setTranscrevendo((prev) => {
            const next = new Set(prev)
            next.delete(String(data.id))
            return next
          })
          break
      }
    }

    workerRef.current = worker
    worker.postMessage({ type: 'init' })
    setStatus('carregando_modelo')

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const setupAudioCapture = useCallback(
    (stream: MediaStream, speaker: 'Bruno' | 'Cliente'): AudioCapture => {
      const context = new AudioContext({ sampleRate: SAMPLE_RATE })
      const source = context.createMediaStreamSource(stream)
      // ScriptProcessorNode: bufferSize 4096, mono in, mono out
      const processor = context.createScriptProcessor(4096, 1, 1)

      const capture: AudioCapture = {
        stream,
        context,
        processor,
        buffer: [],
        bufferLength: 0,
      }

      processor.onaudioprocess = (e) => {
        const chunk = e.inputBuffer.getChannelData(0).slice()
        capture.buffer.push(chunk)
        capture.bufferLength += chunk.length

        if (capture.bufferLength >= CHUNK_SAMPLES) {
          // Merge e transfere para o worker sem serialização (zero-copy)
          const merged = new Float32Array(capture.bufferLength)
          let offset = 0
          for (const c of capture.buffer) {
            merged.set(c, offset)
            offset += c.length
          }
          capture.buffer = []
          capture.bufferLength = 0

          const id = chunkIdRef.current++
          workerRef.current?.postMessage(
            { type: 'transcribe', id, speaker, audio: merged },
            [merged.buffer]
          )
        }
      }

      source.connect(processor)
      // Precisa de um destino para o ScriptProcessorNode ser ativado,
      // mas silencia a saída para não echoar no alto-falante
      processor.connect(context.destination)

      return capture
    },
    []
  )

  const stopCapture = useCallback((ref: React.MutableRefObject<AudioCapture | null>) => {
    if (!ref.current) return
    try {
      ref.current.processor.disconnect()
      ref.current.context.close()
      ref.current.stream.getTracks().forEach((t) => t.stop())
    } catch {
      // ignora erros ao parar captura
    }
    ref.current = null
  }, [])

  const periodicSave = useCallback(async () => {
    if (!profile || !chamadaIdRef.current || !blocosRef.current.length) return
    try {
      await salvarBlocos(leadId, chamadaIdRef.current, blocosRef.current, profile.id)
    } catch (err) {
      console.warn('[copiloto] auto-save falhou:', err)
    }
  }, [leadId, profile])

  const iniciar = useCallback(async () => {
    if (!profile || !modelReady) return
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
    } catch (err) {
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

    brunoRef.current = setupAudioCapture(micStream, 'Bruno')

    if (tabStream) {
      clienteRef.current = setupAudioCapture(tabStream, 'Cliente')
      // Se o usuário parar o compartilhamento, marca como sem áudio do cliente
      const videoTrack = tabStream.getVideoTracks()[0]
      videoTrack?.addEventListener('ended', () => {
        setSemAudioCliente(true)
        stopCapture(clienteRef)
      })
    }

    // 4. Auto-save periódico
    saveTimerRef.current = setInterval(periodicSave, SAVE_INTERVAL_MS)

    setStatus('ativa')
  }, [leadId, modelReady, periodicSave, profile, setupAudioCapture, stopCapture])

  const encerrar = useCallback(async () => {
    if (!profile || !chamadaIdRef.current) return
    setStatus('encerrando')

    if (saveTimerRef.current) {
      clearInterval(saveTimerRef.current)
      saveTimerRef.current = null
    }

    stopCapture(brunoRef)
    stopCapture(clienteRef)

    try {
      await encerrarChamada(leadId, chamadaIdRef.current, blocosRef.current, profile.id)
    } catch (err) {
      console.error('[copiloto] erro ao encerrar:', err)
    }

    setStatus('encerrada')
  }, [leadId, profile, stopCapture])

  // Limpeza ao desmontar a página (segurança)
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current)
      stopCapture(brunoRef)
      stopCapture(clienteRef)
    }
  }, [stopCapture])

  return {
    status,
    blocos,
    modelProgress,
    modelReady,
    transcrevendo,
    chamadaId,
    erroCaptura,
    semAudioCliente,
    iniciar,
    encerrar,
  }
}
