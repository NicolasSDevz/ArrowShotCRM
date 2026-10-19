import { useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, Ban, Banknote, BarChart3, CheckCircle2, ChevronRight, Copy, Home, LogOut, Receipt, RotateCcw, Search, Settings, ShoppingCart, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useAppAutoUpdate } from '../../hooks/useAppAutoUpdate'
import { useStoreAbandoned, useStoreOrders, useStoreProducts } from '../../hooks/useStore'
import { StoreMetricsMobile } from '../../components/store/admin/StoreMetricsMobile'
import { StoreAbandonedMobile } from '../../components/store/admin/StoreAbandonedMobile'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { FullPageSpinner } from '../../components/ui/FullPageSpinner'
import { PushNotificationsCard } from '../../components/notifications/PushNotificationsCard'
import { OrderStatusBadge, useOrderActions, useReconcilePending } from '../../components/store/admin/StoreOrdersTable'
import { formatCents, STORE_METHOD_LABEL, type StoreOrder, type StoreOrderStatus } from '../../types/store'

type Tab = 'home' | 'sales' | 'metrics' | 'carts' | 'settings'

const DAY = 86_400_000
const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const paidAt = (o: StoreOrder) => new Date(o.approvedAt || o.createdAt).getTime()
const needsAction = (o: StoreOrder) =>
  (o.method === 'pix_manual' && o.status === 'pending') || (o.status === 'approved' && !!o.refundRequest && !o.refundRequest.deniedAt) || (o.status === 'approved' && o.capi?.purchase?.ok === false)

const TAB_TITLE: Record<Tab, string> = { home: 'Resumo', sales: 'Vendas', metrics: 'Métricas', carts: 'Carrinhos', settings: 'Ajustes' }

