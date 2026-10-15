import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../../src/firebase/config'
import { GroqTranscriptionQueue } from '../../src/utils/groqRateLimiter'
import { criarSpeakerPipeline, type Speaker, type SpeakerPipeline } from '../../src/copiloto/speakerPipeline'
import { criarChamada, encerrarChamada, salvarBlocos, salvarSugestoes, salvarResumo } from '../../src/services/chamadaService'
import { updateLead } from '../../src/services/leadService'
import { shouldTriggerSuggestion } from '../../src/utils/copilotoTriggers'
import { parseSugestaoRaw, montarContexto } from '../../src/hooks/useCopilotoSugestoes'
import { buildLeadUpdateFromResumo } from '../../src/utils/leadResumoUpdate'
import type { BlocoTranscricao, Sugestao } from '../../src/types/chamada'
import type { CopilotoStatus } from '../../src/hooks/useCopiloto'
import { streamSugestaoExt, gerarResumoChamadaExt, transcreverAudioExt } from './lib/aiApi'
import { enviar, type SidePanelParaOffscreenMsg } from './lib/messaging'

/** Documento offscreen da extensão — o "motor" do Copiloto (igual a
 *  hooks/useCopiloto.ts + useCopilotoSugestoes.ts no CRM, só que sem React e
 *  comandado por mensagens em vez de chamadas de função direto). Roda
 *  escondido, sem janela, então não sofre o throttling de timers de aba em
 *  segundo plano — e é exatamente por isso que o áudio/captura mora aqui, e
 *  não no side panel (que é só a interface). */

const SAVE_INTERVAL_MS = 15_000
const COOLDOWN_AUTO_MS = 20_000

let leadId: string | null = null
let chamadaId: string | null = null
let blocos: BlocoTranscricao[] = []
let sugestoes: Sugestao[] = []
let status: CopilotoStatus = 'aguardando_inicio'
let startTimeMs = 0
let queue: GroqTranscriptionQueue | null = null
let pipelines: Partial<Record<Speaker, SpeakerPipeline>> = {}
let streams: Partial<Record<Speaker, MediaStream>> = {}
let saveTimer: ReturnType<typeof setInterval> | null = null
let generating = false
let lastAutoAt = 0
let playbackEl: HTMLAudioElement | null = null
let nomeUsuarioCache: string | null = null

async function obterNomeUsuario(): Promise<string> {
  const user = auth.currentUser
  if (!user) return 'Copiloto'
  if (nomeUsuarioCache) return nomeUsuarioCache
  try {
    const snap = await getDoc(doc(db, 'users', user.uid))
    nomeUsuarioCache = (snap.exists() && (snap.data().name as string)) || user.email || user.uid
  } catch {
    nomeUsuarioCache = user.email || user.uid
  }
  return nomeUsuarioCache
}

function inserirBlocoOrdenado(novo: BlocoTranscricao) {
  blocos = [...blocos, novo].sort((a, b) => a.timestampMs - b.timestampMs)
  enviar({ type: 'bloco', bloco: novo })
  verificarGatilhoAutomatico(novo)
}

function verificarGatilhoAutomatico(novo: BlocoTranscricao) {
  if (novo.speaker !== 'Cliente') return
  if (!shouldTriggerSuggestion(novo.texto)) return
  if (Date.now() - lastAutoAt < COOLDOWN_AUTO_MS) return
  if (generating) return
  lastAutoAt = Date.now()
  void gerarSugestao(undefined, 'auto')
}

