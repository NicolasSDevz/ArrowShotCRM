import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  AlertCircle,
  Banknote,
  BarChart3,
  BookOpen,
  CopyPlus,
  ExternalLink,
  FileText,
  MessageSquare,
  Package,
  Palette,
  Pencil,
  Plus,
  Receipt,
  ShoppingBag,
  Store,
  Ticket,
  Users,
  Wallet,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useStoreComments, useStoreCoupons, useStoreEnrollments, useStoreMembers, useStoreOrders, useStoreProducts, useStoreProgress } from '../../hooks/useStore'
import { createStoreProduct } from '../../services/storeService'
import { storeAdminStatus } from '../../services/storeApi'
import { Tabs } from '../../components/ui/Tabs'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Field, Input } from '../../components/ui/Field'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { FullPageSpinner } from '../../components/ui/FullPageSpinner'
import { StoreOverview } from '../../components/store/admin/StoreOverview'
import { StoreOrdersTable } from '../../components/store/admin/StoreOrdersTable'
import { StoreMembersTable } from '../../components/store/admin/StoreMembersTable'
import { StoreCouponsPanel } from '../../components/store/admin/StoreCouponsPanel'
import { StoreCommentsPanel } from '../../components/store/admin/StoreCommentsPanel'
import { StorePaymentSettingsPanel } from '../../components/store/admin/StorePaymentSettingsPanel'
import { StoreInvoicePanel } from '../../components/store/admin/StoreInvoicePanel'
import { DuplicateProductModal } from '../../components/store/admin/DuplicateProductModal'
import { StoreMembersThemePanel } from '../../components/store/admin/StoreMembersThemePanel'
import { maskCurrencyInput, parseCurrencyToNumber } from '../../utils/masks'
import { formatCents, type StoreOrder, type StoreProduct } from '../../types/store'

const STATUS_LABEL: Record<StoreProduct['status'], { text: string; cls: string }> = {
  active: { text: 'No ar', cls: 'bg-emerald-50 text-emerald-700' },
  draft: { text: 'Rascunho', cls: 'bg-slate-100 text-slate-600' },
  archived: { text: 'Arquivado', cls: 'bg-slate-100 text-slate-400' },
}

