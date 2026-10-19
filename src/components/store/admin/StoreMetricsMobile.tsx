import { useMemo, useState, type ReactNode } from 'react'
import { Clock, CreditCard, QrCode, RotateCcw, ShoppingCart, Sparkles, TrendingDown, TrendingUp, Trophy } from 'lucide-react'
import { formatCents, type StoreAbandoned, type StoreOrder, type StoreProduct } from '../../../types/store'
import { inRange, resolveRange, type DatePreset, type DateRange } from './DateRangeFilter'
import { dailyRevenue } from './StoreOverview'

const PERIODS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'this_month', label: 'Este mês' },
  { key: 'last_month', label: 'Mês passado' },
  { key: 'all', label: 'Tudo' },
]

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

/** Números do período (mesma conta da Visão geral do computador). */
function compute(orders: StoreOrder[], abandoned: StoreAbandoned[], range: DateRange | null) {
  const real = orders.filter((o) => !o.test && inRange(o.createdAt, range))
  const approved = real.filter((o) => o.status === 'approved')
  const revenue = approved.reduce((s, o) => s + o.amount, 0)
  const pixAll = real.filter((o) => o.method === 'pix' || o.method === 'pix_manual')
  const pixPaid = pixAll.filter((o) => o.status === 'approved' || o.status === 'refunded')
  const refunded = real.filter((o) => o.status === 'refunded')
  // Carrinho conta como abandonado depois de 15 min sem pagar.
  const carts = abandoned.filter((a) => inRange(a.createdAt, range) && (a.recoveredAt || Date.now() - new Date(a.updatedAt).getTime() > 15 * 60_000))
  const recovered = carts.filter((a) => a.recoveredAt)
  const convBase = carts.length - recovered.length + approved.length
  const bump = approved.reduce((s, o) => s + o.items.filter((i) => i.bump).reduce((a, i) => a + i.price, 0), 0)
  const card = approved.filter((o) => o.method === 'card').reduce((s, o) => s + o.amount, 0)
  const pix = approved.filter((o) => o.method === 'pix' || o.method === 'pix_manual').reduce((s, o) => s + o.amount, 0)
  return {
    approved,
    revenue,
    ticket: approved.length ? Math.round(revenue / approved.length) : 0,
    pending: real.filter((o) => o.status === 'pending').length,
    pixAll: pixAll.length,
    pixPaid: pixPaid.length,
    refunded: refunded.length,
    refundedTotal: refunded.reduce((s, o) => s + o.amount, 0),
    carts: carts.length,
    recovered: recovered.length,
    conversion: convBase ? pct(approved.length, convBase) : null,
    bump,
    card,
    pix,
  }
}

