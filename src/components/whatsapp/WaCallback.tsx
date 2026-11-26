import { useEffect, useId, useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarClock } from 'lucide-react'
import { updateWaConversation } from '../../services/whatsappService'
import type { WaCallback, WaConversation } from '../../types/whatsapp'

/** Retorno combinado ("me chama mês que vem"): ver runCallbacks em api/_lib/whatsapp.js. */

/** "2026-12-26" → "26/12" (ou "26/12/2027" se for outro ano). */
export function callbackDayLabel(date: string) {
  const [y, m, d] = date.split('-')
  return y === String(new Date().getFullYear()) ? `${d}/${m}` : `${d}/${m}/${y}`
}

const fullDay = (date: string) =>
  new Date(`${date}T12:00:00-03:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })

const spToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const spTomorrow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 86400_000))

function statusText(cb: WaCallback) {
  if (cb.status === 'pending') return `Vamos chamar ${cb.date <= spToday() ? 'hoje' : `em ${fullDay(cb.date)}`}.`
  if (cb.status === 'sending') return 'Enviando agora…'
  if (cb.status === 'sent') return `Mensagem de retorno enviada${cb.sentAt ? ` em ${new Date(cb.sentAt).toLocaleDateString('pt-BR')}` : ''}.`
  if (cb.status === 'failed') return `Não saiu no dia ${callbackDayLabel(cb.date)}: ${cb.error || 'erro desconhecido'}`
  return `Cancelado${cb.note ? `: ${cb.note}` : ''}.`
}

/** Linha curta (ficha do lead). */
export function CallbackLine({ cb }: { cb?: WaCallback | null }) {
  if (!cb || (cb.status !== 'pending' && cb.status !== 'failed')) return null
  return (
    <p className={`mt-0.5 flex items-center gap-1 text-xs ${cb.status === 'failed' ? 'text-amber-500' : 'text-sky-400'}`}>
      <CalendarClock size={12} aria-hidden="true" />
      {cb.status === 'pending' ? `Retomar em ${callbackDayLabel(cb.date)}${cb.why ? ` (${cb.why})` : ''}` : `Retorno não saiu: ${cb.error || 'erro'}`}
    </p>
  )
}

/** Caixa no Raio-x: mostra, marca, muda ou cancela o retorno. */
export function CallbackBox({ conv }: { conv: WaConversation }) {
  const cb = conv.callback
  const pending = cb?.status === 'pending'
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(pending ? cb.date : '')
  const [why, setWhy] = useState(pending ? cb.why : '')
  const [busy, setBusy] = useState(false)
  const id = useId()
  useEffect(() => {
    setEditing(false)
    setDate(cb?.status === 'pending' ? cb.date : '')
    setWhy(cb?.status === 'pending' ? cb.why : '')
  }, [conv.waId, cb?.status, cb?.date, cb?.why])

  const save = async (next: { date: string; why?: string } | null) => {
    setBusy(true)
    try {
      await updateWaConversation(conv.waId, { callback: next })
      toast.success(next ? `Retorno marcado para ${callbackDayLabel(next.date)}` : 'Retorno cancelado')
      setEditing(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3" aria-labelledby={`${id}-t`} role="group">
      <div className="flex items-center gap-2">
        <CalendarClock size={15} className="shrink-0 text-sky-400" aria-hidden="true" />
        <p id={`${id}-t`} className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Retorno combinado
        </p>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="rounded-lg px-2 py-1 text-xs font-semibold text-sky-400 hover:bg-slate-100">
            {pending ? 'Mudar' : 'Marcar'}
          </button>
        )}
        {!editing && pending && (
          <button type="button" disabled={busy} onClick={() => save(null)} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-red-400 disabled:opacity-50">
            Cancelar
          </button>
        )}
      </div>
      {!editing &&
        (cb ? (
          <p className={`mt-1.5 text-sm ${cb.status === 'failed' ? 'text-amber-500' : 'text-slate-700'}`} role="status">
            {cb.status === 'pending' && <strong className="font-semibold">{callbackDayLabel(cb.date)}. </strong>}
            {statusText(cb)}
            {cb.why && <span className="block text-xs text-slate-500">Motivo: {cb.why}</span>}
            {cb.status === 'pending' && (
              <span className="block text-xs text-slate-400">
                {cb.source === 'team' ? `Marcado ${cb.setBy ? `por ${cb.setBy}` : 'pela equipe'}` : 'Combinado pela IA na conversa'}. Até lá o follow-up fica parado.
              </span>
            )}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-slate-400">Nenhum. Quando a pessoa pede pra falar mais pra frente, a IA marca sozinha.</p>
        ))}
      {editing && (
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Dia
            <input
              type="date"
              value={date}
              min={spTomorrow()}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-transparent px-2 text-sm text-slate-800"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Motivo (opcional, só a equipe vê)
            <input
              value={why}
              maxLength={160}
              onChange={(e) => setWhy(e.target.value)}
              placeholder="Ex.: sem verba até dezembro"
              className="h-9 rounded-lg border border-slate-200 bg-transparent px-2 text-sm text-slate-800 placeholder:text-slate-400"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!date || busy}
              onClick={() => save({ date, why })}
              className="inline-flex h-8 items-center rounded-lg bg-sky-500 px-3 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {busy ? 'Salvando…' : 'Salvar retorno'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="h-8 rounded-lg px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100">
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
