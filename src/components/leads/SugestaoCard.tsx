import { AlertCircle, HelpCircle, TrendingUp, Sparkles, Loader2 } from 'lucide-react'
import type { SugestaoTipo } from '../../types/chamada'

const TIPO_META: Record<SugestaoTipo, { label: string; icon: typeof AlertCircle; color: string; bg: string }> = {
  objecao: { label: 'Objeção', icon: AlertCircle, color: '#B45309', bg: '#FEF3C7' },
  duvida: { label: 'Dúvida', icon: HelpCircle, color: '#1D4ED8', bg: '#DBEAFE' },
  sinal_compra: { label: 'Sinal de compra', icon: TrendingUp, color: '#047857', bg: '#D1FAE5' },
  geral: { label: 'Geral', icon: Sparkles, color: '#475569', bg: '#F1F5F9' },
}

export function SugestaoCard({
  tipo,
  resumo,
  frases,
  pergunta,
  loading,
}: {
  tipo: SugestaoTipo
  resumo: string
  frases: string[]
  pergunta?: string
  /** Card ainda recebendo texto do stream — mostra spinner no lugar do que falta. */
  loading?: boolean
}) {
  const meta = TIPO_META[tipo]
  const Icon = meta.icon

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-center gap-1.5">
        <span
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ color: meta.color, backgroundColor: meta.bg }}
        >
          <Icon size={11} /> {meta.label}
        </span>
        {loading && <Loader2 size={12} className="animate-spin text-slate-300" />}
      </div>

      {pergunta && <p className="text-xs italic text-slate-400">Pergunta: "{pergunta}"</p>}

      {resumo && <p className="text-sm text-slate-700 dark:text-slate-200">{resumo}</p>}

      {frases.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {frases.map((frase, i) => (
            <p
              key={i}
              className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-100"
            >
              "{frase}"
            </p>
          ))}
        </div>
      )}

      {loading && !resumo && frases.length === 0 && <p className="text-xs text-slate-400">Gerando sugestão…</p>}
    </div>
  )
}
