import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Check, Mail, MessageCircle, ShoppingCart, Trash2, Undo2 } from 'lucide-react'
import { EmptyState } from '../../ui/EmptyState'
import { Badge } from '../../ui/Badge'
import { storeAbandonedAction } from '../../../services/storeApi'
import { formatCents, type StoreAbandoned } from '../../../types/store'

/** Carrinho vira "abandonado" 15 min depois da última mexida sem pagar. */
const ABANDON_MS = 15 * 60_000

type Filter = 'open' | 'contacted' | 'recovered' | 'live'

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 60) return `há ${Math.max(1, min)} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}

/** Mensagem pronta pro WhatsApp (a pessoa edita antes de mandar). */
function whatsappLink(a: StoreAbandoned) {
  const digits = String(a.phone || '').replace(/\D/g, '')
  if (digits.length < 10) return null
  const phone = digits.length <= 11 ? `55${digits}` : digits
  const first = a.name.split(' ')[0] || ''
  const text = `Oi ${first}! Vi que você começou a compra de ${a.productName} e não finalizou. Ficou alguma dúvida? Posso te ajudar por aqui.`
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
}

/** Loja > Abandonados: quem preencheu os dados no checkout e não pagou. */
export function StoreAbandonedPanel({ carts, compact = false }: { carts: StoreAbandoned[]; compact?: boolean }) {
  const [filter, setFilter] = useState<Filter>('open')
  const [busy, setBusy] = useState<string | null>(null)

  const groups = useMemo(() => {
    const now = Date.now()
    const live = carts.filter((a) => !a.recoveredAt && now - new Date(a.updatedAt).getTime() <= ABANDON_MS)
    const abandoned = carts.filter((a) => !a.recoveredAt && now - new Date(a.updatedAt).getTime() > ABANDON_MS)
    return {
      open: abandoned.filter((a) => !a.contactedAt),
      contacted: abandoned.filter((a) => a.contactedAt),
      recovered: carts.filter((a) => a.recoveredAt),
      live,
    }
  }, [carts])

  const run = async (a: StoreAbandoned, op: 'contacted' | 'uncontacted' | 'delete') => {
    setBusy(a.id)
    try {
      await storeAbandonedAction(a.id, op)
      if (op === 'delete') toast.success('Carrinho apagado')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const filters: { key: Filter; label: string }[] = [
    { key: 'open', label: 'Para chamar' },
    { key: 'contacted', label: 'Já chamei' },
    { key: 'recovered', label: 'Recuperados' },
    { key: 'live', label: 'No checkout agora' },
  ]
  const list = groups[filter]
  const lost = [...groups.open, ...groups.contacted].reduce((s, a) => s + a.amount, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Filtrar carrinhos" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filter === f.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {f.label} <span className="ml-0.5 opacity-60">{groups[f.key].length}</span>
            </button>
          ))}
        </div>
        {lost > 0 && <p className="text-xs text-slate-500">{formatCents(lost)} parados em carrinhos abandonados</p>}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart size={32} />}
          title={filter === 'open' ? 'Ninguém pra chamar agora' : 'Nada por aqui'}
          description="Quem preenche nome e e-mail no checkout e não paga em 15 minutos aparece aqui, com o celular pra chamar no WhatsApp. Quem compra depois sai sozinho da lista."
        />
      ) : (
        <ul className={`grid gap-3 ${compact ? '' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
          {list.map((a) => {
            const wa = whatsappLink(a)
            return (
              <li key={a.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">{a.name || a.email}</p>
                    <p className="truncate text-xs text-slate-500">{a.email}{a.phone ? ` · ${a.phone}` : ''}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-slate-800 tabular-nums">{formatCents(a.amount)}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {a.productName} · {ago(a.recoveredAt || a.updatedAt)}
                  {a.utm?.utm_source ? ` · veio de ${a.utm.utm_source}` : ''}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {a.recoveredAt && <Badge className="bg-emerald-50 text-emerald-700">Comprou</Badge>}
                  {a.recoveredVia === 'archer-email' && <Badge className="bg-violet-50 text-violet-700">Recuperado pelo e-mail do Archer</Badge>}
                  {a.recoveredVia === 'archer-chat' && <Badge className="bg-violet-50 text-violet-700">Conversou com o Archer</Badge>}
                  {!a.recoveredAt && !!a.recoveryEmails?.length && (
                    <Badge className="bg-violet-50 text-violet-700" title={a.recoveryEmails.map((m) => `${m.step}º: ${m.subject || '(enviando)'}${m.ok === false ? ' (falhou)' : ''}`).join(' · ')}>
                      Archer: {a.recoveryEmails.length} de 3 e-mails
                    </Badge>
                  )}
                  {!a.recoveredAt && a.recoveryStopped && <Badge className="bg-slate-100 text-slate-600">Pediu para não receber e-mails</Badge>}
                  {!a.recoveredAt && a.orderStatus === 'pending' && <Badge className="bg-amber-50 text-amber-700">Gerou Pix e não pagou</Badge>}
                  {!a.recoveredAt && a.orderStatus === 'refused' && <Badge className="bg-red-50 text-red-700">Pagamento recusado</Badge>}
                  {a.contactedAt && !a.recoveredAt && <Badge className="bg-slate-100 text-slate-600">Chamado por {a.contactedBy}</Badge>}
                </div>
                {/* Lixeira em todos (inclusive recuperados: compra de teste apagada deixava o carrinho sem como sair). */}
                <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  {!a.recoveredAt && (
                  <>
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => !a.contactedAt && run(a, 'contacted')}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        <MessageCircle size={14} aria-hidden="true" /> WhatsApp
                      </a>
                    )}
                    <a href={`mailto:${a.email}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      <Mail size={14} aria-hidden="true" /> E-mail
                    </a>
                    <button
                      type="button"
                      disabled={busy === a.id}
                      onClick={() => run(a, a.contactedAt ? 'uncontacted' : 'contacted')}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {a.contactedAt ? <><Undo2 size={14} aria-hidden="true" /> Desmarcar</> : <><Check size={14} aria-hidden="true" /> Já chamei</>}
                    </button>
                  </>
                  )}
                    <button
                      type="button"
                      disabled={busy === a.id}
                      onClick={() => run(a, 'delete')}
                      aria-label={`Apagar o carrinho de ${a.name || a.email}`}
                      className="ml-auto inline-flex h-8 items-center rounded-lg px-2 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                    </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
