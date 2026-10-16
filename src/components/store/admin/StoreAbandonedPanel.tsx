import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Check, Mail, MessageCircle, ShoppingCart, Sparkles, Trash2, Undo2 } from 'lucide-react'
import { EmptyState } from '../../ui/EmptyState'
import { Badge } from '../../ui/Badge'
import { storeAbandonedAction } from '../../../services/storeApi'
import { formatCents, type StoreAbandoned } from '../../../types/store'

/** Carrinho vira "abandonado" 15 min depois da última mexida sem pagar. */
const ABANDON_MS = 15 * 60_000

/** Mesmo calendário dos e-mails do Archer no servidor (api/_lib/store/archerCheckout.js). */
const EMAIL_STEPS = [
  { after: 30 * 60_000, from: 'activity' as const },
  { after: 24 * 3600_000, from: 'first' as const },
  { after: 72 * 3600_000, from: 'first' as const },
]
const START_WITHIN_MS = 48 * 3600_000

type Filter = 'open' | 'contacted' | 'recovered' | 'live'

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 60) return `há ${Math.max(1, min)} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}

function inTime(ms: number) {
  if (ms <= 10 * 60_000) return 'nos próximos minutos'
  const min = Math.round(ms / 60_000)
  if (min < 60) return `em ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `em ${h} h`
  const d = Math.round(h / 24)
  return `em ${d} ${d === 1 ? 'dia' : 'dias'}`
}

