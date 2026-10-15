import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { criarChamada, encerrarChamada, salvarBlocos } from '../services/chamadaService'
import { GroqTranscriptionQueue, type GroqQueueStatus } from '../utils/groqRateLimiter'
import { criarSpeakerPipeline, type Speaker, type SpeakerPipeline } from '../copiloto/speakerPipeline'
import type { BlocoTranscricao } from '../types/chamada'

export type CopilotoStatus = 'aguardando_inicio' | 'ativa' | 'encerrando' | 'encerrada'

const SAVE_INTERVAL_MS = 15_000
/** Média móvel das últimas N medições de atraso (fim da fala -> texto). */
const ATRASO_JANELA = 10

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
  // Último bloco que CHEGOU (não o último por timestamp) — Bruno e Cliente
  // transcrevem em paralelo, então um bloco do Cliente pode chegar depois de
  // um do Bruno com timestamp maior e entrar no meio do array `blocos`
  // (que fica ordenado cronologicamente). Quem precisa saber "o que acabou
  // de chegar" pra reagir (gatilho automático de sugestão, ver
  // useCopilotoSugestoes) tem que olhar isto, não blocos[blocos.length-1].
  const [ultimoBlocoRecebido, setUltimoBlocoRecebido] = useState<BlocoTranscricao | null>(null)
  // Epoch ms de quando a chamada começou — pra quem precisa exibir duração
  // (ex: janela flutuante), sem recalcular a partir do primeiro bloco.
  const [iniciadoEm, setIniciadoEm] = useState<number | null>(null)

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
    setUltimoBlocoRecebido(novo)
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

  const criarPipeline = useCallback(
    (speaker: Speaker, stream: MediaStream) =>
      criarSpeakerPipeline(speaker, stream, {
        queue: queueRef.current!,
        startTimeMs: startTimeRef.current,
        onBloco: insertBlocoSorted,
        onTranscrevendoChange: (segmentoId, ativo) => {
          setTranscrevendo((prev) => {
            const next = new Map(prev)
            if (ativo) next.set(segmentoId, speaker)
            else next.delete(segmentoId)
            return next
          })
        },
        onAtraso: (atraso) => {
          atrasosRef.current = [...atrasosRef.current.slice(-(ATRASO_JANELA - 1)), atraso]
          setAtrasoMedioMs(Math.round(atrasosRef.current.reduce((s, v) => s + v, 0) / atrasosRef.current.length))
        },
      }),
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
    setIniciadoEm(startTimeRef.current)
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
    ultimoBlocoRecebido,
    iniciadoEm,
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