/** Cor do círculo com as iniciais do comprador, pelo status do pedido. */
const STATUS_TONE: Record<StoreOrderStatus, string> = {
  approved: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  refused: 'bg-slate-100 text-slate-500',
  refunded: 'bg-rose-100 text-rose-700',
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

function timeLabel(iso: string) {
  const t = new Date(iso).getTime()
  const today = startOfToday()
  const hm = new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (t >= today) return `hoje, ${hm}`
  if (t >= today - DAY) return `ontem, ${hm}`
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function dayLabel(t: number) {
  const today = startOfToday()
  if (t >= today) return 'Hoje'
  if (t >= today - DAY) return 'Ontem'
  const label = new Date(t).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** /app — o CRM instalado no celular (Android e iPhone) abre só aqui: resumo da
 *  Loja, vendas e o que precisa de ação. O CRM completo fica no computador. */
export function StoreAppPage() {
  const { profile } = useAuth()
  const { data: orders, loading } = useStoreOrders()
  const { data: products } = useStoreProducts()
  const { data: abandoned } = useStoreAbandoned()
  const [tab, setTab] = useState<Tab>('home')
  useReconcilePending(orders)
  useAppAutoUpdate()

  if (loading) return <FullPageSpinner />

  const tabs: { key: Tab; label: string; icon: typeof Home }[] = [
    { key: 'home', label: 'Resumo', icon: Home },
    { key: 'sales', label: 'Vendas', icon: Receipt },
    { key: 'metrics', label: 'Métricas', icon: BarChart3 },
    { key: 'carts', label: 'Carrinhos', icon: ShoppingCart },
    { key: 'settings', label: 'Ajustes', icon: Settings },
  ]
  const pending = orders.filter(needsAction).length
  const firstName = profile?.name?.trim().split(/\s+/)[0]

  const changeTab = (t: Tab) => {
    setTab(t)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="store-app flex min-h-dvh flex-col bg-page">
      <header
        className="relative overflow-hidden bg-gradient-to-br from-navy-950 via-brand-800 to-brand-600 px-5 text-white"
        style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: tab === 'home' ? 72 : 18 }}
      >
        {/* Brilho de fundo, só enfeite. */}
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <img src="/icon-192.png" alt="" className="h-9 w-9 rounded-xl shadow-sm ring-1 ring-white/20" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">Quiver · Loja</p>
            <h1 className="truncate text-xl font-bold leading-tight">{tab === 'home' && firstName ? `Olá, ${firstName}` : TAB_TITLE[tab]}</h1>
          </div>
          {pending > 0 && (
            <button
              type="button"
              onClick={() => changeTab('sales')}
              className="flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1.5 text-xs font-bold text-amber-950 shadow-sm"
              aria-label={`${pending} ${pending === 1 ? 'venda precisa' : 'vendas precisam'} da sua atenção`}
            >
              <AlertCircle size={14} aria-hidden="true" /> {pending}
            </button>
          )}
        </div>
        {tab === 'home' && <TodayHero orders={orders} />}
      </header>

      <main className={`relative flex-1 px-4 ${tab === 'home' ? '-mt-14' : 'pt-4'}`} style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}>
        {tab === 'home' && <HomeTab orders={orders} onSeeAll={() => changeTab('sales')} />}
        {tab === 'sales' && <SalesTab orders={orders} />}
        {tab === 'metrics' && <StoreMetricsMobile orders={orders} products={products} abandoned={abandoned} />}
        {tab === 'carts' && <StoreAbandonedMobile carts={abandoned} />}
        {tab === 'settings' && <SettingsTab />}
      </main>

      <nav
        aria-label="Seções do app"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200/70 bg-white/95 backdrop-blur-md"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex max-w-lg">
          {tabs.map(({ key, label, icon: Icon }) => {
            const active = tab === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => changeTab(key)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 pb-1.5 pt-2 text-[11px] font-semibold transition-colors ${active ? 'text-brand-700' : 'text-slate-400'}`}
              >
                <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-all duration-200 ${active ? 'bg-brand-50' : ''}`}>
                  <Icon size={21} strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
                </span>
                {label}
                {key === 'sales' && pending > 0 && (
                  <span className="absolute right-[calc(50%-24px)] top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                    {pending}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

function useSales(orders: StoreOrder[]) {
  const real = orders.filter((o) => !o.test && o.status === 'approved')
  const sum = (from: number, to = Infinity) => {
    const list = real.filter((o) => paidAt(o) >= from && paidAt(o) < to)
    return { total: list.reduce((s, o) => s + o.amount, 0), count: list.length }
  }
  return { real, sum }
}

/** Valor de hoje em destaque no topo do Resumo, comparado com ontem. */
function TodayHero({ orders }: { orders: StoreOrder[] }) {
  const { sum } = useSales(orders)
  const today = sum(startOfToday())
  const yesterday = sum(startOfToday() - DAY, startOfToday())
  const diff = yesterday.total > 0 ? Math.round(((today.total - yesterday.total) / yesterday.total) * 100) : null

  return (
    <div className="relative mt-6">
      <p className="text-sm font-medium text-white/70">Vendido hoje</p>
      <p className="mt-1 text-[40px] font-extrabold leading-none tracking-tight tabular-nums">{formatCents(today.total)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-white/15 px-2.5 py-1 font-semibold">
          {today.count} {today.count === 1 ? 'venda' : 'vendas'}
        </span>
        {diff !== null && (
          <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${diff >= 0 ? 'bg-emerald-400/20 text-emerald-100' : 'bg-rose-400/20 text-rose-100'}`}>
            {diff >= 0 ? <TrendingUp size={14} aria-hidden="true" /> : <TrendingDown size={14} aria-hidden="true" />}
            {diff >= 0 ? '+' : ''}
            {diff}% que ontem
          </span>
        )}
      </div>
    </div>
  )
}

function HomeTab({ orders, onSeeAll }: { orders: StoreOrder[]; onSeeAll: () => void }) {
  const { real, sum } = useSales(orders)
  const week = sum(Date.now() - 7 * DAY)
  const month = sum(Date.now() - 30 * DAY)
  const ticket = month.count > 0 ? Math.round(month.total / month.count) : 0
  const attention = orders.filter(needsAction)
  const recent = [...real].sort((a, b) => paidAt(b) - paidAt(a)).slice(0, 6)

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3" aria-label="Totais">
        <StatCard label="Últimos 7 dias" value={formatCents(week.total)} sub={`${week.count} ${week.count === 1 ? 'venda' : 'vendas'}`} />
        <StatCard label="Últimos 30 dias" value={formatCents(month.total)} sub={`${month.count} ${month.count === 1 ? 'venda' : 'vendas'}`} />
        <StatCard label="Ticket médio (30 dias)" value={formatCents(ticket)} sub="por venda" wide />
      </section>

      {attention.length > 0 && (
        <section aria-labelledby="atencao">
          <SectionTitle id="atencao" dot="bg-amber-400">
            Precisa da sua atenção
          </SectionTitle>
          <ul className="space-y-3">
            {attention.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="ultimas">
        <div className="mb-2.5 flex items-center justify-between">
          <SectionTitle id="ultimas">Últimas vendas</SectionTitle>
          {recent.length > 0 && (
            <button type="button" onClick={onSeeAll} className="-mr-1 flex items-center rounded-lg px-1 py-1 text-sm font-semibold text-brand-700">
              Ver todas <ChevronRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        {recent.length === 0 ? (
          <EmptyCard>Nenhuma venda ainda. Quando alguém comprar, aparece aqui na hora.</EmptyCard>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
            {recent.map((o) => (
              <OrderRow key={o.id} order={o} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function SectionTitle({ id, children, dot }: { id: string; children: ReactNode; dot?: string }) {
  return (
    <h2 id={id} className="mb-2.5 flex items-center gap-2 text-[15px] font-bold text-slate-800">
      {dot && <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />}
      {children}
    </h2>
  )
}

function StatCard({ label, value, sub, wide }: { label: string; value: string; sub: string; wide?: boolean }) {
  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 ${wide ? 'col-span-2 flex items-center justify-between' : ''}`}>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className={`mt-1 font-bold tabular-nums text-slate-900 ${wide ? 'text-lg' : 'text-[19px] leading-tight'}`}>{value}</p>
      </div>
      <p className={`text-xs text-slate-400 ${wide ? '' : 'mt-0.5'}`}>{sub}</p>
    </div>
  )
}

function EmptyCard({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-white p-5 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200/70">{children}</p>
}

function Initials({ order: o }: { order: StoreOrder }) {
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${STATUS_TONE[o.status] ?? 'bg-slate-100 text-slate-500'}`} aria-hidden="true">
      {initials(o.buyer.name)}
    </span>
  )
}

/** Linha enxuta (lista de últimas vendas). */
function OrderRow({ order: o }: { order: StoreOrder }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Initials order={o} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-slate-800">{o.buyer.name}</p>
        <p className="truncate text-xs text-slate-500">{o.items.map((i) => i.name).join(' + ')}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-bold tabular-nums text-slate-900">{formatCents(o.amount)}</p>
        <p className="text-[11px] text-slate-400">{timeLabel(o.approvedAt || o.createdAt)}</p>
      </div>
    </li>
  )
}

const FILTERS: { key: '' | StoreOrderStatus; label: string }[] = [
  { key: '', label: 'Todas' },
  { key: 'approved', label: 'Aprovadas' },
  { key: 'pending', label: 'Pendentes' },
  { key: 'refunded', label: 'Reembolsadas' },
]

const SALES_PERIODS: { key: string; label: string; days: number | null }[] = [
  { key: 'today', label: 'Hoje', days: 0 },
  { key: '7d', label: '7 dias', days: 6 },
  { key: '30d', label: '30 dias', days: 29 },
  { key: 'all', label: 'Tudo', days: null },
]

function SalesTab({ orders }: { orders: StoreOrder[] }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'' | StoreOrderStatus>('')
  const [period, setPeriod] = useState('30d')
  const [shown, setShown] = useState(40)
  const [openId, setOpenId] = useState<string | null>(null)
  const q = search.trim().toLowerCase()
  const days = SALES_PERIODS.find((p) => p.key === period)?.days ?? null
  const since = days === null ? 0 : startOfToday() - days * DAY

  const inPeriod = useMemo(() => orders.filter((o) => new Date(o.createdAt).getTime() >= since), [orders, since])
  const matchesSearch = (o: StoreOrder) => !q || o.buyer.name.toLowerCase().includes(q) || o.buyer.email.toLowerCase().includes(q) || (o.buyer.phone ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')
  const filtered = useMemo(
    () => inPeriod.filter((o) => (!status || o.status === status) && matchesSearch(o)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inPeriod, q, status]
  )
  const countOf = (s: '' | StoreOrderStatus) => inPeriod.filter((o) => (!s || o.status === s) && matchesSearch(o)).length

  const real = inPeriod.filter((o) => !o.test)
  const approved = real.filter((o) => o.status === 'approved')
  const total = approved.reduce((s, o) => s + o.amount, 0)
  const pendingCount = real.filter((o) => o.status === 'pending').length
  const actionCount = inPeriod.filter(needsAction).length
  const open = openId ? orders.find((o) => o.id === openId) ?? null : null

  // Agrupa por dia, com o total aprovado de cada dia no cabeçalho.
  const groups: { key: string; label: string; items: StoreOrder[]; total: number }[] = []
  for (const o of filtered.slice(0, shown)) {
    const d = new Date(o.createdAt)
    d.setHours(0, 0, 0, 0)
    const key = String(d.getTime())
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) {
      g = { key, label: dayLabel(d.getTime()), items: [], total: 0 }
      groups.push(g)
    }
    g.items.push(o)
    if (o.status === 'approved' && !o.test) g.total += o.amount
  }

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Período" className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-200/60 p-1">
        {SALES_PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={period === p.key}
            onClick={() => {
              setPeriod(p.key)
              setShown(40)
            }}
            className={`h-9 rounded-xl text-sm font-semibold transition-all ${period === p.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Resumo do período */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-700 p-5 text-white shadow-md">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/15 blur-2xl" aria-hidden="true" />
        <p className="relative text-sm font-medium text-white/80">Vendido no período</p>
        <p className="relative mt-1 text-[34px] font-extrabold leading-none tracking-tight tabular-nums">{formatCents(total)}</p>
        <dl className="relative mt-5 grid grid-cols-3 gap-2 border-t border-white/20 pt-4">
          <div>
            <dt className="text-[11px] text-white/70">Aprovadas</dt>
            <dd className="text-lg font-bold tabular-nums">{approved.length}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-white/70">Pendentes</dt>
            <dd className="text-lg font-bold tabular-nums">{pendingCount}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-white/70">Ticket médio</dt>
            <dd className="text-lg font-bold tabular-nums">{formatCents(approved.length ? Math.round(total / approved.length) : 0)}</dd>
          </div>
        </dl>
      </section>

      {actionCount > 0 && (
        <p className="flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
          <AlertCircle size={17} className="shrink-0" aria-hidden="true" />
          {actionCount} {actionCount === 1 ? 'venda precisa' : 'vendas precisam'} da sua atenção. Estão marcadas em amarelo.
        </p>
      )}

      <div className="sticky top-0 z-10 -mx-4 space-y-2.5 bg-page/95 px-4 pb-2 pt-2 backdrop-blur-md">
        <div className="relative">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar por nome, e-mail ou telefone"
            placeholder="Buscar por nome, e-mail ou telefone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-xl border-0 bg-white pl-10 pr-3 text-slate-800 shadow-sm outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div role="radiogroup" aria-label="Status" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
          {FILTERS.map((f) => {
            const active = status === f.key
            return (
              <button
                key={f.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setStatus(f.key)}
                className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors ${
                  active ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200'
                }`}
              >
                {f.label}
                <span className={`rounded-full px-1.5 text-[11px] font-bold ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{countOf(f.key)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyCard>{q ? 'Nenhuma venda com essa busca.' : 'Nenhuma venda nesse período.'}</EmptyCard>
      ) : (
        <>
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h3 className="text-[13px] font-bold text-slate-500">{g.label}</h3>
                {g.total > 0 && <span className="text-[13px] font-semibold tabular-nums text-slate-500">{formatCents(g.total)}</span>}
              </div>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
                {g.items.map((o) => (
                  <SaleRow key={o.id} order={o} onOpen={() => setOpenId(o.id)} />
                ))}
              </ul>
            </section>
          ))}
          {filtered.length > shown && (
            <Button variant="secondary" className="h-11 w-full rounded-xl" onClick={() => setShown((n) => n + 40)}>
              Ver mais ({filtered.length - shown})
            </Button>
          )}
        </>
      )}

      <Modal open={!!open} onClose={() => setOpenId(null)} title="Detalhes da venda">
        {open && <OrderDetails order={open} />}
      </Modal>
    </div>
  )
}

/** Uma linha por venda; tocar abre os detalhes e as ações. */
function SaleRow({ order: o, onOpen }: { order: StoreOrder; onOpen: () => void }) {
  const attention = needsAction(o)
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-slate-50 ${attention ? 'bg-amber-50/60' : ''}`}
        style={attention ? { boxShadow: 'inset 3px 0 0 #f59e0b' } : undefined}
        aria-label={`${o.buyer.name}, ${formatCents(o.amount)}${attention ? ', precisa da sua atenção' : ''}. Abrir detalhes`}
      >
        <Initials order={o} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-slate-800">{o.buyer.name}</p>
          <p className="truncate text-xs text-slate-500">
            {o.items.map((i) => i.name).join(' + ')}
            {o.test ? ' · teste' : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="text-[15px] font-bold tabular-nums text-slate-900">{formatCents(o.amount)}</p>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">{new Date(o.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            <StatusDot order={o} />
          </div>
        </div>
        <ChevronRight size={16} className="shrink-0 text-slate-300" aria-hidden="true" />
      </button>
    </li>
  )
}

function StatusDot({ order: o }: { order: StoreOrder }) {
  const label = o.method === 'pix_manual' && o.status === 'pending' ? 'Confirmar' : o.status === 'approved' ? 'Aprovada' : o.status === 'pending' ? 'Pendente' : o.status === 'refunded' ? 'Reembolsada' : o.expiredAt ? 'Expirada' : 'Recusada'
  const cls =
    o.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : o.status === 'pending' ? 'bg-amber-100 text-amber-800' : o.status === 'refunded' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500'
  return <span className={`rounded-md px-1.5 py-px text-[10.5px] font-bold ${cls}`}>{label}</span>
}

/** Folha de detalhes: comprador, o que comprou, pagamento e as ações. */
function OrderDetails({ order: o }: { order: StoreOrder }) {
  const phone = String(o.buyer.phone || '').replace(/\D/g, '')
  const wa = phone.length >= 10 ? `https://wa.me/${phone.length <= 11 ? `55${phone}` : phone}` : null
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Initials order={o} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-slate-900">{o.buyer.name}</p>
          <p className="text-xs text-slate-500">{timeLabel(o.createdAt)}</p>
        </div>
        <p className="shrink-0 text-xl font-extrabold tabular-nums text-slate-900">{formatCents(o.amount)}</p>
      </div>

      <dl className="divide-y divide-slate-100 rounded-2xl bg-slate-50 px-4 text-sm">
        <DetailLine label="Status">
          <OrderStatusBadge status={o.status} manual={o.method === 'pix_manual'} expired={!!o.expiredAt} />
          {o.test && <span className="ml-1.5 text-xs font-semibold text-amber-600">teste</span>}
        </DetailLine>
        <DetailLine label="Pagamento">
          {STORE_METHOD_LABEL[o.method]}
          {o.installments && o.installments > 1 ? ` em ${o.installments}x` : ''}
        </DetailLine>
        <DetailLine label="Comprou">
          <span className="flex flex-col items-end gap-0.5">
            {o.items.map((i, idx) => (
              <span key={idx}>
                {i.name}
                {i.bump ? <span className="ml-1 text-[11px] font-semibold text-violet-600">bump</span> : null}
              </span>
            ))}
          </span>
        </DetailLine>
        {o.couponCode && <DetailLine label="Cupom">{o.couponCode}</DetailLine>}
        <DetailLine label="E-mail">
          <a href={`mailto:${o.buyer.email}`} className="break-all text-brand-700">
            {o.buyer.email}
          </a>
        </DetailLine>
        {o.buyer.phone && (
          <DetailLine label="Telefone">
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700">
                {o.buyer.phone}
              </a>
            ) : (
              o.buyer.phone
            )}
          </DetailLine>
        )}
        {o.utm?.utm_source && <DetailLine label="Veio de">{o.utm.utm_source}</DetailLine>}
      </dl>

      <OrderActions order={o} />
    </div>
  )
}

function DetailLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-slate-800">{children}</dd>
    </div>
  )
}

/** Avisos e botões de um pedido (usado no Resumo e nos detalhes da venda). */
function OrderActions({ order: o }: { order: StoreOrder }) {
  const { busy, confirmPayment, cancelOrder, refund, denyRefund, copyAccess, deleteOrder, canDelete } = useOrderActions()
  const manualPending = o.method === 'pix_manual' && (o.status === 'pending' || (o.status === 'refused' && !!o.expiredAt))
  const refundAsked = o.status === 'approved' && !!o.refundRequest && !o.refundRequest.deniedAt
  const hasSecondary = (manualPending && o.status === 'pending') || (o.accessUrl && o.status === 'approved') || o.status === 'approved' || canDelete

  return (
    <>
      {refundAsked && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-700">
          <AlertCircle size={15} className="mt-px shrink-0" aria-hidden="true" />
          Pediu reembolso{o.refundRequest?.reason ? `: ${o.refundRequest.reason}` : ''}
        </p>
      )}
      {o.status === 'approved' && o.capi?.purchase?.ok === false && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertCircle size={15} className="mt-px shrink-0" aria-hidden="true" />
          Não marcou no Meta. O sistema tenta de novo todo dia.
        </p>
      )}
      {manualPending && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800">
          <Banknote size={15} className="mt-px shrink-0" aria-hidden="true" />
          Pix direto: confira no app do banco antes de confirmar.
        </p>
      )}

      {manualPending && (
        <Button className="mt-3 h-11 w-full rounded-xl text-[15px]" icon={<CheckCircle2 size={17} />} loading={busy === o.id} onClick={() => confirmPayment(o)}>
          Confirmar pagamento
        </Button>
      )}

      {hasSecondary ? (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
          {manualPending && o.status === 'pending' && (
            <Button size="sm" variant="ghost" icon={<Ban size={14} />} onClick={() => cancelOrder(o)}>
              Cancelar
            </Button>
          )}
          {o.accessUrl && o.status === 'approved' && (
            <Button size="sm" variant="secondary" icon={<Copy size={14} />} onClick={() => copyAccess(o)}>
              Copiar acesso
            </Button>
          )}
          {refundAsked && (
            <Button size="sm" variant="ghost" icon={<Ban size={14} />} onClick={() => denyRefund(o)}>
              Recusar reembolso
            </Button>
          )}
          {o.status === 'approved' && (
            <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} loading={busy === o.id} onClick={() => refund(o)}>
              Reembolsar
            </Button>
          )}
          {canDelete && (
            <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} loading={busy === o.id} onClick={() => deleteOrder(o)} aria-label={`Excluir pedido de ${o.buyer.name}`} className="ml-auto text-red-600">
              Excluir
            </Button>
          )}
        </div>
      ) : null}
    </>
  )
}