async function gerarSugestao(pergunta: string | undefined, origem: 'auto' | 'manual') {
  if (generating || !chamadaId || !leadId) return
  generating = true
  enviar({ type: 'generating', generating: true })
  enviar({ type: 'sugestaoChunk', parcial: { tipo: 'geral', resumo: '', frases: [] } })

  const { transcricaoRecente, resumoAnterior } = montarContexto(blocos)
  try {
    const raw = await streamSugestaoExt({ leadId, pergunta, transcricaoRecente, resumoAnterior }, (textoAteAgora) =>
      enviar({ type: 'sugestaoChunk', parcial: parseSugestaoRaw(textoAteAgora) })
    )
    const parsed = parseSugestaoRaw(raw)
    const sugestao: Sugestao = {
      id: crypto.randomUUID(),
      tipo: parsed.tipo,
      resumo: parsed.resumo || '(sem resumo)',
      frases: parsed.frases.length > 0 ? parsed.frases : ['(sem frase sugerida)'],
      timestampMs: blocos.length > 0 ? blocos[blocos.length - 1].timestampMs : Date.now(),
      origem,
      pergunta,
    }
    sugestoes = [...sugestoes, sugestao]
    enviar({ type: 'sugestaoFinal', sugestao })
    const uid = auth.currentUser?.uid
    if (uid && chamadaId) salvarSugestoes(leadId, chamadaId, sugestoes, uid).catch((err) => console.warn('[copiloto-ext] falha ao salvar sugestão', err))
  } catch (err) {
    console.error('[copiloto-ext] falha ao gerar sugestão', err)
    enviar({ type: 'sugestaoErro', mensagem: 'Sugestões pausadas — a transcrição continua normal.' })
  } finally {
    enviar({ type: 'sugestaoChunk', parcial: null })
    generating = false
    enviar({ type: 'generating', generating: false })
  }
}

async function periodicSave() {
  const uid = auth.currentUser?.uid
  if (!uid || !chamadaId || !leadId || blocos.length === 0) return
  try {
    await salvarBlocos(leadId, chamadaId, blocos, uid)
  } catch (err) {
    console.warn('[copiloto-ext] auto-save falhou:', err)
  }
}

// CSP padrão do Manifest V3 só libera script-src 'self' — carregar o
// worklet do VAD de uma CDN externa (igual a página normal faz) é tratado
// como script e fica bloqueado aqui. Por isso o build da extensão
// (vite.config.ts) copia o worklet, o modelo e o runtime wasm do
// onnxruntime pra dentro do próprio pacote (ver extensao/README.md).
const VAD_ASSET_BASE_EXT = chrome.runtime.getURL('vad-assets/')
const ORT_WASM_BASE_EXT = chrome.runtime.getURL('ort-wasm/')

function criarPipelineFonte(speaker: Speaker, stream: MediaStream) {
  return criarSpeakerPipeline(speaker, stream, {
    queue: queue!,
    startTimeMs,
    onBloco: inserirBlocoOrdenado,
    onTranscrevendoChange: () => {},
    baseAssetPath: VAD_ASSET_BASE_EXT,
    onnxWASMBasePath: ORT_WASM_BASE_EXT,
  })
}

async function iniciar(leadIdParam: string, tabStreamId: string | null) {
  leadId = leadIdParam

  let micStream: MediaStream
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    })
  } catch (err) {
    enviar({ type: 'erroCaptura', mensagem: `Não foi possível acessar o microfone: ${err instanceof Error ? err.message : String(err)}` })
    return
  }

  // Áudio da aba do Meet (Cliente) via chrome.tabCapture — sem diálogo de
  // "escolher aba pra compartilhar" (diferente de getDisplayMedia). Precisa
  // ser roteado de volta pros alto-falantes explicitamente: capturar o
  // stream de uma aba por padrão silencia a aba original pra quem está
  // usando o computador, e o Bruno precisa continuar ouvindo o cliente.
  let tabStream: MediaStream | null = null
  if (tabStreamId) {
    try {
      tabStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: tabStreamId },
        },
      } as MediaStreamConstraints)
      playbackEl = new Audio()
      playbackEl.srcObject = tabStream
      void playbackEl.play().catch((err) => console.warn('[copiloto-ext] falha ao reproduzir áudio da aba', err))
    } catch (err) {
      console.warn('[copiloto-ext] falha ao capturar áudio da aba do Meet:', err)
      enviar({ type: 'semAudioCliente' })
    }
  } else {
    enviar({ type: 'semAudioCliente' })
  }

  const uid = auth.currentUser?.uid
  if (!uid) {
    enviar({ type: 'erroCaptura', mensagem: 'Sessão expirada — faça login novamente no painel.' })
    micStream.getTracks().forEach((t) => t.stop())
    tabStream?.getTracks().forEach((t) => t.stop())
    return
  }

  try {
    chamadaId = await criarChamada(leadId, uid)
  } catch {
    micStream.getTracks().forEach((t) => t.stop())
    tabStream?.getTracks().forEach((t) => t.stop())
    enviar({ type: 'erroCaptura', mensagem: 'Erro ao criar chamada no Firestore. Tente novamente.' })
    return
  }

  enviar({ type: 'chamadaId', chamadaId })
  startTimeMs = Date.now()
  blocos = []
  sugestoes = []
  queue = new GroqTranscriptionQueue(undefined, transcreverAudioExt)

  streams.Bruno = micStream
  pipelines.Bruno = await criarPipelineFonte('Bruno', micStream)
  enviar({ type: 'ouvindo', ouvindo: { Bruno: true, Cliente: !!tabStream } })

  if (tabStream) {
    streams.Cliente = tabStream
    pipelines.Cliente = await criarPipelineFonte('Cliente', tabStream)
    const [track] = tabStream.getAudioTracks()
    track?.addEventListener('ended', () => {
      enviar({ type: 'semAudioCliente' })
      enviar({ type: 'ouvindo', ouvindo: { Bruno: true, Cliente: false } })
      void pipelines.Cliente?.destroy()
      pipelines.Cliente = undefined
    })
  }

  saveTimer = setInterval(periodicSave, SAVE_INTERVAL_MS)
  status = 'ativa'
  enviar({ type: 'status', status })
}