/** /loja — o "Kiwify" da Arrow Shot: produtos, checkout, vendas, alunos e área de membros. */
export function StorePage() {
  const { data: products, loading } = useStoreProducts()
  const { data: orders } = useStoreOrders()
  const { data: members } = useStoreMembers()
  const { data: enrollments } = useStoreEnrollments()
  const { data: progress } = useStoreProgress()
  const { data: coupons } = useStoreCoupons()
  const { data: comments } = useStoreComments()
  const [status, setStatus] = useState<Awaited<ReturnType<typeof storeAdminStatus>> | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    storeAdminStatus().then(setStatus).catch(() => setStatus(null))
  }, [])

  if (loading) return <FullPageSpinner />

  const lessonCounts = Object.fromEntries(products.map((p) => [p.id, p.lessonCount ?? 0]))
  const pendingComments = comments.filter((c) => c.status === 'pending').length
  const pixToConfirm = orders.filter((o) => o.status === 'pending' && o.method === 'pix_manual').length
  const refundRequests = orders.filter((o) => o.status === 'approved' && o.refundRequest).length
  const salesBadges = [pixToConfirm && `${pixToConfirm} Pix para confirmar`, refundRequests && `${refundRequests} reembolso pedido`].filter(Boolean).join(', ')

  // Resumo do topo: últimos 30 dias, sem pedidos de teste.
  const since = Date.now() - 30 * 86_400_000
  const approved30 = orders.filter((o) => !o.test && o.status === 'approved' && new Date(o.approvedAt || o.createdAt).getTime() >= since)
  const revenue30 = approved30.reduce((sum, o) => sum + o.amount, 0)
  const live = products.filter((p) => p.status === 'active').length
  const ico = 15

  const kpis = [
    { icon: <Wallet size={16} />, label: 'Faturamento (30 dias)', value: formatCents(revenue30) },
    { icon: <ShoppingBag size={16} />, label: 'Vendas (30 dias)', value: String(approved30.length) },
    { icon: <Package size={16} />, label: 'Produtos no ar', value: `${live} de ${products.length}` },
    { icon: <Users size={16} />, label: 'Alunos', value: String(members.length) },
  ]

  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white shadow-lg sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-24 h-48 w-48 rounded-full bg-white/5" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25" aria-hidden="true">
              <Store size={24} />
            </span>
            <div>
              <h1 className="text-2xl font-bold">Loja</h1>
              <p className="text-sm text-white/75">Checkout próprio, área de membros e vendas dos nossos produtos digitais.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/membros" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white/10 px-3.5 text-sm font-medium text-white ring-1 ring-white/25 hover:bg-white/20">
              <ExternalLink size={15} aria-hidden="true" /> Ver área de membros
            </a>
            <button type="button" onClick={() => setCreating(true)} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white px-4 text-sm font-semibold text-brand-700 shadow-sm hover:bg-brand-50">
              <Plus size={16} aria-hidden="true" /> Novo produto
            </button>
          </div>
        </div>

        <dl className="relative mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/15">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-white/75">
                <span aria-hidden="true">{k.icon}</span>
                {k.label}
              </dt>
              <dd className="mt-1 text-xl font-bold tabular-nums">{k.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      {(pixToConfirm > 0 || refundRequests > 0 || pendingComments > 0) && (
        <ul className="grid gap-3 md:grid-cols-3" aria-label="Precisa da sua atenção">
          {pixToConfirm > 0 && <Alert tone="amber" icon={<Banknote size={18} />} title={`${pixToConfirm} Pix para confirmar`} text="Confira no banco e confirme na aba Vendas." />}
          {refundRequests > 0 && <Alert tone="red" icon={<AlertCircle size={18} />} title={`${refundRequests} ${refundRequests > 1 ? 'pedidos' : 'pedido'} de reembolso`} text="Veja na aba Vendas." />}
          {pendingComments > 0 && <Alert tone="blue" icon={<MessageSquare size={18} />} title={`${pendingComments} ${pendingComments > 1 ? 'comentários novos' : 'comentário novo'}`} text="Aprove ou responda na aba Comentários." />}
        </ul>
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <Tabs
          label="Seções da loja"
          tabs={[
            { icon: <BarChart3 size={ico} />, label: 'Visão geral', content: <StoreOverview orders={orders} products={products} /> },
            { icon: <Package size={ico} />, label: `Produtos (${products.length})`, content: <ProductsGrid products={products} orders={orders} onCreate={() => setCreating(true)} /> },
            { icon: <Receipt size={ico} />, label: salesBadges ? `Vendas (${salesBadges})` : 'Vendas', content: <StoreOrdersTable orders={orders} products={products} /> },
            { icon: <Users size={ico} />, label: `Alunos (${members.length})`, content: <StoreMembersTable members={members} enrollments={enrollments} progress={progress} products={products} lessonCounts={lessonCounts} /> },
            { icon: <Ticket size={ico} />, label: 'Cupons', content: <StoreCouponsPanel coupons={coupons} products={products} /> },
            { icon: <MessageSquare size={ico} />, label: pendingComments ? `Comentários (${pendingComments} novos)` : 'Comentários', content: <StoreCommentsPanel comments={comments} products={products} /> },
            { icon: <Palette size={ico} />, label: 'Área de membros', content: <StoreMembersThemePanel />, secondary: true },
            { icon: <Wallet size={ico} />, label: 'Recebimento', content: <StorePaymentSettingsPanel mercadoPago={status?.mercadoPago ?? false} />, secondary: true },
            { icon: <FileText size={ico} />, label: 'Nota fiscal', content: <StoreInvoicePanel hasToken={status?.invoice?.hasToken ?? false} onTokenSaved={() => storeAdminStatus().then(setStatus).catch(() => {})} />, secondary: true },
          ]}
        />
      </div>

      <NewProductModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

const ALERT_TONE = {
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  red: 'border-red-200 bg-red-50 text-red-800',
  blue: 'border-brand-200 bg-brand-50 text-brand-800',
}

function Alert({ tone, icon, title, text }: { tone: keyof typeof ALERT_TONE; icon: ReactNode; title: string; text: string }) {
  return (
    <li className={`flex items-start gap-3 rounded-2xl border p-4 ${ALERT_TONE[tone]}`}>
      <span className="mt-0.5 shrink-0" aria-hidden="true">{icon}</span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs opacity-80">{text}</p>
      </div>
    </li>
  )
}

/** Capa sem foto: degradê com as iniciais do produto (cor fixa por nome). */
const COVER_GRADIENTS = ['from-sky-500 to-indigo-600', 'from-emerald-500 to-teal-600', 'from-orange-400 to-rose-500', 'from-violet-500 to-fuchsia-600', 'from-amber-400 to-orange-600', 'from-cyan-500 to-blue-600']

function coverFor(name: string) {
  const sum = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const words = name.split(/\s+/).filter((w) => w.length > 2 || /\d/.test(w))
  const initials = words.slice(0, 2).map((w) => w[0]).join('').toUpperCase() || name.slice(0, 2).toUpperCase()
  return { gradient: COVER_GRADIENTS[sum % COVER_GRADIENTS.length], initials }
}

type ProductFilter = 'all' | StoreProduct['status']

function ProductsGrid({ products, orders, onCreate }: { products: StoreProduct[]; orders: StoreOrder[]; onCreate: () => void }) {
  const [duplicate, setDuplicate] = useState<StoreProduct | null>(null)
  const [filter, setFilter] = useState<ProductFilter>('all')
  if (!products.length) {
    return (
      <EmptyState
        icon={<Package size={36} />}
        title="Nenhum produto ainda"
        description="Crie um produto, monte o checkout e suba as aulas da área de membros."
        action={<Button icon={<Plus size={15} />} onClick={onCreate}>Criar primeiro produto</Button>}
      />
    )
  }

  const sales = new Map<string, number>()
  for (const o of orders) if (!o.test && o.status === 'approved') sales.set(o.productId, (sales.get(o.productId) ?? 0) + 1)
  const counts: Record<ProductFilter, number> = { all: products.length, active: 0, draft: 0, archived: 0 }
  for (const p of products) counts[p.status] += 1
  const list = filter === 'all' ? products : products.filter((p) => p.status === filter)
  const filters: { key: ProductFilter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'active', label: 'No ar' },
    { key: 'draft', label: 'Rascunho' },
    { key: 'archived', label: 'Arquivados' },
  ]
  const actionCls = 'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-slate-600 hover:bg-slate-50 hover:text-brand-700'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Filtrar produtos" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {filters
            .filter((f) => f.key === 'all' || counts[f.key] > 0)
            .map((f) => (
              <button
                key={f.key}
                type="button"
                role="radio"
                aria-checked={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filter === f.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {f.label} <span className="ml-0.5 opacity-60">{counts[f.key]}</span>
              </button>
            ))}
        </div>
        <Button icon={<Plus size={15} />} variant="secondary" onClick={onCreate}>Novo produto</Button>
      </div>

      <ul className="grid gap-x-5 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => {
          const cover = coverFor(p.name)
          const sold = sales.get(p.id) ?? 0
          const lessons = p.lessonCount ?? 0
          return (
            <li key={p.id} className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
              <Link to={`/loja/produtos/${p.id}`} className="flex flex-1 flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
                <div className="relative aspect-[16/9] overflow-hidden">
                  {p.imageUrl ? (
                    <div className="h-full w-full bg-cover bg-center transition duration-300 group-hover:scale-105" style={{ backgroundImage: `url(${p.imageUrl})` }} />
                  ) : (
                    <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${cover.gradient} transition duration-300 group-hover:scale-105`}>
                      <span className="text-4xl font-black tracking-tight text-white/90 drop-shadow-sm" aria-hidden="true">{cover.initials}</span>
                    </div>
                  )}
                  <Badge className={`absolute left-3 top-3 shadow-sm ${STATUS_LABEL[p.status].cls}`}>{STATUS_LABEL[p.status].text}</Badge>
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <h3 className="line-clamp-2 font-semibold leading-snug text-slate-800 group-hover:text-brand-700">{p.name}</h3>
                  <div className="mt-auto flex items-end justify-between gap-2">
                    <div>
                      {p.comparePrice && p.comparePrice > p.price && <p className="text-xs text-slate-400 line-through">{formatCents(p.comparePrice)}</p>}
                      <p className="text-lg font-bold text-slate-900">{formatCents(p.price)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><ShoppingBag size={12} aria-hidden="true" /> {sold} {sold === 1 ? 'venda' : 'vendas'}</span>
                      <span className="flex items-center gap-1"><BookOpen size={12} aria-hidden="true" /> {lessons} {lessons === 1 ? 'aula' : 'aulas'}</span>
                    </div>
                  </div>
                </div>
              </Link>
              <div className="flex border-t border-slate-100 text-xs font-semibold">
                <Link to={`/loja/produtos/${p.id}`} className={actionCls} aria-label={`Editar ${p.name}`}>
                  <Pencil size={13} aria-hidden="true" /> Editar
                </Link>
                <button type="button" onClick={() => setDuplicate(p)} className={`${actionCls} border-l border-slate-100`} aria-label={`Duplicar o produto ${p.name}`}>
                  <CopyPlus size={13} aria-hidden="true" /> Duplicar
                </button>
                {p.status === 'active' && (
                  <a href={`/pay/${p.slug}`} target="_blank" rel="noreferrer" className={`${actionCls} border-l border-slate-100`} aria-label={`Abrir o checkout de ${p.name}`}>
                    <ExternalLink size={13} aria-hidden="true" /> Checkout
                  </a>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <DuplicateProductModal product={duplicate} onClose={() => setDuplicate(null)} />
    </div>
  )
}

function NewProductModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile || !name.trim()) return
    const value = parseCurrencyToNumber(price) ?? 0
    setBusy(true)
    try {
      const id = await createStoreProduct(name.trim(), Math.round(value * 100), profile.id)
      onClose()
      setName('')
      setPrice('')
      navigate(`/loja/produtos/${id}`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo produto">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nome do produto" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Método de Tráfego para Limpeza" autoFocus /></Field>
        <Field label="Preço" required><Input inputMode="numeric" value={price} onChange={(e) => setPrice(maskCurrencyInput(e.target.value))} placeholder="R$ 0,00" /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}>Criar e configurar</Button>
        </div>
      </form>
    </Modal>
  )
}