function OrderCard({ order: o }: { order: StoreOrder }) {
  const manualPending = o.method === 'pix_manual' && (o.status === 'pending' || (o.status === 'refused' && !!o.expiredAt))
  const refundAsked = o.status === 'approved' && !!o.refundRequest && !o.refundRequest.deniedAt

  return (
    <li className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ${manualPending || refundAsked ? 'ring-amber-300' : 'ring-slate-200/70'}`}>
      <div className="flex items-start gap-3">
        <Initials order={o} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-[15px] font-semibold text-slate-800">{o.buyer.name}</p>
            <p className="shrink-0 text-[15px] font-bold tabular-nums text-slate-900">{formatCents(o.amount)}</p>
          </div>
          <p className="truncate text-xs text-slate-500">{o.items.map((i) => i.name).join(' + ')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
            <OrderStatusBadge status={o.status} manual={o.method === 'pix_manual'} expired={!!o.expiredAt} />
            <span>
              {STORE_METHOD_LABEL[o.method]}
              {o.installments && o.installments > 1 ? ` ${o.installments}x` : ''}
            </span>
            <span aria-hidden="true">·</span>
            <span>{timeLabel(o.createdAt)}</span>
            {o.test && <span className="font-semibold text-amber-600">teste</span>}
          </div>
        </div>
      </div>
      <OrderActions order={o} />
    </li>
  )
}

function SettingsTab() {
  const { profile, signOut } = useAuth()
  return (
    <div className="space-y-4">
      <section className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-base font-bold text-brand-700" aria-hidden="true">
          {initials(profile?.name ?? '?')}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-slate-800">{profile?.name}</p>
          <p className="truncate text-xs text-slate-500">{profile?.email}</p>
        </div>
        <Button variant="ghost" size="sm" icon={<LogOut size={14} />} onClick={() => signOut()}>
          Sair
        </Button>
      </section>
      <PushNotificationsCard />
      <p className="px-2 text-center text-xs leading-relaxed text-slate-400">
        Este app mostra só a Loja. Produtos, checkout e o resto do CRM ficam no computador, em <span className="font-medium text-slate-500">{window.location.host}</span>.
      </p>
    </div>
  )
}