/** Aba Métricas do Quiver (celular): feita pra tela pequena, uma coluna. */
export function StoreMetricsMobile({ orders, products, abandoned = [] }: { orders: StoreOrder[]; products: StoreProduct[]; abandoned?: StoreAbandoned[] }) {
  const [preset, setPreset] = useState<DatePreset>('30d')
  const range = useMemo(() => resolveRange({ preset, from: '', to: '' }), [preset])
  // Período anterior do mesmo tamanho, pra comparar.
  const prevRange = useMemo<DateRange | null>(() => (range ? { start: new Date(range.start.getTime() - (range.end.getTime() - range.start.getTime())), end: range.start } : null), [range])

  const m = useMemo(() => compute(orders, abandoned, range), [orders, abandoned, range])
  const prev = useMemo(() => (prevRange ? compute(orders, abandoned, prevRange) : null), [orders, abandoned, prevRange])
  const daily = useMemo(() => dailyRevenue(orders, range), [orders, range])
  const diff = prev && prev.revenue > 0 ? Math.round(((m.revenue - prev.revenue) / prev.revenue) * 100) : null

  const byProduct = products
    .map((p) => {
      const list = m.approved.filter((o) => o.productId === p.id)
      return { product: p, count: list.length, revenue: list.reduce((s, o) => s + o.amount, 0) }
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.revenue - a.revenue)
  const top = byProduct[0]?.revenue || 1
  const methodTotal = m.card + m.pix

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Período" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
        {PERIODS.map((p) => {
          const active = preset === p.key
          return (
            <button
              key={p.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPreset(p.key)}
              className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold transition-colors ${active ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Faturamento em destaque */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-md">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
        <p className="relative text-sm font-medium text-white/75">Faturamento aprovado</p>
        <p className="relative mt-1 text-[34px] font-extrabold leading-none tracking-tight tabular-nums">{formatCents(m.revenue)}</p>
        {diff !== null && (
          <p className={`relative mt-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${diff >= 0 ? 'bg-emerald-400/25 text-emerald-50' : 'bg-rose-400/25 text-rose-50'}`}>
            {diff >= 0 ? <TrendingUp size={14} aria-hidden="true" /> : <TrendingDown size={14} aria-hidden="true" />}
            {diff >= 0 ? '+' : ''}
            {diff}% que o período anterior
          </p>
        )}
        <dl className="relative mt-5 grid grid-cols-2 gap-3 border-t border-white/15 pt-4">
          <div>
            <dt className="text-xs text-white/65">Vendas</dt>
            <dd className="text-xl font-bold tabular-nums">{m.approved.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/65">Ticket médio</dt>
            <dd className="text-xl font-bold tabular-nums">{formatCents(m.ticket)}</dd>
          </div>
        </dl>
        {m.bump > 0 && <p className="relative mt-3 text-xs text-white/70">{formatCents(m.bump)} vieram de order bumps</p>}
      </section>

      <DailyChartMobile data={daily} />

      {/* Taxas */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
        <h3 className="mb-3.5 text-[15px] font-bold text-slate-800">Conversão</h3>
        <div className="space-y-4">
          <RateBar label="Checkout" hint="Vendas de quem preencheu os dados" value={m.conversion} color="bg-brand-600" />
          <RateBar label="Pix pagos" hint={m.pixAll ? `${m.pixPaid} de ${m.pixAll} Pix gerados` : 'Nenhum Pix gerado'} value={m.pixAll ? pct(m.pixPaid, m.pixAll) : null} color="bg-teal-500" />
          <RateBar label="Carrinhos recuperados" hint={m.carts ? `${m.recovered} de ${m.carts} abandonados` : 'Nenhum carrinho abandonado'} value={m.carts ? pct(m.recovered, m.carts) : null} color="bg-amber-500" />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <MiniStat icon={<Clock size={17} />} tone="bg-amber-50 text-amber-600" label="Aguardando pagamento" value={String(m.pending)} />
        <MiniStat icon={<ShoppingCart size={17} />} tone="bg-orange-50 text-orange-600" label="Carrinhos abandonados" value={String(m.carts)} />
        <MiniStat icon={<RotateCcw size={17} />} tone="bg-rose-50 text-rose-600" label="Reembolsos" value={String(m.refunded)} sub={m.refunded ? formatCents(m.refundedTotal) : undefined} />
        <MiniStat icon={<Sparkles size={17} />} tone="bg-violet-50 text-violet-600" label="Order bumps" value={formatCents(m.bump)} />
      </div>

      {/* Forma de pagamento */}
      {methodTotal > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
          <h3 className="mb-3 text-[15px] font-bold text-slate-800">Como pagaram</h3>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <div className="h-full bg-brand-600" style={{ width: `${pct(m.card, methodTotal)}%` }} />
            <div className="h-full bg-teal-500" style={{ width: `${pct(m.pix, methodTotal)}%` }} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <MethodLine icon={<CreditCard size={15} />} dot="bg-brand-600" label="Cartão" value={m.card} share={pct(m.card, methodTotal)} />
            <MethodLine icon={<QrCode size={15} />} dot="bg-teal-500" label="Pix" value={m.pix} share={pct(m.pix, methodTotal)} />
          </dl>
        </section>
      )}

      {/* Produtos */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
        <h3 className="mb-3.5 flex items-center gap-2 text-[15px] font-bold text-slate-800">
          <Trophy size={16} className="text-amber-500" aria-hidden="true" /> Produtos que mais vendem
        </h3>
        {byProduct.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">Nenhuma venda aprovada no período.</p>
        ) : (
          <ol className="space-y-4">
            {byProduct.map((r, i) => (
              <li key={r.product.id} className="flex items-center gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`} aria-hidden="true">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-800">{r.product.name}</p>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-slate-900">{formatCents(r.revenue)}</p>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                      <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700" style={{ width: `${Math.max(4, Math.round((r.revenue / top) * 100))}%` }} />
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">
                      {r.count} {r.count === 1 ? 'venda' : 'vendas'}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function RateBar({ label, hint, value, color }: { label: string; hint: string; value: number | null; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-lg font-bold tabular-nums text-slate-900">{value === null ? '–' : `${value}%`}</p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${value ?? 0}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </div>
  )
}

function MiniStat({ icon, tone, label, value, sub }: { icon: ReactNode; tone: string; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200/70">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone}`} aria-hidden="true">
        {icon}
      </span>
      <p className="mt-2.5 text-[11.5px] font-medium leading-tight text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  )
}

function MethodLine({ icon, dot, label, value, share }: { icon: ReactNode; dot: string; label: string; value: number; share: number }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
        <span className="text-slate-400" aria-hidden="true">
          {icon}
        </span>
        {label} · {share}%
      </dt>
      <dd className="mt-0.5 text-base font-bold tabular-nums text-slate-900">{formatCents(value)}</dd>
    </div>
  )
}

/** Gráfico de faturamento por dia pra tela pequena: toque numa barra pra ver o dia. */
function DailyChartMobile({ data }: { data: ReturnType<typeof dailyRevenue> }) {
  const [sel, setSel] = useState<number | null>(null)
  if (data.length < 2) return null
  const max = Math.max(1, ...data.map((d) => d.total))
  const best = data.reduce((b, d, i) => (d.total > data[b].total ? i : b), 0)
  const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const shown = sel !== null ? data[sel] : null

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-[15px] font-bold text-slate-800">Faturamento por dia</h3>
        <p className="text-right text-xs text-slate-500" aria-live="polite">
          {shown ? (
            <>
              <span className="font-semibold text-slate-800">{fmt(shown.date)}</span>
              <br />
              {formatCents(shown.total)} · {shown.count} {shown.count === 1 ? 'venda' : 'vendas'}
            </>
          ) : data[best].total > 0 ? (
            <>
              Melhor dia: <span className="font-semibold text-slate-800">{fmt(data[best].date)}</span>
              <br />
              {formatCents(data[best].total)}
            </>
          ) : (
            'Sem vendas no período'
          )}
        </p>
      </div>
      <div className="flex h-40 items-end gap-[3px]" role="list" aria-label="Faturamento aprovado por dia">
        {data.map((d, i) => (
          <button
            key={i}
            type="button"
            role="listitem"
            aria-label={`${fmt(d.date)}: ${formatCents(d.total)}, ${d.count} vendas`}
            onClick={() => setSel(sel === i ? null : i)}
            className="flex h-full min-w-0 flex-1 items-end"
          >
            <span
              className={`block w-full rounded-t-md transition-colors ${sel === i ? 'bg-brand-800' : sel !== null ? 'bg-brand-200' : 'bg-gradient-to-t from-brand-600 to-brand-400'}`}
              style={{ height: d.total ? `${Math.max(4, (d.total / max) * 100)}%` : '3px', opacity: d.total ? 1 : 0.35 }}
            />
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between border-t border-slate-100 pt-1.5 text-[11px] text-slate-400">
        <span>{fmt(data[0].date)}</span>
        <span>Toque numa barra</span>
        <span>{fmt(data[data.length - 1].date)}</span>
      </div>
    </section>
  )
}