/** Como estão os e-mails automáticos do Archer para este carrinho. */
function emailStatus(a: StoreAbandoned): { text: string; tone: 'violet' | 'slate' } | null {
  if (a.recoveredAt) return null
  const done = a.recoveryEmails ?? []
  if (a.recoveryStopped) return { text: 'Pediu para não receber e-mails', tone: 'slate' }
  if (a.contactedAt) return { text: done.length ? `${done.length} de 3 e-mails, parou porque você chamou` : 'E-mails parados porque você chamou', tone: 'slate' }
  if (done.length >= EMAIL_STEPS.length) return { text: '3 de 3 e-mails enviados', tone: 'violet' }
  const activity = new Date(a.updatedAt).getTime()
  if (!done.length && Date.now() - activity > START_WITHIN_MS) return { text: 'Abandonou há mais de 2 dias, sem e-mail', tone: 'slate' }
  const step = EMAIL_STEPS[done.length]
  const base = step.from === 'first' ? new Date(done[0]?.sentAt || a.updatedAt).getTime() : activity
  const next = inTime(base + step.after - Date.now())
  const failed = done.some((m) => m.ok === false)
  return { text: `${done.length ? `${done.length} de 3 e-mails` : 'Nenhum e-mail ainda'}${failed ? ' (1 falhou)' : ''}, próximo ${next}`, tone: 'violet' }
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

const STAT_TONE = { slate: 'bg-slate-300', green: 'bg-emerald-500', amber: 'bg-amber-400', violet: 'bg-violet-500' }

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone: keyof typeof STAT_TONE }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-3">
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${STAT_TONE[tone]}`} />
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
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
  const stuck = [...groups.open, ...groups.contacted]
  const lost = stuck.reduce((s, a) => s + a.amount, 0)
  const recoveredValue = groups.recovered.reduce((s, a) => s + a.amount, 0)
  const totalCarts = stuck.length + groups.recovered.length
  const emailsSent = carts.reduce((s, a) => s + (a.recoveryEmails?.filter((m) => m.ok !== false).length ?? 0), 0)
  const byArcher = groups.recovered.filter((a) => a.recoveredVia === 'archer-email' || a.recoveredVia === 'archer-chat').length

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat tone="amber" label="Para chamar" value={String(groups.open.length)} hint={lost > 0 ? `${formatCents(lost)} parados em carrinhos` : undefined} />
          <Stat
            tone="green"
            label="Recuperados"
            value={String(groups.recovered.length)}
            hint={totalCarts ? `${formatCents(recoveredValue)} (${Math.round((groups.recovered.length / totalCarts) * 100)}% dos carrinhos)` : undefined}
          />
          <Stat tone="violet" label="E-mails do Archer enviados" value={String(emailsSent)} />
          <Stat tone="violet" label="Recuperados pelo Archer" value={String(byArcher)} hint="Por e-mail ou pelo chat do checkout" />
        </div>
      )}

      <p className="flex items-start gap-2 rounded-xl border border-violet-100 bg-violet-50 px-3.5 py-2.5 text-xs leading-relaxed text-violet-800">
        <Sparkles size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          O Archer manda sozinho até 3 e-mails para quem abandonou: 30 minutos depois, 1 dia depois e 3 dias depois. Não precisa abrir o CRM. Os e-mails param quando a pessoa compra, pede
          para não receber, ou quando você marca que já chamou.
        </span>
      </p>

      <div role="radiogroup" aria-label="Filtrar carrinhos" className="flex w-fit flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
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

      {list.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart size={32} />}
          title={filter === 'open' ? 'Ninguém pra chamar agora' : 'Nada por aqui'}
          description="Quem preenche nome e e-mail no checkout e não paga em 15 minutos aparece aqui, com o celular pra chamar no WhatsApp. Quem compra depois sai sozinho da lista."
        />
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {list.map((a) => {
            const wa = whatsappLink(a)
            const mail = emailStatus(a)
            return (
              <li key={a.id} className={`grid grid-cols-1 items-center gap-x-4 gap-y-2 px-4 py-3 ${compact ? '' : 'md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_6.5rem_auto]'}`}>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">{a.name || a.email}</p>
                  <p className="truncate text-xs text-slate-500">
                    {a.email}
                    {a.phone ? ` · ${a.phone}` : ''}
                  </p>
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm text-slate-700">
                    {a.productName} <span className="text-xs text-slate-400">· {ago(a.recoveredAt || a.updatedAt)}{a.utm?.utm_source ? ` · veio de ${a.utm.utm_source}` : ''}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    {a.recoveredAt && <Badge className="bg-emerald-50 text-emerald-700">Comprou</Badge>}
                    {a.recoveredVia === 'archer-email' && <Badge className="bg-violet-50 text-violet-700">Pelo e-mail do Archer</Badge>}
                    {a.recoveredVia === 'archer-chat' && <Badge className="bg-violet-50 text-violet-700">Conversou com o Archer</Badge>}
                    {!a.recoveredAt && a.orderStatus === 'pending' && <Badge className="bg-amber-50 text-amber-700">Gerou Pix e não pagou</Badge>}
                    {!a.recoveredAt && a.orderStatus === 'refused' && <Badge className="bg-red-50 text-red-700">Pagamento recusado</Badge>}
                    {a.contactedAt && !a.recoveredAt && <Badge className="bg-slate-100 text-slate-600">Chamado por {a.contactedBy}</Badge>}
                    {mail && (
                      <span
                        className={`inline-flex items-center gap-1 text-xs ${mail.tone === 'violet' ? 'text-violet-700' : 'text-slate-500'}`}
                        title={a.recoveryEmails?.map((m) => `${m.step}º: ${m.subject || '(enviando)'}${m.ok === false ? ' (falhou)' : ''}`).join(' · ')}
                      >
                        <Mail size={12} aria-hidden="true" /> {mail.text}
                      </span>
                    )}
                  </div>
                </div>
                <p className={`font-semibold tabular-nums text-slate-800 ${compact ? '' : 'md:text-right'}`}>{formatCents(a.amount)}</p>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {!a.recoveredAt && (
                    <>
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => !a.contactedAt && run(a, 'contacted')}
                          aria-label={`Chamar ${a.name || a.email} no WhatsApp`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          <MessageCircle size={14} aria-hidden="true" /> WhatsApp
                        </a>
                      )}
                      <button
                        type="button"
                        disabled={busy === a.id}
                        onClick={() => run(a, a.contactedAt ? 'uncontacted' : 'contacted')}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {a.contactedAt ? (
                          <>
                            <Undo2 size={14} aria-hidden="true" /> Desmarcar
                          </>
                        ) : (
                          <>
                            <Check size={14} aria-hidden="true" /> Já chamei
                          </>
                        )}
                      </button>
                    </>
                  )}
                  {/* Lixeira em todos (inclusive recuperados: compra de teste apagada deixava o carrinho sem como sair). */}
                  <button
                    type="button"
                    disabled={busy === a.id}
                    onClick={() => run(a, 'delete')}
                    aria-label={`Apagar o carrinho de ${a.name || a.email}`}
                    className="inline-flex h-8 items-center rounded-lg px-2 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-50"
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
