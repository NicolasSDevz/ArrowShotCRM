import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Mic, Square, AlertTriangle, Loader2, Radio, ArrowRight, Sparkles, Send, Clock, Gauge, PictureInPicture2 } from 'lucide-react'
import { useLeads } from '../hooks/useLeads'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useCopiloto } from '../hooks/useCopiloto'
import { useCopilotoSugestoes } from '../hooks/useCopilotoSugestoes'
import { useDocumentPip } from '../hooks/useDocumentPip'
import { SugestaoCard } from '../components/leads/SugestaoCard'
import { ResumoReview } from '../components/leads/ResumoReview'
import { CopilotoFloatingPanel } from '../components/leads/CopilotoFloatingPanel'
import { Button } from '../components/ui/Button'
import { gerarResumoChamada } from '../services/copilotoResumoService'
import { salvarResumo } from '../services/chamadaService'
import { updateLead } from '../services/leadService'
import { buildLeadUpdateFromResumo } from '../utils/leadResumoUpdate'
import { temAcessoAoCopiloto } from '../config/copilotoAccess'
import type { BlocoTranscricao, ResumoChamada } from '../types/chamada'

const PIP_USADO_KEY = 'copiloto_pip_usado'

function pipFoiUsadoAntes(): boolean {
  try {
    return localStorage.getItem(PIP_USADO_KEY) === '1'
  } catch {
    return false
  }
}

function marcarPipUsado() {
  try {
    localStorage.setItem(PIP_USADO_KEY, '1')
  } catch {
    /* modo privado / storage bloqueado — só não abre sozinho na próxima */
  }
}

// ─── Aviso LGPD ────────────────────────────────────────────────────────────

function LgpdModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [checked, setChecked] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
        <h2 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">Antes de iniciar</h2>
        <p className="mb-4 text-sm text-slate-500">
          A fala é cortada por frase no seu navegador e enviada para transcrição via API (Groq Whisper) — diferente
          da versão anterior, o áudio sai do navegador para esse processamento. Só o texto resultante é salvo no
          CRM; não guardamos o áudio.
        </p>

        <div className="mb-4 rounded-xl bg-amber-50 p-4 dark:bg-amber-950/50">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Frase sugerida para o cliente:</p>
          <p className="mt-1 text-sm italic text-amber-700 dark:text-amber-400">
            "Pra eu não perder nenhum detalhe do que você me contar, vou deixar uma transcrição da nossa conversa rodando. Tudo bem?"
          </p>
        </div>

        <label className="mb-5 flex cursor-pointer items-start gap-3">
          <button
            role="checkbox"
            aria-checked={checked}
            onClick={() => setChecked((v) => !v)}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
              checked ? 'border-brand-600 bg-brand-600' : 'border-slate-300'
            }`}
          >
            {checked && (
              <svg viewBox="0 0 12 10" fill="none" className="h-3 w-3">
                <path d="M1 5l3.5 3.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          <span className="text-sm text-slate-700 dark:text-slate-300">
            Informei o cliente que a conversa será transcrita para registro
          </span>
        </label>

        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            disabled={!checked}
            className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40 hover:bg-brand-700"
          >
            Iniciar Copiloto
          </button>
          <button
            onClick={onCancel}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Bloco de transcrição ───────────────────────────────────────────────────

function BlocoItem({ bloco, inicioMs }: { bloco: BlocoTranscricao; inicioMs: number }) {
  const elapsed = bloco.timestampMs - inicioMs
  const mins = Math.floor(elapsed / 60000)
  const secs = Math.floor((elapsed % 60000) / 1000)
  const timeLabel = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  const isBruno = bloco.speaker === 'Bruno'

  return (
    <div className={`flex gap-2.5 ${isBruno ? 'flex-row' : 'flex-row-reverse'}`}>
      <div
        className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          isBruno ? 'bg-brand-100 text-brand-700' : 'bg-emerald-100 text-emerald-700'
        }`}
      >
        {isBruno ? 'B' : 'C'}
      </div>
      <div className={`max-w-[80%] ${isBruno ? '' : 'items-end'} flex flex-col gap-0.5`}>
        <div className={`flex items-center gap-1.5 ${isBruno ? '' : 'flex-row-reverse'}`}>
          <span className="text-[11px] font-semibold text-slate-400">{bloco.speaker}</span>
          <span className="text-[11px] text-slate-300">{timeLabel}</span>
        </div>
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
            isBruno
              ? 'rounded-tl-sm bg-brand-50 text-slate-800 dark:bg-brand-950 dark:text-slate-100'
              : 'rounded-tr-sm bg-emerald-50 text-slate-800 dark:bg-emerald-950 dark:text-slate-100'
          }`}
        >
          {bloco.texto}
        </div>
      </div>
    </div>
  )
}

// ─── Indicador "transcrevendo" ──────────────────────────────────────────────

function TranscrevingIndicator({ speaker }: { speaker: 'Bruno' | 'Cliente' }) {
  return (
    <div className={`flex items-center gap-2 text-xs text-slate-400 ${speaker === 'Cliente' ? 'flex-row-reverse' : ''}`}>
      <Loader2 size={12} className="animate-spin" />
      <span>transcrevendo {speaker}…</span>
    </div>
  )
}

// ─── Status "ouvindo" por fonte ─────────────────────────────────────────────

function FonteStatus({ label, ativo, cor }: { label: string; ativo: boolean; cor: string }) {
  return (
    <span className="flex items-center gap-1 text-xs text-slate-400">
      <span className={`h-2 w-2 rounded-full ${ativo ? '' : 'opacity-30'}`} style={{ backgroundColor: cor }} />
      {label}
      {ativo ? ': ouvindo' : ''}
    </span>
  )
}

// ─── Página principal ───────────────────────────────────────────────────────

export function CopilotoPage() {
  const { leadId } = useParams<{ leadId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { theme } = useTheme()
  const { data: leads } = useLeads()
  const [showLgpd, setShowLgpd] = useState(false)
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  const lead = leads.find((l) => l.id === leadId)

  const {
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
  } = useCopiloto(leadId ?? '')

  const { sugestoes, streaming, generating, erro: erroSugestao, pedirAjuda } = useCopilotoSugestoes(
    leadId ?? '',
    chamadaId,
    blocos,
    ultimoBlocoRecebido,
    profile?.id
  )
  const [pergunta, setPergunta] = useState('')

  // ─── Janela flutuante (Picture-in-Picture) ─────────────────────────────
  const pip = useDocumentPip()

  // Mantém o tema (claro/escuro) em dia na janela flutuante — ela tem um
  // document próprio, não herda o data-theme do document principal.
  useEffect(() => {
    if (!pip.pipWindow) return
    if (theme === 'dark') pip.pipWindow.document.documentElement.setAttribute('data-theme', 'dark')
    else pip.pipWindow.document.documentElement.removeAttribute('data-theme')
  }, [theme, pip.pipWindow])

  // Atalho de teclado (espaço ou H) com a janela flutuante em foco —
  // precisa escutar no document DELA, não no da aba principal.
  useEffect(() => {
    const win = pip.pipWindow
    if (!win) return
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (e.key === ' ' || e.key.toLowerCase() === 'h') {
        e.preventDefault()
        if (status === 'ativa' && !generating) pedirAjuda()
      }
    }
    win.document.addEventListener('keydown', onKeyDown)
    return () => win.document.removeEventListener('keydown', onKeyDown)
  }, [pip.pipWindow, status, generating, pedirAjuda])

  const handleAbrirPip = async () => {
    const win = await pip.open()
    if (win) marcarPipUsado()
  }

  // ─── Resumo pós-chamada (Etapa 3) ──────────────────────────────────────
  const [resumo, setResumo] = useState<Omit<ResumoChamada, 'geradoEm'> | null>(null)
  const [gerandoResumo, setGerandoResumo] = useState(false)
  const [erroResumo, setErroResumo] = useState<string | null>(null)
  const [salvandoResumo, setSalvandoResumo] = useState(false)
  const resumoGeradoParaRef = useRef<string | null>(null)

  const gerarResumo = async () => {
    if (!leadId || !chamadaId) return
    setGerandoResumo(true)
    setErroResumo(null)
    try {
      const r = await gerarResumoChamada(leadId, blocos, sugestoes)
      setResumo(r)
    } catch (err) {
      console.error('[copiloto] falha ao gerar resumo:', err)
      setErroResumo(err instanceof Error ? err.message : 'Falha ao gerar o resumo')
    } finally {
      setGerandoResumo(false)
    }
  }

  // Gera sozinho assim que a chamada encerra — uma vez só por chamadaId.
  useEffect(() => {
    if (status !== 'encerrada' || !chamadaId || resumoGeradoParaRef.current === chamadaId) return
    resumoGeradoParaRef.current = chamadaId
    void gerarResumo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, chamadaId])

  const handleSalvarResumo = async () => {
    if (!resumo || !leadId || !chamadaId || !profile || !lead) return
    setSalvandoResumo(true)
    try {
      await salvarResumo(leadId, chamadaId, resumo, profile.id)
      await updateLead(leadId, buildLeadUpdateFromResumo(resumo), profile.id, profile.name)
      toast.success('Resumo salvo no lead')
      navigate(`/leads?lead=${leadId}&chamada=${chamadaId}`)
    } catch (err) {
      console.error('[copiloto] falha ao salvar resumo:', err)
      toast.error('Erro ao salvar o resumo')
    } finally {
      setSalvandoResumo(false)
    }
  }

  // Scroll automático para o final da transcrição
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [blocos.length])

  // Avisa que a transcrição já está salva no lead, com link direto pra ela
  // (ver LeadChamadasTab) — dispara uma vez só por chamada encerrada.
  const toastFiredForRef = useRef<string | null>(null)
  useEffect(() => {
    if (status !== 'encerrada' || !chamadaId || !leadId || toastFiredForRef.current === chamadaId) return
    toastFiredForRef.current = chamadaId
    toast.success(
      (t) => (
        <span className="flex items-center gap-2">
          Transcrição salva no lead.
          <button
            onClick={() => {
              toast.dismiss(t.id)
              navigate(`/leads?lead=${leadId}&chamada=${chamadaId}`)
            }}
            className="flex items-center gap-1 font-semibold text-brand-600 underline hover:text-brand-700"
          >
            Abrir lead <ArrowRight size={12} />
          </button>
        </span>
      ),
      { duration: 10000 }
    )
  }, [status, chamadaId, leadId, navigate])

  // Lista fixa (não por role) — ver src/config/copilotoAccess.ts
  if (!temAcessoAoCopiloto(profile?.email)) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-slate-500">Acesso restrito ao Copiloto de Vendas.</p>
      </div>
    )
  }

  // Aviso para navegadores incompatíveis
  const isChrome = /Chrome/.test(navigator.userAgent) && !/Edge|Edg|OPR/.test(navigator.userAgent)
  if (!isChrome) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <AlertTriangle size={40} className="text-amber-500" />
        <p className="text-center text-slate-600 dark:text-slate-300">
          O Copiloto de Vendas requer <strong>Google Chrome para desktop</strong>.
          <br />
          Abra esta página no Chrome para continuar.
        </p>
        <button onClick={() => navigate('/leads')} className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          Voltar para Leads
        </button>
      </div>
    )
  }

  const handleIniciar = () => {
    if (status === 'aguardando_inicio') setShowLgpd(true)
  }

  const handleLgpdConfirm = async () => {
    setShowLgpd(false)
    await iniciar()
    // Abre a janela flutuante sozinha só se o Bruno já usou antes — a 1ª vez
    // é sempre pelo botão. Pode falhar silenciosamente aqui (o Chrome exige
    // gesto do usuário "fresco"; depois de esperar permissão de mic/aba essa
    // janela de gesto pode já ter se esgotado) — se falhar, o botão "Janela
    // flutuante" continua disponível pra abrir com 1 clique extra.
    if (pipFoiUsadoAntes()) void pip.open()
  }

  const handleEncerrar = () => {
    pip.close()
    void encerrar()
  }

  const blocoInicio = blocos[0]?.timestampMs ?? 0

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              status === 'ativa'
                ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400'
                : 'bg-slate-100 text-slate-400 dark:bg-slate-700'
            }`}
          >
            <Radio size={15} className={status === 'ativa' ? 'animate-pulse' : ''} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
              Copiloto de Vendas
              {lead && ` — ${lead.contactName}${lead.companyName ? ` · ${lead.companyName}` : ''}`}
            </p>
            <p className="text-xs text-slate-400">
              {status === 'aguardando_inicio' && 'Pronto para iniciar'}
              {status === 'ativa' && `${blocos.length} bloco${blocos.length !== 1 ? 's' : ''} transcritos`}
              {status === 'encerrando' && 'Encerrando…'}
              {status === 'encerrada' && 'Chamada encerrada'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status === 'aguardando_inicio' && (
            <button
              onClick={handleIniciar}
              className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Mic size={14} /> Iniciar
            </button>
          )}
          {status === 'ativa' && !pip.pipWindow && pip.isSupported && (
            <button
              onClick={handleAbrirPip}
              title="Ver sugestões por cima do Meet, sem trocar de aba"
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <PictureInPicture2 size={14} /> Janela flutuante
            </button>
          )}
          {status === 'ativa' && !pip.isSupported && (
            <p className="hidden max-w-[220px] text-[11px] leading-tight text-slate-400 sm:block">
              Pra ver as sugestões junto com o Meet, use dois monitores ou coloque as janelas lado a lado.
            </p>
          )}
          {status === 'ativa' && (
            <button
              onClick={handleEncerrar}
              className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              <Square size={14} /> Encerrar
            </button>
          )}
          <button
            onClick={() => navigate('/leads')}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Voltar
          </button>
        </div>
      </header>

      {/* Limite diário/por hora do Groq atingido */}
      {groqStatus.dailyLimitReached && (
        <div className="border-b border-red-200 bg-red-50 px-5 py-2 dark:border-red-800 dark:bg-red-950/40">
          <p className="flex items-center gap-2 text-xs text-red-700 dark:text-red-400">
            <AlertTriangle size={13} />
            Transcrição pausada: limite diário atingido. O que já foi transcrito está salvo — trechos novos só
            voltam a ser transcritos quando o limite liberar.
          </p>
        </div>
      )}

      {/* Aviso sem áudio do cliente */}
      {semAudioCliente && status === 'ativa' && (
        <div className="border-b border-slate-200 bg-amber-50 px-5 py-2 dark:border-slate-700 dark:bg-amber-950/40">
          <p className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle size={13} />
            Áudio da aba do cliente não detectado. Para corrigir: clique "Encerrar", reabra o Copiloto e, ao compartilhar, marque a opção{' '}
            <strong>"Compartilhar áudio da aba"</strong>.
          </p>
        </div>
      )}

      {/* Erro de captura */}
      {erroCaptura && (
        <div className="border-b border-red-200 bg-red-50 px-5 py-2 dark:border-red-800 dark:bg-red-950/40">
          <p className="flex items-center gap-2 text-xs text-red-700 dark:text-red-400">
            <AlertTriangle size={13} /> {erroCaptura}
          </p>
        </div>
      )}

      {/* Conteúdo principal */}
      {status === 'encerrada' ? (
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {gerandoResumo && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
                <Loader2 size={28} className="animate-spin text-brand-400" />
                <p className="text-sm text-slate-500">Gerando resumo da chamada…</p>
              </div>
            )}

            {!gerandoResumo && erroResumo && !resumo && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950/40">
                <AlertTriangle size={24} className="text-red-500" />
                <p className="text-sm text-red-700 dark:text-red-400">{erroResumo}</p>
                <Button variant="secondary" size="sm" onClick={gerarResumo}>
                  Gerar resumo agora
                </Button>
              </div>
            )}

            {!gerandoResumo && resumo && (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Resumo da chamada
                    {lead && ` — ${lead.contactName}${lead.companyName ? ` · ${lead.companyName}` : ''}`}
                  </p>
                  <ResumoReview resumo={resumo} onChange={setResumo} onSalvar={handleSalvarResumo} salvando={salvandoResumo} />
                </div>

                {sugestoes.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Sugestões que apareceram durante a chamada
                    </p>
                    <div className="flex flex-col gap-2.5">
                      {sugestoes.map((s) => (
                        <SugestaoCard key={s.id} tipo={s.tipo} resumo={s.resumo} frases={s.frases} pergunta={s.pergunta} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {blocos.length > 0 && (
              <details className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Transcrição completa ({blocos.length} bloco{blocos.length !== 1 ? 's' : ''})
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  {blocos.map((b) => (
                    <BlocoItem key={b.id} bloco={b} inicioMs={blocoInicio} />
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      ) : (
      <div className="flex flex-1 overflow-hidden">
        {/* Esquerda: Transcrição */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-slate-200 dark:border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-y-1.5 border-b border-slate-100 px-5 py-2.5 dark:border-slate-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Transcrição ao vivo</p>
            <div className="flex items-center gap-3">
              <FonteStatus label="Bruno" ativo={ouvindo.Bruno} cor="#2563EB" />
              <FonteStatus label="Cliente" ativo={ouvindo.Cliente} cor="#10B981" />
              {status === 'ativa' && (
                <>
                  <span
                    className="flex items-center gap-1 text-xs"
                    style={{ color: atrasoMedioMs != null && atrasoMedioMs > 3000 ? '#D97706' : '#94A3B8' }}
                    title="Atraso médio entre o fim da fala e o texto aparecer"
                  >
                    <Clock size={11} /> {atrasoMedioMs != null ? `~${(atrasoMedioMs / 1000).toFixed(1)}s` : '—'}
                  </span>
                  <span
                    className="flex items-center gap-1 text-xs text-slate-400"
                    title="Requisições de transcrição no último minuto / segundos de áudio transcritos hoje"
                  >
                    <Gauge size={11} /> {groqStatus.requestsThisMinute}/min · {Math.round(groqStatus.audioSecondsToday)}s hoje
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {status === 'aguardando_inicio' ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <Mic size={32} className="text-brand-400" />
                <p className="text-sm text-slate-500">Clique <strong>Iniciar</strong> para começar a transcrição.</p>
                <p className="text-xs text-slate-400">Você precisará autorizar acesso ao microfone e compartilhar a aba do Meet.</p>
              </div>
            ) : blocos.length === 0 && status === 'ativa' ? (
              <p className="pt-8 text-center text-sm text-slate-400">Aguardando fala…</p>
            ) : (
              <div className="flex flex-col gap-3">
                {blocos.map((b) => (
                  <BlocoItem key={b.id} bloco={b} inicioMs={blocoInicio} />
                ))}
                {[...transcrevendo.values()].map((speaker, i) => (
                  <TranscrevingIndicator key={i} speaker={speaker} />
                ))}
                <div ref={transcriptEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Direita: Sugestões ao vivo (Etapa 2) */}
        <div className="flex w-80 shrink-0 flex-col overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-2.5 dark:border-slate-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sugestões do Assistente</p>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            {erroSugestao && (
              <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                <AlertTriangle size={12} /> {erroSugestao}
              </p>
            )}

            {!streaming && sugestoes.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                <Sparkles size={26} className="text-slate-300" />
                <p className="text-sm text-slate-400">
                  Sugestões aparecem aqui quando o cliente trouxer objeção, dúvida ou sinal de compra — ou quando você pedir ajuda.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {streaming && (
                  <SugestaoCard tipo={streaming.tipo} resumo={streaming.resumo} frases={streaming.frases} loading />
                )}
                {[...sugestoes].reverse().map((s) => (
                  <SugestaoCard key={s.id} tipo={s.tipo} resumo={s.resumo} frases={s.frases} pergunta={s.pergunta} />
                ))}
              </div>
            )}
          </div>

          {/* Pedido manual de ajuda */}
          <div className="flex flex-col gap-2 border-t border-slate-100 p-3 dark:border-slate-700">
            <button
              onClick={() => pedirAjuda()}
              disabled={generating || status !== 'ativa'}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40 hover:bg-brand-700"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Me ajuda agora
            </button>
            <div className="flex items-center gap-1.5">
              <input
                value={pergunta}
                onChange={(e) => setPergunta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && pergunta.trim() && !generating) {
                    pedirAjuda(pergunta)
                    setPergunta('')
                  }
                }}
                placeholder="Pergunte algo rápido…"
                disabled={status !== 'ativa'}
                className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                onClick={() => {
                  if (!pergunta.trim() || generating) return
                  pedirAjuda(pergunta)
                  setPergunta('')
                }}
                disabled={!pergunta.trim() || generating || status !== 'ativa'}
                aria-label="Enviar pergunta"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-opacity disabled:opacity-40 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Modal LGPD */}
      {showLgpd && (
        <LgpdModal onConfirm={handleLgpdConfirm} onCancel={() => setShowLgpd(false)} />
      )}

      {/* Janela flutuante — mesmo estado da aba principal, via Portal */}
      {pip.pipWindow &&
        createPortal(
          <CopilotoFloatingPanel
            status={status}
            ouvindo={ouvindo}
            iniciadoEm={iniciadoEm}
            blocos={blocos}
            sugestoes={sugestoes}
            streaming={streaming}
            generating={generating}
            onPedirAjuda={pedirAjuda}
            onEncerrar={handleEncerrar}
          />,
          pip.pipWindow.document.body
        )}
    </div>
  )
}
