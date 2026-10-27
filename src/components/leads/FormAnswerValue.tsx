import type { LeadFormQuestion } from '../../types/leadForm'

/** Tipos de pergunta em que a resposta é uma ou mais opções (viram etiquetas). */
const CHOICE_TYPES = new Set(['single_choice', 'multi_choice'])

/** "Campo: valor · Campo: valor" (grupo de campos) vira pares lado a lado. */
function asPairs(value: string): { k: string; v: string }[] | null {
  if (!value.includes(' · ')) return null
  const parts = value.split(' · ').map((p) => p.trim())
  const pairs = parts.map((p) => {
    const i = p.indexOf(': ')
    return i > 0 && i <= 40 ? { k: p.slice(0, i), v: p.slice(i + 2) } : null
  })
  return pairs.every(Boolean) ? (pairs as { k: string; v: string }[]) : null
}

/** Valor de uma resposta de formulário: link clicável, lista com marcadores,
 *  pares de campos, etiquetas de opção ou texto (mantendo as quebras de linha). */
export function FormAnswerValue({ value, type }: { value: string; type?: LeadFormQuestion['type'] }) {
  const clean = value.trim()
  if (/^https?:\/\/\S+$/.test(clean)) {
    return (
      <a href={clean} target="_blank" rel="noopener noreferrer" className="break-all text-[15px] font-medium text-brand-600 underline underline-offset-2">
        {clean}
      </a>
    )
  }
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length > 0 && lines.every((l) => l.startsWith('• '))) {
    return (
      <ul className="flex flex-col gap-1">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2 text-[15px] text-slate-900">
            <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
            <span className="min-w-0 break-words">{l.slice(2)}</span>
          </li>
        ))}
      </ul>
    )
  }
  const pairs = asPairs(clean)
  if (pairs) {
    return (
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
        {pairs.map((p, i) => (
          <div key={i} className="contents">
            <dt className="text-sm text-slate-500">{p.k}</dt>
            <dd className="text-[15px] font-medium text-slate-900">{p.v}</dd>
          </div>
        ))}
      </dl>
    )
  }
  if (type && CHOICE_TYPES.has(type)) {
    const chips = clean.split(', ').filter(Boolean)
    return (
      <ul className="flex flex-wrap gap-1.5" aria-label={`${chips.length} ${chips.length === 1 ? 'opção marcada' : 'opções marcadas'}`}>
        {chips.map((c, i) => (
          <li key={i} className="rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-sm font-medium text-brand-700">
            {c}
          </li>
        ))}
      </ul>
    )
  }
  return <p className="whitespace-pre-line break-words text-[15px] leading-relaxed text-slate-900">{clean}</p>
}

/** Lista de perguntas e respostas de um formulário, numerada e em uma coluna:
 *  pergunta em cima, resposta embaixo com destaque. Lida como lista de
 *  definições pelo leitor de tela (pergunta, depois resposta). */
export function FormAnswersList({
  answers,
  questions,
  hidden = false,
  limit,
}: {
  answers: { questionId?: string; label: string; value: string }[]
  /** Perguntas do formulário (para saber o tipo e mostrar opções como etiquetas). */
  questions?: LeadFormQuestion[]
  /** Modo apresentação: esconde o conteúdo das respostas. */
  hidden?: boolean
  /** Mostra só as primeiras N. */
  limit?: number
}) {
  const typeOf = new Map((questions ?? []).map((q) => [q.id, q.type]))
  const shown = limit ? answers.slice(0, limit) : answers
  return (
    <dl className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {shown.map((a, i) => (
        <div key={a.questionId ?? i} className="flex gap-3 px-4 py-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold tabular-nums text-slate-500"
          >
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <dt className="text-[13px] font-medium leading-snug text-slate-500">{a.label || 'Pergunta'}</dt>
            <dd className="mt-1">
              {hidden ? <p className="text-sm text-slate-400">••••••</p> : <FormAnswerValue value={a.value} type={a.questionId ? typeOf.get(a.questionId) : undefined} />}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  )
}
