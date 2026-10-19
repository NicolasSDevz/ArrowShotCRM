import { useMemo, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { Check, ChevronDown, Mail, MessageCircle, ShoppingCart, Sparkles, Trash2, Undo2 } from 'lucide-react'
import { storeAbandonedAction } from '../../../services/storeApi'
import { formatCents, type StoreAbandoned } from '../../../types/store'
import { ABANDON_MS, ago, emailStatus, whatsappLink } from './StoreAbandonedPanel'

type Filter = 'open' | 'contacted' | 'recovered' | 'live'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open', label: 'Para chamar' },
  { key: 'contacted', label: 'Já chamei' },
  { key: 'recovered', label: 'Recuperados' },
  { key: 'live', label: 'No checkout agora' },
]

const EMPTY: Record<Filter, string> = {
  open: 'Ninguém pra chamar agora. Quem preenche os dados e não paga em 15 minutos aparece aqui.',
  contacted: 'Você ainda não marcou ninguém como chamado.',
  recovered: 'Nenhum carrinho recuperado ainda.',
  live: 'Ninguém no checkout neste momento.',
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Aba Carrinhos do Quiver (celular): quem preencheu os dados e não pagou. */
export function StoreAbandonedMobile({ carts }: { carts: StoreAbandoned[] }) {
  const [filter, setFilter] = useState<Filter>('open')
  const [busy, setBusy] = useState<string | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)

  const groups = useMemo(() => {
    const now = Date.now()
    const byRecent = (a: StoreAbandoned, b: StoreAbandoned) => new Date(b.recoveredAt || b.updatedAt).getTime() - new Date(a.recoveredAt || a.updatedAt).getTime()
    const live = carts.filter((a) => !a.recoveredAt && now - new Date(a.updatedAt).getTime() <= ABANDON_MS)
    const abandoned = carts.filter((a) => !a.recoveredAt && now - new Date(a.updatedAt).getTime() > ABANDON_MS)
    return {
      open: abandoned.filter((a) => !a.contactedAt).sort(byRecent),
      contacted: abandoned.filter((a) => a.contactedAt).sort(byRecent),
      recovered: carts.filter((a) => a.recoveredAt).sort(byRecent),
      live: live.sort(byRecent),
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

  const stuck = [...groups.open, ...groups.contacted]
  const lost = stuck.reduce((s, a) => s + a.amount, 0)
  const recoveredValue = groups.recovered.reduce((s, a) => s + a.amount, 0)
  const totalCarts = stuck.length + groups.recovered.length
  const rate = totalCarts ? Math.round((groups.recovered.length / totalCarts) * 100) : 0
  const emailsSent = carts.reduce((s, a) => s + (a.recoveryEmails?.filter((m) => m.ok !== false).length ?? 0), 0)
  const byArcher = groups.recovered.filter((a) => a.recoveredVia === 'archer-email' || a.recoveredVia === 'archer-chat').length
  const list = groups[filter]

  return (
    <div className="space-y-4">
      {/* Resumo em destaque */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 p-5 text-white shadow-md">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/15 blur-2xl" aria-hidden="true" />
        <p className="relative text-sm font-medium text-white/80">Parado em carrinhos</p>
        <p className="relative mt-1 text-[34px] font-extrabold leading-none tracking-tight tabular-nums">{formatCents(lost)}</p>
        <p className="relative mt-2 text-sm font-semibold text-white/90">
          {groups.open.length} {groups.open.length === 1 ? 'pessoa' : 'pessoas'} para chamar
          {groups.live.length > 0 && ` · ${groups.live.length} no checkout agora`}
        </p>
        <dl className="relative mt-5 grid grid-cols-3 gap-2 border-t border-white/20 pt-4">
          <div>
            <dt className="text-[11px] text-white/70">Recuperado</dt>
            <dd className="text-base font-bold tabular-nums">{formatCents(recoveredValue)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-white/70">Taxa</dt>
            <dd className="text-base font-bold tabular-nums">{rate}%</dd>
          </div>
          <div>
            <dt className="text-[11px] text-white/70">Pelo Archer</dt>
            <dd className="text-base font-bold tabular-nums">{byArcher}</dd>
          </div>
        </dl>
      </section>

      {/* Como funcionam os e-mails do Archer (fechado, pra não ocupar a tela) */}
      <section className="rounded-2xl bg-violet-50 ring-1 ring-violet-100">
        <button type="button" onClick={() => setAboutOpen((v) => !v)} aria-expanded={aboutOpen} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-violet-800">
          <Sparkles size={16} className="shrink-0" aria-hidden="true" />
          <span className="flex-1">
            Archer já mandou {emailsSent} {emailsSent === 1 ? 'e-mail' : 'e-mails'} de recuperação
          </span>
          <ChevronDown size={16} className={`shrink-0 transition-transform ${aboutOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {aboutOpen && (
          <p className="px-4 pb-3.5 text-xs leading-relaxed text-violet-800/90">
            Ele manda sozinho até 3 e-mails pra quem abandonou: 30 minutos depois, 1 dia depois e 3 dias depois. Os e-mails param quando a pessoa compra, pede pra não receber ou quando você marca que já chamou.
          </p>
        )}
      </section>

      <div role="radiogroup" aria-label="Filtrar carrinhos" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
        {FILTERS.map((f) => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setFilter(f.key)}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors ${active ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
            >
              {f.key === 'live' && groups.live.length > 0 && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />}
              {f.label}
              <span className={`rounded-full px-1.5 text-[11px] font-bold ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{groups[f.key].length}</span>
            </button>
          )
        })}
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-6 py-10 text-center shadow-sm ring-1 ring-slate-200/70">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400" aria-hidden="true">
            <ShoppingCart size={22} />
          </span>
          <p className="text-sm text-slate-500">{EMPTY[filter]}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((a) => {
            const wa = whatsappLink(a)
            const mail = emailStatus(a)
            const sent = a.recoveryEmails?.filter((m) => m.ok !== false).length ?? 0
            const who = a.name || a.email
            return (
              <li key={a.id} className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ${a.recoveredAt ? 'ring-emerald-200' : 'ring-slate-200/70'}`}>
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${a.recoveredAt ? 'bg-emerald-100 text-emerald-700' : filter === 'live' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}
                    aria-hidden="true"
                  >
                    {initials(who)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-[15px] font-semibold text-slate-800">{who}</p>
                      <p className="shrink-0 text-[15px] font-bold tabular-nums text-slate-900">{formatCents(a.amount)}</p>
                    </div>
                    <p className="truncate text-xs text-slate-500">{a.productName}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">
                      {a.recoveredAt ? 'comprou ' : ''}
                      {ago(a.recoveredAt || a.updatedAt)}
                      {a.utm?.utm_source ? ` · veio de ${a.utm.utm_source}` : ''}
                      {a.phone ? ` · ${a.phone}` : ''}
                    </p>
                  </div>
                </div>

                {(a.recoveredAt || a.orderStatus === 'pending' || a.orderStatus === 'refused' || (a.contactedAt && !a.recoveredAt)) && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {a.recoveredAt && <Tag cls="bg-emerald-50 text-emerald-700">Comprou</Tag>}
                    {a.recoveredVia === 'archer-email' && <Tag cls="bg-violet-50 text-violet-700">Pelo e-mail do Archer</Tag>}
                    {a.recoveredVia === 'archer-chat' && <Tag cls="bg-violet-50 text-violet-700">Conversou com o Archer</Tag>}
                    {!a.recoveredAt && a.orderStatus === 'pending' && <Tag cls="bg-amber-50 text-amber-700">Gerou Pix e não pagou</Tag>}
                    {!a.recoveredAt && a.orderStatus === 'refused' && <Tag cls="bg-red-50 text-red-700">Pagamento recusado</Tag>}
                    {a.contactedAt && !a.recoveredAt && <Tag cls="bg-slate-100 text-slate-600">Chamado por {a.contactedBy}</Tag>}
                  </div>
                )}

                {mail && (
                  <div className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${mail.tone === 'violet' ? 'bg-violet-50 text-violet-800' : 'bg-slate-50 text-slate-500'}`}>
                    <Mail size={14} className="shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{mail.text}</span>
                    <span className="flex shrink-0 gap-1" aria-hidden="true">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className={`h-1.5 w-4 rounded-full ${i < sent ? 'bg-violet-500' : 'bg-violet-200/70'}`} />
                      ))}
                    </span>
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2">
                  {!a.recoveredAt && wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => !a.contactedAt && run(a, 'contacted')}
                      aria-label={`Chamar ${who} no WhatsApp`}
                      className="flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-emerald-600 text-[15px] font-semibold text-white shadow-sm active:scale-[0.98]"
                    >
                      <MessageCircle size={18} aria-hidden="true" /> WhatsApp
                    </a>
                  )}
                  {!a.recoveredAt && (
                    <button
                      type="button"
                      disabled={busy === a.id}
                      onClick={() => run(a, a.contactedAt ? 'uncontacted' : 'contacted')}
                      className={`flex h-11 items-center justify-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold ring-1 ring-slate-200 disabled:opacity-50 ${wa ? '' : 'flex-1'} ${a.contactedAt ? 'text-slate-600' : 'text-slate-700'}`}
                    >
                      {a.contactedAt ? <Undo2 size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                      {a.contactedAt ? 'Desmarcar' : 'Já chamei'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy === a.id}
                    onClick={() => run(a, 'delete')}
                    aria-label={`Apagar o carrinho de ${who}`}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 ring-1 ring-slate-200 active:text-red-600 disabled:opacity-50 ${a.recoveredAt ? 'ml-auto' : ''}`}
                  >
                    <Trash2 size={16} />
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

function Tag({ cls, children }: { cls: string; children: ReactNode }) {
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>
}
