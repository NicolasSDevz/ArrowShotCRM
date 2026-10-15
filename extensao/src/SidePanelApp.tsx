import { useEffect, useRef, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { Mic, Square, AlertTriangle, Loader2, Sparkles, Send, ExternalLink } from 'lucide-react'
import { useAuth } from '../../src/context/AuthContext'
import { db } from '../../src/firebase/config'
import { SugestaoCard } from '../../src/components/leads/SugestaoCard'
import type { Lead } from '../../src/types/lead'
import type { BlocoTranscricao, Sugestao } from '../../src/types/chamada'
import type { CopilotoStatus, OuvindoStatus } from '../../src/hooks/useCopiloto'
import type { SugestaoParcial } from '../../src/hooks/useCopilotoSugestoes'
import { extrairCodigoMeet, buscarLeadPorCodigoMeet, buscarLeadsPorNome } from './lib/meetLink'
import { temAcessoAoCopiloto } from '../../src/config/copilotoAccess'
import { enviar, type OffscreenParaSidePanelMsg } from './lib/messaging'
import { CRM_BASE_URL } from './lib/aiApi'

function formatDuracao(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function LoginForm() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const entrar = async () => {
    setErro(null)
    setLoading(true)
    try {
      await signIn(email.trim(), senha)
    } catch {
      setErro('E-mail ou senha incorretos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
      <Mic size={28} className="text-brand-500" />
      <p className="text-center text-sm font-semibold text-slate-700 dark:text-slate-200">Copiloto de Vendas</p>
      <p className="text-center text-xs text-slate-400">Entre com a mesma conta do CRM</p>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="E-mail"
        type="email"
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
      <input
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && entrar()}
        placeholder="Senha"
        type="password"
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
      {erro && <p className="text-xs text-red-500">{erro}</p>}
      <button
        onClick={entrar}
        disabled={loading || !email.trim() || !senha}
        className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-40 hover:bg-brand-700"
      >
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </div>
  )
}

function LgpdModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [checked, setChecked] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
      <div className="w-full rounded-xl bg-white p-4 shadow-2xl dark:bg-slate-800">
        <h2 className="mb-1 text-sm font-bold text-slate-900 dark:text-white">Antes de iniciar</h2>
        <p className="mb-3 text-xs text-slate-500">
          A fala é cortada por frase e enviada pra transcrição via API (Groq Whisper). Só o texto resultante é salvo
          no CRM; não guardamos o áudio.
        </p>
        <div className="mb-3 rounded-lg bg-amber-50 p-2.5 dark:bg-amber-950/50">
          <p className="text-xs italic text-amber-700 dark:text-amber-400">
            "Pra eu não perder nenhum detalhe, vou deixar uma transcrição da nossa conversa rodando. Tudo bem?"
          </p>
        </div>
        <label className="mb-3 flex cursor-pointer items-start gap-2">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" />
          <span className="text-xs text-slate-700 dark:text-slate-300">Informei o cliente que a conversa será transcrita</span>
        </label>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            disabled={!checked}
            className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 hover:bg-brand-700"
          >
            Iniciar Copiloto
          </button>
          <button onClick={onCancel} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

function BuscaLead({ onEscolher }: { onEscolher: (lead: Lead) => void }) {
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<Lead[]>([])
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    const t = setTimeout(async () => {
      if (termo.trim().length < 2) {
        setResultados([])
        return
      }
      setBuscando(true)
      try {
        setResultados(await buscarLeadsPorNome(termo))
      } finally {
        setBuscando(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [termo])

  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="text-xs text-slate-400">Não achei a reunião agendada no CRM pra essa chamada. Procure o lead:</p>
      <input
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder="Nome do contato ou empresa…"
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
      {buscando && <Loader2 size={14} className="animate-spin text-slate-300" />}
      <div className="flex flex-col gap-1">
        {resultados.map((l) => (
          <button
            key={l.id}
            onClick={() => onEscolher(l)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <span className="font-medium text-slate-800 dark:text-slate-100">{l.contactName}</span>
            {l.companyName && <span className="text-slate-400"> · {l.companyName}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SidePanelApp() {
  const { profile, loading: authLoading } = useAuth()

  const [meetTabId, setMeetTabId] = useState<number | null>(null)
  const [autoDetectDone, setAutoDetectDone] = useState(false)
  const [leadId, setLeadId] = useState<string | null>(null)
  const [lead, setLead] = useState<Lead | null>(null)

  const [showLgpd, setShowLgpd] = useState(false)
  const [status, setStatus] = useState<CopilotoStatus>('aguardando_inicio')
  const [ouvindo, setOuvindo] = useState<OuvindoStatus>({ Bruno: false, Cliente: false })
  const [chamadaId, setChamadaId] = useState<string | null>(null)
  const [blocos, setBlocos] = useState<BlocoTranscricao[]>([])
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  const [streaming, setStreaming] = useState<SugestaoParcial | null>(null)
  const [generating, setGenerating] = useState(false)
  const [erroCaptura, setErroCaptura] = useState<string | null>(null)
  const [semAudioCliente, setSemAudioCliente] = useState(false)
  const [erroSugestao, setErroSugestao] = useState<string | null>(null)
  const [resumoPronto, setResumoPronto] = useState(false)
  const [erroResumo, setErroResumo] = useState<string | null>(null)
  const [pergunta, setPergunta] = useState('')
  const [duracaoMs, setDuracaoMs] = useState(0)
  const iniciadoEmRef = useRef<number | null>(null)

  // Detecta a aba do Meet aberta e tenta ligar com o lead agendado no CRM.
  useEffect(() => {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id) setMeetTabId(tab.id)
      const codigo = tab?.url ? extrairCodigoMeet(tab.url) : null
      if (codigo) {
        const found = await buscarLeadPorCodigoMeet(codigo).catch(() => null)
        if (found) setLeadId(found)
      }
      setAutoDetectDone(true)
    })()
  }, [])

  useEffect(() => {
    if (!leadId) {
      setLead(null)
      return
    }
    void getDoc(doc(db, 'leads', leadId)).then((snap) => {
      if (snap.exists()) setLead({ id: snap.id, ...snap.data() } as Lead)
    })
  }, [leadId])

  // Eventos vindos do offscreen document (ver offscreen.ts) — o painel é só
  // visualização + comandos, nunca duplica captura ou chamada à IA.
  useEffect(() => {
    const listener = (raw: unknown) => {
      const msg = raw as OffscreenParaSidePanelMsg
      switch (msg.type) {
        case 'status':
          setStatus(msg.status)
          if (msg.status === 'ativa' && !iniciadoEmRef.current) iniciadoEmRef.current = Date.now()
          break
        case 'ouvindo':
          setOuvindo(msg.ouvindo)
          break
        case 'bloco':
          setBlocos((prev) => [...prev, msg.bloco].sort((a, b) => a.timestampMs - b.timestampMs))
          break
        case 'chamadaId':
          setChamadaId(msg.chamadaId)
          break
        case 'erroCaptura':
          setErroCaptura(msg.mensagem)
          break
        case 'semAudioCliente':
          setSemAudioCliente(true)
          break
        case 'sugestaoChunk':
          setStreaming(msg.parcial)
          break
        case 'sugestaoFinal':
          setSugestoes((prev) => [...prev, msg.sugestao])
          break
        case 'sugestaoErro':
          setErroSugestao(msg.mensagem)
          break
        case 'generating':
          setGenerating(msg.generating)
          break
        case 'resumoPronto':
          setResumoPronto(true)
          break
        case 'resumoErro':
          setErroResumo(msg.mensagem)
          break
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  useEffect(() => {
    if (status !== 'ativa') return
    const t = setInterval(() => {
      if (iniciadoEmRef.current) setDuracaoMs(Date.now() - iniciadoEmRef.current)
    }, 1000)
    return () => clearInterval(t)
  }, [status])

  const handlePedirAjuda = (p?: string) => {
    if (status !== 'ativa' || generating) return
    enviar({ type: 'pedirAjuda', pergunta: p })
  }

  // Atalho: H com o painel em foco dispara "Me ajuda agora" (ignorado se
  // estiver digitando num campo).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.key.toLowerCase() === 'h') {
        e.preventDefault()
        handlePedirAjuda()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [status, generating])

  const handleConfirmarLgpd = async () => {
    setShowLgpd(false)
    setErroCaptura(null)
    if (!leadId || !meetTabId) return

    // Permissão de microfone — o offscreen document não pode mostrar o
    // prompt (não é uma página visível), então a 1ª vez é sempre pedida
    // aqui, no painel. Depois de concedida uma vez pra origem da extensão,
    // fica valendo pro offscreen também (mesma origem chrome-extension://).
    try {
      const stored = await chrome.storage.local.get('micPrimed')
      if (!stored.micPrimed) {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true })
        s.getTracks().forEach((t) => t.stop())
        await chrome.storage.local.set({ micPrimed: true })
      }
    } catch {
      setErroCaptura('Não foi possível acessar o microfone. Verifique a permissão do Chrome.')
      return
    }

    let tabStreamId: string | null = null
    try {
      tabStreamId = await new Promise<string>((resolve, reject) => {
        chrome.tabCapture.getMediaStreamId({ targetTabId: meetTabId! }, (streamId) => {
          if (chrome.runtime.lastError || !streamId) reject(chrome.runtime.lastError ?? new Error('sem streamId'))
          else resolve(streamId)
        })
      })
    } catch (err) {
      console.warn('[copiloto-ext] falha ao preparar captura da aba do Meet:', err)
    }

    const resp = await chrome.runtime.sendMessage({ type: 'ensureOffscreen' }).catch(() => ({ ok: false }))
    if (!resp?.ok) {
      setErroCaptura('Erro ao preparar a captura em segundo plano. Tente de novo.')
      return
    }

    enviar({ type: 'iniciar', leadId, tabStreamId })
  }

  const abrirResumoNoCrm = () => {
    if (!leadId || !chamadaId) return
    void chrome.tabs.create({ url: `${CRM_BASE_URL}/leads?lead=${leadId}&chamada=${chamadaId}` })
  }

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin text-slate-300" />
      </div>
    )
  }

  if (!profile) return <LoginForm />

  if (!temAcessoAoCopiloto(profile.email)) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="text-sm text-slate-500">Sem acesso ao Copiloto de Vendas.</p>
      </div>
    )
  }

  if (!leadId) {
    if (!autoDetectDone) {
      return (
        <div className="flex h-full items-center justify-center">
          <Loader2 size={20} className="animate-spin text-slate-300" />
        </div>
      )
    }
    return <BuscaLead onEscolher={(l) => setLeadId(l.id)} />
  }

  const maisRecente = sugestoes[sugestoes.length - 1]
  const anteriores = sugestoes.slice(-3, -1).reverse()
  const ultimosBlocos = blocos.slice(-6)

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            {lead ? lead.contactName : 'Copiloto de Vendas'}
          </p>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full bg-red-600 ${status === 'ativa' ? '' : 'opacity-25'}`} />
              {status === 'ativa' ? 'Gravando' : status === 'encerrada' ? 'Encerrada' : 'Pronto'}
            </span>
            <span className={ouvindo.Bruno ? '' : 'opacity-40'}>Bruno: ouvindo</span>
            <span className={ouvindo.Cliente ? '' : 'opacity-40'}>Cliente: ouvindo</span>
          </div>
        </div>
        <span className="text-xs font-semibold tabular-nums text-slate-400">{formatDuracao(duracaoMs)}</span>
      </div>

      {erroCaptura && (
        <p className="flex items-center gap-1.5 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">
          <AlertTriangle size={12} /> {erroCaptura}
        </p>
      )}
      {semAudioCliente && status === 'ativa' && (
        <p className="flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
          <AlertTriangle size={12} /> Áudio do cliente não detectado — só o microfone está sendo transcrito.
        </p>
      )}

      {status === 'aguardando_inicio' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <Mic size={28} className="text-brand-400" />
          <button
            onClick={() => setShowLgpd(true)}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Mic size={14} /> Iniciar
          </button>
        </div>
      )}

      {(status === 'ativa' || status === 'encerrando') && (
        <>
          <div className="flex flex-col gap-2 overflow-hidden px-3 py-2">
            {streaming ? (
              <SugestaoCard tipo={streaming.tipo} resumo={streaming.resumo} frases={streaming.frases} loading />
            ) : maisRecente ? (
              <SugestaoCard tipo={maisRecente.tipo} resumo={maisRecente.resumo} frases={maisRecente.frases} pergunta={maisRecente.pergunta} />
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <Sparkles size={12} /> Sem sugestões ainda.
              </p>
            )}
            {erroSugestao && <p className="text-xs text-amber-600">{erroSugestao}</p>}
            {anteriores.length > 0 && (
              <div className="flex flex-col gap-1 opacity-60">
                {anteriores.map((s) => (
                  <p key={s.id} className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {s.resumo}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto border-t border-slate-100 px-3 py-2 dark:border-slate-800">
            <div className="flex flex-col gap-1">
              {ultimosBlocos.length === 0 && <p className="text-[11px] text-slate-400">Aguardando fala…</p>}
              {ultimosBlocos.map((b) => (
                <p key={b.id} className="text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                  <span className="font-semibold">{b.speaker === 'Bruno' ? 'Bruno: ' : 'Cliente: '}</span>
                  {b.texto}
                </p>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-slate-200 p-2.5 dark:border-slate-700">
            <button
              onClick={() => handlePedirAjuda()}
              disabled={generating || status !== 'ativa'}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-40 hover:bg-brand-700"
            >
              {generating ? <Loader2 size={13} className="animate-spin" /> : <Mic size={13} />}
              Me ajuda agora <span className="text-[10px] font-normal opacity-70">(H)</span>
            </button>
            <div className="flex items-center gap-1.5">
              <input
                value={pergunta}
                onChange={(e) => setPergunta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && pergunta.trim() && !generating) {
                    handlePedirAjuda(pergunta)
                    setPergunta('')
                  }
                }}
                placeholder="Pergunta rápida…"
                disabled={status !== 'ativa'}
                className="h-8 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs outline-none focus:border-brand-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                onClick={() => {
                  if (!pergunta.trim() || generating) return
                  handlePedirAjuda(pergunta)
                  setPergunta('')
                }}
                disabled={!pergunta.trim() || generating || status !== 'ativa'}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300"
              >
                <Send size={12} />
              </button>
              {status === 'ativa' && (
                <button
                  onClick={() => enviar({ type: 'encerrar' })}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                  title="Encerrar chamada"
                >
                  <Square size={12} />
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {status === 'encerrada' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          {!resumoPronto && !erroResumo && (
            <>
              <Loader2 size={24} className="animate-spin text-brand-400" />
              <p className="text-sm text-slate-500">Gerando resumo da chamada…</p>
            </>
          )}
          {erroResumo && <p className="text-sm text-red-500">{erroResumo}</p>}
          {resumoPronto && (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">Chamada encerrada e salva no lead.</p>
              <button
                onClick={abrirResumoNoCrm}
                className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Ver resumo no CRM <ExternalLink size={13} />
              </button>
            </>
          )}
        </div>
      )}

      {showLgpd && <LgpdModal onConfirm={handleConfirmarLgpd} onCancel={() => setShowLgpd(false)} />}
    </div>
  )
}
