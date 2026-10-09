import { useMemo, useState, type ReactNode } from 'react'
import { Clock, QrCode, Receipt, ShoppingBag, Sparkles, TrendingUp, Wallet } from 'lucide-react'
import { Badge } from '../../ui/Badge'
import { formatCents, STORE_METHOD_LABEL, type StoreOrder, type StoreProduct } from '../../../types/store'
import { OrderStatusBadge } from './StoreOrdersTable'

const PERIODS = [
  { days: 1, label: 'Hoje' },
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 0, label: 'Tudo' },
]

const TONES = {
  blue: 'bg-brand-50 text-brand-600',
  green: 'bg-emerald-50 text-emerald-600',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-600',
  teal: 'bg-teal-50 text-teal-600',
}

function Kpi({ icon, tone, label, value, hint }: { icon: ReactNode; tone: keyof typeof TONES; label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`} aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 text-[22px] font-extrabold leading-tight text-slate-900 tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  )
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

/** Resumo de vendas: faturamento, pedidos, ticket médio, conversão de Pix e por produto. */
export function StoreOverview({ orders, products }: { orders: StoreOrder[]; products: StoreProduct[] }) {
  const [days, setDays] = useState(30)

  const inPeriod = useMemo(() => {
    if (!days) return orders
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - (days - 1))
    return orders.filter((o) => new Date(o.createdAt) >= start)
  }, [orders, days])

  const real = inPeriod.filter((o) => !o.test)
  const approved = real.filter((o) => o.status === 'approved')
  const revenue = approved.reduce((s, o) => s + o.amount, 0)
  const pending = real.filter((o) => o.status === 'pending')
  const pixAll = real.filter((o) => o.method === 'pix' || o.method === 'pix_manual')
  const pixPaid = pixAll.filter((o) => o.status === 'approved' || o.status === 'refunded')
  const bumpRevenue = approved.reduce((s, o) => s + o.items.filter((i) => i.bump).reduce((a, i) => a + i.price, 0), 0)

  const byProduct = products
    .map((p) => {
      const list = approved.filter((o) => o.productId === p.id)
      return { product: p, count: list.length, revenue: list.reduce((s, o) => s + o.amount, 0) }
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.revenue - a.revenue)
  const top = byProduct[0]?.revenue || 1

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-slate-800">Resumo de vendas</h2>
        <div role="radiogroup" aria-label="Período" className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              role="radio"
              aria-checked={days === p.days}
              onClick={() => setDays(p.days)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${days === p.days ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi icon={<Wallet size={19} />} tone="green" label="Faturamento aprovado" value={formatCents(revenue)} hint={bumpRevenue > 0 ? `${formatCents(bumpRevenue)} vieram de order bumps` : undefined} />
        <Kpi icon={<ShoppingBag size={19} />} tone="blue" label="Vendas aprovadas" value={approved.length} />
        <Kpi icon={<TrendingUp size={19} />} tone="violet" label="Ticket médio" value={formatCents(approved.length ? Math.round(revenue / approved.length) : 0)} />
        <Kpi icon={<Clock size={19} />} tone="amber" label="Aguardando pagamento" value={pending.length} />
        <Kpi icon={<QrCode size={19} />} tone="teal" label="Pix pagos" value={pixAll.length ? `${Math.round((pixPaid.length / pixAll.length) * 100)}%` : '0%'} hint={pixAll.length ? `${pixPaid.length} de ${pixAll.length} Pix gerados` : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-slate-800">
            <Sparkles size={16} className="text-brand-600" aria-hidden="true" /> Vendas por produto
          </h3>
          {byProduct.length === 0 ? (
            <Empty icon={<ShoppingBag size={22} />} text="Nenhuma venda aprovada no período." />
          ) : (
            <ul className="space-y-3.5">
              {byProduct.map((r) => (
                <li key={r.product.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium text-slate-700">{r.product.name}</span>
                    <span className="shrink-0 text-slate-500">
                      <b className="font-semibold text-slate-800">{formatCents(r.revenue)}</b> · {r.count} {r.count === 1 ? 'venda' : 'vendas'}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700" style={{ width: `${Math.max(4, Math.round((r.revenue / top) * 100))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-slate-800">
            <Receipt size={16} className="text-brand-600" aria-hidden="true" /> Últimos pedidos
          </h3>
          {inPeriod.length === 0 ? (
            <Empty icon={<Receipt size={22} />} text="Nenhum pedido no período." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {inPeriod.slice(0, 8).map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700" aria-hidden="true">
                    {initials(o.buyer.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-700">{o.buyer.name}</p>
                    <p className="truncate text-xs text-slate-400">{o.productName} · {STORE_METHOD_LABEL[o.method]}</p>
                  </div>
                  {o.test && <Badge className="bg-amber-50 text-amber-700">teste</Badge>}
                  <span className="font-semibold text-slate-700 tabular-nums">{formatCents(o.amount)}</span>
                  <OrderStatusBadge status={o.status} manual={o.method === 'pix_manual'} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function Empty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400" aria-hidden="true">{icon}</span>
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  )
}
