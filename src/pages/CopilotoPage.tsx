import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Mic, MicOff, Square, AlertTriangle, CheckSquare, Square as SquareIcon, Loader2, Radio } from 'lucide-react'
import { useLeads } from '../hooks/useLeads'
import { useAuth } from '../context/AuthContext'
import { useCopiloto } from '../hooks/useCopiloto'
import type { BlocoTranscricao } from '../types/chamada'

// ─── Aviso LGPD ────────────────────────────────────────────────────────────

function LgpdModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [checked, setChecked] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
        <h2 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">Antes de iniciar</h2>
        <p className="mb-4 text-sm text-slate-500">
          A transcrição é feita localmente no seu computador. O áudio não sai do seu navegador.
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

// ─── Página principal ───────────────────────────────────────────────────────

export function CopilotoPage() {
  const { leadId } = useParams<{ leadId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: leads } = useLeads()
  const [showLgpd, setShowLgpd] = useState(false)
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  const lead = leads.find((l) => l.id === leadId)

  const {
    status,
    blocos,
    modelProgress,
    modelReady,
    transcrevendo,
    erroCaptura,
    semAudioCliente,
    iniciar,
    encerrar,
  } = useCopiloto(leadId ?? '')

  // Scroll automático para o final da transcrição
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [blocos.length])

  // Apenas admins podem usar o Copiloto
  if (profile?.role !== 'admin') {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-slate-500">Acesso restrito a administradores.</p>
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

  const handleLgpdConfirm = () => {
    setShowLgpd(false)
    iniciar()
  }

  const blocoInicio = blocos[0]?.timestampMs ?? 0

  const transcreveBruno = [...transcrevendo].some((id) => {
    // IDs pares = Bruno por convenção do hook (não ideal, mas funcional para o indicador)
    return id.endsWith('B')
  })
  const transceveCliente = [...transcrevendo].some((id) => id.endsWith('C'))
  // O hook marca só pelo id numérico, então simplificamos: qualquer pendente = mostrar ambos
  const anyTranscribing = transcrevendo.size > 0

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
              {status === 'carregando_modelo' && 'Carregando modelo Whisper…'}
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
          {status === 'ativa' && (
            <button
              onClick={encerrar}
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

      {/* Progresso do download do modelo */}
      {status === 'carregando_modelo' && modelProgress && (
        <div className="border-b border-slate-200 bg-amber-50 px-5 py-2.5 dark:border-slate-700 dark:bg-amber-950/40">
          <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
            <Loader2 size={14} className="animate-spin" />
            <span>
              Baixando modelo Whisper-small pela primeira vez (~244 MB, cacheado após isso)…
              {' '}
              {Math.round(modelProgress.progress)}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-amber-200 dark:bg-amber-900">
            <div
              className="h-full rounded-full bg-amber-600 transition-all"
              style={{ width: `${modelProgress.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Aviso de modelo carregando (sem progresso ainda) */}
      {status === 'carregando_modelo' && !modelProgress && (
        <div className="border-b border-slate-200 bg-amber-50 px-5 py-2.5 dark:border-slate-700 dark:bg-amber-950/40">
          <p className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
            <Loader2 size={14} className="animate-spin" />
            Inicializando modelo Whisper-small (na primeira vez, aguarde o download de ~244 MB)…
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
      <div className="flex flex-1 overflow-hidden">
        {/* Esquerda: Transcrição */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-2.5 dark:border-slate-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Transcrição ao vivo</p>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <span className="h-2 w-2 rounded-full bg-brand-500" /> Bruno (mic)
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Cliente (aba Meet)
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {status === 'aguardando_inicio' || status === 'carregando_modelo' ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                {modelReady ? (
                  <>
                    <Mic size={32} className="text-brand-400" />
                    <p className="text-sm text-slate-500">Clique <strong>Iniciar</strong> para começar a transcrição.</p>
                    <p className="text-xs text-slate-400">Você precisará autorizar acesso ao microfone e compartilhar a aba do Meet.</p>
                  </>
                ) : (
                  <>
                    <Loader2 size={32} className="animate-spin text-slate-300" />
                    <p className="text-sm text-slate-400">Carregando modelo…</p>
                  </>
                )}
              </div>
            ) : blocos.length === 0 && status === 'ativa' ? (
              <p className="pt-8 text-center text-sm text-slate-400">Aguardando fala…</p>
            ) : (
              <div className="flex flex-col gap-3">
                {blocos.map((b) => (
                  <BlocoItem key={b.id} bloco={b} inicioMs={blocoInicio} />
                ))}
                {anyTranscribing && (
                  <TranscrevingIndicator speaker="Bruno" />
                )}
                <div ref={transcriptEndRef} />
              </div>
            )}

            {status === 'encerrada' && blocos.length > 0 && (
              <div className="mt-6 rounded-xl bg-green-50 p-4 text-center dark:bg-green-950/40">
                <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                  Chamada encerrada — {blocos.length} bloco{blocos.length !== 1 ? 's' : ''} salvos.
                </p>
                <p className="mt-1 text-xs text-green-600 dark:text-green-500">
                  Resumo e follow-up estarão disponíveis na Etapa 3.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Direita: Sugestões (Etapa 2 — placeholder) */}
        <div className="flex w-80 shrink-0 flex-col overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-2.5 dark:border-slate-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sugestões do Assistente</p>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Etapa 2</p>
              <p className="mt-1 text-xs text-slate-400">
                As sugestões ao vivo com Claude Haiku serão implementadas na próxima etapa.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modal LGPD */}
      {showLgpd && (
        <LgpdModal onConfirm={handleLgpdConfirm} onCancel={() => setShowLgpd(false)} />
      )}
    </div>
  )
}