async function encerrar() {
  if (!leadId || !chamadaId) return
  status = 'encerrando'
  enviar({ type: 'status', status })

  if (saveTimer) {
    clearInterval(saveTimer)
    saveTimer = null
  }

  await Promise.all([pipelines.Bruno?.destroy(), pipelines.Cliente?.destroy()])
  pipelines = {}

  Object.values(streams).forEach((s) => s?.getTracks().forEach((t) => t.stop()))
  streams = {}
  if (playbackEl) {
    playbackEl.pause()
    playbackEl.srcObject = null
    playbackEl = null
  }
  enviar({ type: 'ouvindo', ouvindo: { Bruno: false, Cliente: false } })

  try {
    const uid = auth.currentUser?.uid
    if (uid) await encerrarChamada(leadId, chamadaId, blocos, uid)
  } catch (err) {
    console.error('[copiloto-ext] erro ao encerrar:', err)
  }

  status = 'encerrada'
  enviar({ type: 'status', status })
  void gerarESalvarResumo()
}

/** Igual à página /copiloto do CRM (gera sozinho ao encerrar), mas sem tela
 *  de revisão dentro do painel — já salva direto no lead; "Ver resumo no
 *  CRM" (ver SidePanelApp) abre a tela de revisão de lá se precisar ajustar. */
async function gerarESalvarResumo() {
  if (!leadId || !chamadaId) return
  try {
    const resumo = await gerarResumoChamadaExt(leadId, blocos, sugestoes)
    enviar({ type: 'resumoPronto', resumo })
    const uid = auth.currentUser?.uid
    if (uid) {
      await salvarResumo(leadId, chamadaId, resumo, uid)
      await updateLead(leadId, buildLeadUpdateFromResumo(resumo), uid, await obterNomeUsuario())
    }
  } catch (err) {
    console.error('[copiloto-ext] falha ao gerar/salvar resumo:', err)
    enviar({ type: 'resumoErro', mensagem: err instanceof Error ? err.message : 'Falha ao gerar o resumo' })
  }
}

chrome.runtime.onMessage.addListener((raw: unknown) => {
  const msg = raw as Partial<SidePanelParaOffscreenMsg>
  if (msg.type === 'iniciar' && msg.leadId) void iniciar(msg.leadId, msg.tabStreamId ?? null)
  else if (msg.type === 'encerrar') void encerrar()
  else if (msg.type === 'pedirAjuda') void gerarSugestao(msg.pergunta?.trim() || undefined, 'manual')
  else if (msg.type === 'gerarResumo') void gerarESalvarResumo()
})
