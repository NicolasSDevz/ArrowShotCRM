import { useEffect, useRef, useState } from 'react'
import { Mic, Sparkles, Loader2, Send, Square } from 'lucide-react'
import { SugestaoCard } from './SugestaoCard'
import type { CopilotoStatus, OuvindoStatus } from '../../hooks/useCopiloto'
import type { SugestaoParcial } from '../../hooks/useCopilotoSugestoes'
import type { BlocoTranscricao, Sugestao } from '../../types/chamada'

function Ponto({ ativo, cor }: { ativo: boolean; cor: string }) {
  return <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cor, opacity: ativo ? 1 : 0.25 }} />
}

function formatDuracao(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/** Conteúdo da janela flutuante (Document Picture-in-Picture) do Copiloto —
 *  renderizado via Portal (ver CopilotoPage), tudo visível sem precisar
 *  expandir: status de captura, últimas sugestões, últimas falas e o atalho
 *  "Me ajuda agora". Recebe tudo como prop — não tem estado próprio de
 *  captura/transcrição, só exibe o que a aba principal já mantém. */
export function CopilotoFloatingPanel({
  status,
  ouvindo,
  iniciadoEm,
  blocos,
  sugestoes,
  streaming,
  generating,
  onPedirAjuda,
  onEncerrar,
}: {
  status: CopilotoStatus
  ouvindo: OuvindoStatus
  iniciadoEm: number | null
  blocos: BlocoTranscricao[]
  sugestoes: Sugestao[]
  streaming: SugestaoParcial | null
  generating: boolean
  onPedirAjuda: (pergunta?: string) => void
  onEncerrar: () => void
}) {
  const [duracaoMs, setDuracaoMs] = useState(0)
  const [pergunta, setPergunta] = useState('')
  const [confirmandoEncerrar, setConfirmandoEncerrar] = useState(false)
  const [flash, setFlash] = useState(false)
  const ultimaSugestaoIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (status !== 'ativa' || !iniciadoEm) return
    const tick = () => setDuracaoMs(Date.now() - iniciadoEm)
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [status, iniciadoEm])

  // Pisca a borda uma vez quando chega sugestão nova — sem som (vazaria no Meet).
  const maisRecente = sugestoes[sugestoes.length - 1]
  useEffect(() => {
    if (!maisRecente || maisRecente.id === ultimaSugestaoIdRef.current) return
    ultimaSugestaoIdRef.current = maisRecente.id
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 900)
    return () => clearTimeout(t)
  }, [maisRecente])

  const anteriores = sugestoes.slice(-3, -1).reverse()
  const ultimosBlocos = blocos.slice(-4)

  const enviarPergunta = () => {
    if (!pergunta.trim() || generating) return
    onPedirAjuda(pergunta)
    setPergunta('')
  }

  return (
    <div
      className={`flex h-screen flex-col bg-white text-slate-800 transition-shadow dark:bg-slate-900 dark:text-slate-100 ${
        flash ? 'ring-4 ring-brand-400' : ''
      }`}
      style={{ fontFamily: 'inherit' }}
    >
      {/* Status */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <div className="flex items-center gap-2.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <Ponto ativo={status === 'ativa'} cor="#DC2626" />
            {status === 'ativa' ? 'Gravando' : 'Encerrada'}
          </span>
          <span className="flex items-center gap-1">
            <Ponto ativo={ouvindo.Bruno} cor="#2563EB" /> Bruno
          </span>
          <span className="flex items-center gap-1">
            <Ponto ativo={ouvindo.Cliente} cor="#10B981" /> Cliente
          </span>
        </div>
        <span className="text-[11px] font-semibold text-slate-400 tabular-nums">{formatDuracao(duracaoMs)}</span>
      </div>

      {/* Sugestões */}
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

      {/* Últimas falas */}
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

      {/* Ações */}
      <div className="flex flex-col gap-1.5 border-t border-slate-200 p-2.5 dark:border-slate-700">
        <button
          onClick={() => onPedirAjuda()}
          disabled={generating || status !== 'ativa'}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-40 hover:bg-brand-700"
        >
          {generating ? <Loader2 size={13} className="animate-spin" /> : <Mic size={13} />}
          Me ajuda agora
          <span className="text-[10px] font-normal opacity-70">(espaço)</span>
        </button>
        <div className="flex items-center gap-1.5">
          <input
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') enviarPergunta()
            }}
            placeholder="Pergunta rápida…"
            disabled={status !== 'ativa'}
            className="h-8 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs outline-none focus:border-brand-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            onClick={enviarPergunta}
            disabled={!pergunta.trim() || generating || status !== 'ativa'}
            aria-label="Enviar pergunta"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-opacity disabled:opacity-40 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300"
          >
            <Send size={12} />
          </button>

          {status === 'ativa' &&
            (confirmandoEncerrar ? (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={onEncerrar}
                  className="rounded-lg bg-red-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-red-700"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => setConfirmandoEncerrar(false)}
                  className="rounded-lg px-1.5 py-1.5 text-[11px] text-slate-400 hover:text-slate-600"
                >
                  Não
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmandoEncerrar(true)}
                aria-label="Encerrar chamada"
                title="Encerrar chamada"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                <Square size={12} />
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}
