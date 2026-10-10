import { useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, Ban, Banknote, CheckCircle2, Copy, Home, LogOut, Receipt, RotateCcw, Settings, Store } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useStoreOrders } from '../../hooks/useStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { FullPageSpinner } from '../../components/ui/FullPageSpinner'
import { PushNotificationsCard } from '../../components/notifications/PushNotificationsCard'
import { OrderStatusBadge, useOrderActions, useReconcilePending } from '../../components/store/admin/StoreOrdersTable'
import { formatCents, STORE_METHOD_LABEL, type StoreOrder, type StoreOrderStatus } from '../../types/store'

type Tab = 'home' | 'sales' | 'settings'

const DAY = 86_400_000
const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const paidAt = (o: StoreOrder) => new Date(o.approvedAt || o.createdAt).getTime()
const needsAction = (o: StoreOrder) =>
  (o.method === 'pix_manual' && o.status === 'pending') || (o.status === 'approved' && !!o.refundRequest) || (o.status === 'approved' && o.capi?.purchase?.ok === false)

/** /app — o CRM instalado no celular (Android e iPhone) abre só aqui: resumo da
 *  Loja, vendas e o que precisa de ação. O CRM completo fica no computador. */
export function StoreAppPage() {
  const { data: orders, loading } = useStoreOrders()
  const [tab, setTab] = useState<Tab>('home')
  useReconcilePending(orders)

  if (loading) return <FullPageSpinner />

  const tabs: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: 'home', label: 'Resumo', icon: <Home size={20} /> },
    { key: 'sales', label: 'Vendas', icon: <Receipt size={20} /> },
    { key: 'settings', label: 'Ajustes', icon: <Settings size={20} /> },
  ]
  const pending = orders.filter(needsAction).length

  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-gradient-to-br from-brand-600 to-brand-800 px-4 pb-3 text-white" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <Store size={20} aria-hidden="true" />
        <h1 className="text-lg font-bold">Loja</h1>
      </header>

      <main className="flex-1 px-4 py-4" style={{ paddingBottom: 'calc(88px + env(safe-area-inset-bottom))' }}>
        {tab === 'home' && <HomeTab orders={orders} onSeeAll={() => setTab('sales')} />}
        {tab === 'sales' && <SalesTab orders={orders} />}
        {tab === 'settings' && <SettingsTab />}
      </main>

      <nav aria-label="Seções do app" className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? 'page' : undefined}
            className={`relative flex h-16 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${tab === t.key ? 'text-brand-700' : 'text-slate-500'}`}
          >
            {t.icon}
            {t.label}
            {t.key === 'sales' && pending > 0 && (
              <span className="absolute right-[calc(50%-22px)] top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{pending}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}

function HomeTab({ orders, onSeeAll }: { orders: StoreOrder[]; onSeeAll: () => void }) {
  const real = orders.filter((o) => !o.test && o.status === 'approved')
  const sum = (since: number) => {
    const list = real.filter((o) => paidAt(o) >= since)
    return { total: list.reduce((s, o) => s + o.amount, 0), count: list.length }
  }
  const today = sum(startOfToday())
  const week = sum(Date.now() - 7 * DAY)
  const month = sum(Date.now() - 30 * DAY)
  const attention = orders.filter(needsAction)
  const recent = [...real].sort((a, b) => paidAt(b) - paidAt(a)).slice(0, 5)

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs font-medium text-slate-500">Hoje</p>
        <p className="mt-0.5 text-3xl font-bold tabular-nums text-slate-900">{formatCents(today.total)}</p>
        <p className="text-sm text-slate-500">{today.count} {today.count === 1 ? 'venda' : 'vendas'}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
          <Stat label="7 dias" value={formatCents(week.total)} sub={`${week.count} vendas`} />
          <Stat label="30 dias" value={formatCents(month.total)} sub={`${month.count} vendas`} />
        </dl>
      </section>

      {attention.length > 0 && (
        <section aria-labelledby="atencao">
          <h2 id="atencao" className="mb-2 text-sm font-semibold text-slate-700">Precisa da sua atenção</h2>
          <ul className="space-y-2">
            {attention.map((o) => <OrderCard key={o.id} order={o} />)}
          </ul>
        </section>
      )}

      <section aria-labelledby="ultimas">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="ultimas" className="text-sm font-semibold text-slate-700">Últimas vendas</h2>
          {recent.length > 0 && <button type="button" onClick={onSeeAll} className="text-sm font-medium text-brand-700">Ver todas</button>}
        </div>
        {recent.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-sm text-slate-500 ring-1 ring-slate-200">Nenhuma venda ainda. Quando alguém comprar, aparece aqui na hora.</p>
        ) : (
          <ul className="space-y-2">{recent.map((o) => <OrderCard key={o.id} order={o} compact />)}</ul>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-base font-semibold tabular-nums text-slate-800">{value}</dd>
      <dd className="text-xs text-slate-400">{sub}</dd>
    </div>
  )
}

const FILTERS: { key: '' | StoreOrderStatus; label: string }[] = [
  { key: '', label: 'Todas' },
  { key: 'approved', label: 'Aprovadas' },
  { key: 'pending', label: 'Pendentes' },
  { key: 'refunded', label: 'Reembolsadas' },
]

function SalesTab({ orders }: { orders: StoreOrder[] }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'' | StoreOrderStatus>('')
  const [shown, setShown] = useState(30)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => (!status || o.status === status) && (!q || o.buyer.name.toLowerCase().includes(q) || o.buyer.email.includes(q)))
  }, [orders, search, status])

  return (
    <div className="space-y-3">
      <Input aria-label="Buscar por nome ou e-mail" placeholder="Buscar por nome ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div role="radiogroup" aria-label="Status" className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="radio"
            aria-checked={status === f.key}
            onClick={() => setStatus(f.key)}
            className={`h-8 shrink-0 rounded-full px-3 text-sm font-medium ${status === f.key ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-sm text-slate-500 ring-1 ring-slate-200">Nenhum pedido.</p>
      ) : (
        <>
          <ul className="space-y-2">{filtered.slice(0, shown).map((o) => <OrderCard key={o.id} order={o} />)}</ul>
          {filtered.length > shown && (
            <Button variant="secondary" className="w-full" onClick={() => setShown((n) => n + 30)}>
              Ver mais ({filtered.length - shown})
            </Button>
          )}
        </>
      )}
    </div>
  )
}

function OrderCard({ order: o, compact = false }: { order: StoreOrder; compact?: boolean }) {
  const { busy, confirmPayment, cancelOrder, refund, copyAccess } = useOrderActions()
  const manualPending = o.method === 'pix_manual' && (o.status === 'pending' || (o.status === 'refused' && !!o.expiredAt))

  return (
    <li className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-800">{o.buyer.name}</p>
          <p className="truncate text-xs text-slate-500">{o.items.map((i) => i.name).join(' + ')}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold tabular-nums text-slate-900">{formatCents(o.amount)}</p>
          <p className="text-xs text-slate-400">{STORE_METHOD_LABEL[o.method]}{o.installments && o.installments > 1 ? ` ${o.installments}x` : ''}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
        <OrderStatusBadge status={o.status} manual={o.method === 'pix_manual'} expired={!!o.expiredAt} />
        <span>{new Date(o.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
        {o.test && <span className="font-medium text-amber-600">teste</span>}
      </div>

      {!compact && (
        <>
          {o.refundRequest && o.status === 'approved' && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-50 p-2 text-xs text-red-700">
              <AlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
              Pediu reembolso{o.refundRequest.reason ? `: ${o.refundRequest.reason}` : ''}
            </p>
          )}
          {o.status === 'approved' && o.capi?.purchase?.ok === false && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              <AlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
              Não marcou no Meta. O sistema tenta de novo todo dia.
            </p>
          )}
          {manualPending && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              <Banknote size={14} className="mt-px shrink-0" aria-hidden="true" />
              Pix direto: confira no app do banco antes de confirmar.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {manualPending && (
              <Button size="sm" icon={<CheckCircle2 size={14} />} loading={busy === o.id} onClick={() => confirmPayment(o)}>
                Confirmar pagamento
              </Button>
            )}
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
            {o.status === 'approved' && (
              <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} loading={busy === o.id} onClick={() => refund(o)}>
                Reembolsar
              </Button>
            )}
          </div>
        </>
      )}
    </li>
  )
}

function SettingsTab() {
  const { profile, signOut } = useAuth()
  return (
    <div className="space-y-4">
      <PushNotificationsCard />
      <section className="rounded-2xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
        <p>
          Este app mostra só a Loja. Produtos, checkout e o resto do CRM ficam no computador, em <span className="font-medium text-slate-800">{window.location.host}</span>.
        </p>
      </section>
      <section className="flex items-center justify-between rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">{profile?.name}</p>
          <p className="truncate text-xs text-slate-500">{profile?.email}</p>
        </div>
        <Button variant="ghost" size="sm" icon={<LogOut size={14} />} onClick={() => signOut()}>
          Sair
        </Button>
      </section>
    </div>
  )
}
