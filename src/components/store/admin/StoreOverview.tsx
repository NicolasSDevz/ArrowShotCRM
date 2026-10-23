import { useMemo, useState, type ReactNode } from 'react'
import { BarChart3, Clock, QrCode, Receipt, RotateCcw, ShoppingBag, ShoppingCart, Sparkles, TrendingUp, Wallet } from 'lucide-react'
import { Badge } from '../../ui/Badge'
import { MetricCard } from '../../ui/MetricCard'
import { formatCents, STORE_METHOD_LABEL, type StoreAbandoned, type StoreOrder, type StoreProduct } from '../../../types/store'
import { OrderStatusBadge } from './StoreOrdersTable'
import { DateRangeFilter, inRange, resolveRange, type DateRange, type DateRangeValue } from './DateRangeFilter'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

/** Resumo de vendas: faturamento, pedidos, ticket médio, conversão de Pix e por produto. */
export function StoreOverview({ orders, products, abandoned = [], compact = false, title = 'Resumo de vendas' }: { orders: StoreOrder[]; products: StoreProduct[]; abandoned?: StoreAbandoned[]; compact?: boolean; title?: ReactNode }) {
  const [period, setPeriod] = useState<DateRangeValue>({ preset: '30d', from: '', to: '' })
  const range = useMemo(() => resolveRange(period), [period])

  const inPeriod = useMemo(() => orders.filter((o) => inRange(o.createdAt, range)), [orders, range])

  const real = inPeriod.filter((o) => !o.test)
  const approved = real.filter((o) => o.status === 'approved')
  const revenue = approved.reduce((s, o) => s + o.amount, 0)
  const pending = real.filter((o) => o.status === 'pending')
  const pixAll = real.filter((o) => o.method === 'pix' || o.method === 'pix_manual')
  const pixPaid = pixAll.filter((o) => o.status === 'approved' || o.status === 'refunded')
  const bumpRevenue = approved.reduce((s, o) => s + o.items.filter((i) => i.bump).reduce((a, i) => a + i.price, 0), 0)
  const refunded = real.filter((o) => o.status === 'refunded')
  // Carrinho conta como abandonado depois de 15 min sem pagar.
  const carts = abandoned.filter((a) => inRange(a.createdAt, range) && (a.recoveredAt || Date.now() - new Date(a.updatedAt).getTime() > 15 * 60_000))
  const recovered = carts.filter((a) => a.recoveredAt)
  const convBase = carts.length - recovered.length + approved.length
  const daily = useMemo(() => dailyRevenue(orders, range), [orders, range])

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
        <h2 className="text-[15px] font-semibold text-slate-800">{title}</h2>
        <DateRangeFilter value={period} onChange={setPeriod} />
      </div>

      <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'}`}>
        <MetricCard icon={Wallet} accent="green" label="Faturamento aprovado" value={formatCents(revenue)} subtitle={bumpRevenue > 0 ? `${formatCents(bumpRevenue)} vieram de order bumps` : undefined} />
        <MetricCard icon={ShoppingBag} accent="blue" label="Vendas aprovadas" value={String(approved.length)} />
        <MetricCard icon={TrendingUp} accent="violet" label="Ticket médio" value={formatCents(approved.length ? Math.round(revenue / approved.length) : 0)} />
        <MetricCard icon={Clock} accent="amber" label="Aguardando pagamento" value={String(pending.length)} />
        <MetricCard icon={QrCode} accent="sky" label="Pix pagos" value={pixAll.length ? `${Math.round((pixPaid.length / pixAll.length) * 100)}%` : '0%'} subtitle={pixAll.length ? `${pixPaid.length} de ${pixAll.length} Pix gerados` : undefined} />
        <MetricCard icon={ShoppingCart} accent="amber" label="Carrinhos abandonados" value={String(carts.length)} subtitle={carts.length ? `${recovered.length} recuperados (${Math.round((recovered.length / carts.length) * 100)}%)` : undefined} />
        <MetricCard icon={RotateCcw} accent="pink" label="Reembolsos" value={String(refunded.length)} subtitle={refunded.length ? formatCents(refunded.reduce((s, o) => s + o.amount, 0)) : undefined} />
        <MetricCard icon={BarChart3} accent="blue" label="Conversão do checkout" value={convBase ? `${Math.round((approved.length / convBase) * 100)}%` : '–'} subtitle="Vendas ÷ quem preencheu os dados" />
      </div>

      <DailyChart data={daily} />

      <div className={`grid gap-5 ${compact ? '' : 'lg:grid-cols-2'}`}>
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

/** Faturamento aprovado por dia (até 30 barras; "Tudo" mostra os últimos 30 dias). */
/** Um ponto por dia do período (no máximo os últimos 31 dias dele; "todo o período" mostra os últimos 30). */
export function dailyRevenue(orders: StoreOrder[], range: DateRange | null) {
  const today = new Date()
  const end = range?.end ?? new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const total = range ? Math.round((range.end.getTime() - range.start.getTime()) / 86_400_000) : 30
  const n = Math.max(1, Math.min(total, 31))
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - n)
  const buckets = Array.from({ length: n }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return { date: d, total: 0, count: 0 }
  })
  for (const o of orders) {
    if (o.test || o.status !== 'approved') continue
    const t = new Date(o.approvedAt || o.createdAt)
    const i = Math.floor((t.getTime() - start.getTime()) / 86_400_000)
    if (i >= 0 && i < n) {
      buckets[i].total += o.amount
      buckets[i].count += 1
    }
  }
  return buckets
}

/** Uma série só (faturamento), barras finas na cor da marca; o valor aparece ao passar o mouse ou tocar. */
function DailyChart({ data }: { data: ReturnType<typeof dailyRevenue> }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.total))
  const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const shown = hover !== null ? data[hover] : null
  if (data.length < 2) return null
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-slate-800">Faturamento por dia</h3>
        <p className="text-xs text-slate-500" aria-live="polite">
          {shown ? (
            <>
              {fmt(shown.date)}: <b className="font-semibold text-slate-800">{formatCents(shown.total)}</b> · {shown.count} {shown.count === 1 ? 'venda' : 'vendas'}
            </>
          ) : (
            'Passe o mouse (ou toque) numa barra'
          )}
        </p>
      </div>
      <div className="flex h-36 items-end gap-[2px] border-b border-slate-200" role="list" aria-label="Faturamento aprovado por dia">
        {data.map((d, i) => (
          <button
            key={i}
            type="button"
            role="listitem"
            aria-label={`${fmt(d.date)}: ${formatCents(d.total)}, ${d.count} vendas`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            onClick={() => setHover(i)}
            className="group flex h-full flex-1 items-end focus:outline-none"
          >
            <span
              className={`block w-full rounded-t-[4px] transition-colors ${hover === i ? 'bg-brand-700' : 'bg-brand-500'}`}
              style={{ height: d.total ? `${Math.max(3, (d.total / max) * 100)}%` : '2px', opacity: d.total ? 1 : 0.25 }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-slate-400">
        <span>{fmt(data[0].date)}</span>
        <span>{fmt(data[data.length - 1].date)}</span>
      </div>
    </section>
  )
}
