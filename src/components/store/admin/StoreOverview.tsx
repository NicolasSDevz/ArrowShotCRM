import { useMemo, useState } from 'react'
import { StatCard } from '../../ui/StatCard'
import { Badge } from '../../ui/Badge'
import { formatCents, STORE_METHOD_LABEL, type StoreOrder, type StoreProduct } from '../../../types/store'
import { OrderStatusBadge } from './StoreOrdersTable'

const PERIODS = [
  { days: 1, label: 'Hoje' },
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 0, label: 'Tudo' },
]

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

  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label="Período" className="flex flex-wrap gap-1.5">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            role="radio"
            aria-checked={days === p.days}
            onClick={() => setDays(p.days)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${days === p.days ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Faturamento aprovado" value={formatCents(revenue)} />
        <StatCard label="Vendas aprovadas" value={approved.length} />
        <StatCard label="Ticket médio" value={formatCents(approved.length ? Math.round(revenue / approved.length) : 0)} />
        <StatCard label="Aguardando pagamento" value={pending.length} />
        <StatCard label="Pix pagos" value={pixAll.length ? `${Math.round((pixPaid.length / pixAll.length) * 100)}%` : '0%'} />
      </div>
      {bumpRevenue > 0 && <p className="text-sm text-slate-500">Order bumps renderam {formatCents(bumpRevenue)} no período.</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-[15px] font-semibold text-slate-800">Vendas por produto</h2>
          {byProduct.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma venda aprovada no período.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {byProduct.map((r) => (
                <li key={r.product.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium text-slate-700">{r.product.name}</span>
                  <span className="text-slate-500">{r.count} vendas, {formatCents(r.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-[15px] font-semibold text-slate-800">Últimos pedidos</h2>
          {inPeriod.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum pedido no período.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {inPeriod.slice(0, 8).map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-700">{o.buyer.name}</p>
                    <p className="truncate text-xs text-slate-400">{o.productName}, {STORE_METHOD_LABEL[o.method]}</p>
                  </div>
                  {o.test && <Badge className="bg-amber-50 text-amber-700">teste</Badge>}
                  <span className="text-slate-600">{formatCents(o.amount)}</span>
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
