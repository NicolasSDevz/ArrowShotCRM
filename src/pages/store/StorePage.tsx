import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  AlertCircle,
  Banknote,
  BarChart3,
  BookOpen,
  CopyPlus,
  ExternalLink,
  FileText,
  ImageOff,
  Lock,
  MessageSquare,
  Package,
  Palette,
  Pencil,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
  Ticket,
  Users,
  Wallet,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { auth } from '../../firebase/config'
import { useStoreAbandoned, useStoreComments, useStoreCoupons, useStoreEnrollments, useStoreMembers, useStoreOrders, useStoreProducts, useStoreProgress } from '../../hooks/useStore'
import { createStoreProduct } from '../../services/storeService'
import { storeAdminStatus } from '../../services/storeApi'
import { Tabs } from '../../components/ui/Tabs'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Field, Input, Select } from '../../components/ui/Field'
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
import { StoreAbandonedPanel } from '../../components/store/admin/StoreAbandonedPanel'
import { maskCurrencyInput, parseCurrencyToNumber } from '../../utils/masks'
import { canUsePrivate, formatCents, type StoreOrder, type StoreProduct } from '../../types/store'

const STATUS_LABEL: Record<StoreProduct['status'], { text: string; cls: string }> = {
  active: { text: 'No ar', cls: 'bg-emerald-50 text-emerald-700' },
  draft: { text: 'Rascunho', cls: 'bg-slate-100 text-slate-600' },
  archived: { text: 'Arquivado', cls: 'bg-slate-100 text-slate-400' },
}

/** /loja — o "Kiwify" da Arrow Shot: produtos, checkout, vendas, alunos e área de membros. */
export function StorePage() {
  const { data: products, loading } = useStoreProducts()
  const { data: orders } = useStoreOrders()
  const { data: allMembers } = useStoreMembers()
  const { data: allEnrollments } = useStoreEnrollments()
  const { data: allProgress } = useStoreProgress()
  const { data: coupons } = useStoreCoupons()
  const { data: allComments } = useStoreComments()
  const { data: abandoned } = useStoreAbandoned()
  const [status, setStatus] = useState<Awaited<ReturnType<typeof storeAdminStatus>> | null>(null)
  const [creating, setCreating] = useState(false)
  // Aba aberta fica na URL: voltar de um produto (ou recarregar) cai na mesma aba.
  const [params, setParams] = useSearchParams()

  useEffect(() => {
    storeAdminStatus().then(setStatus).catch(() => setStatus(null))
  }, [])

  if (loading) return <FullPageSpinner />

  // Produto privado de outra pessoa não vem do banco; o que é derivado dele (alunos,
  // acessos, progresso, comentários) é tirado aqui pela lista de produtos visíveis.
  const visible = new Set(products.map((p) => p.id))
  const enrollments = allEnrollments.filter((e) => visible.has(e.productId))
  const progress = allProgress.filter((p) => visible.has(p.productId))
  const comments = allComments.filter((c) => visible.has(c.productId))
  const enrolledAnywhere = new Set(allEnrollments.map((e) => e.uid))
  const enrolledVisible = new Set(enrollments.map((e) => e.uid))
  const members = allMembers.filter((m) => enrolledVisible.has(m.id) || !enrolledAnywhere.has(m.id))

  const lessonCounts = Object.fromEntries(products.map((p) => [p.id, p.lessonCount ?? 0]))
  const pendingComments = comments.filter((c) => c.status === 'pending').length
  const pixToConfirm = orders.filter((o) => o.status === 'pending' && o.method === 'pix_manual').length
  const refundRequests = orders.filter((o) => o.status === 'approved' && o.refundRequest && !o.refundRequest.deniedAt).length
  const salesAlerts = pixToConfirm + refundRequests
  const salesBadgeLabel = [pixToConfirm && `${pixToConfirm} Pix para confirmar`, refundRequests && `${refundRequests} reembolso pedido`].filter(Boolean).join(', ')
  const openCarts = abandoned.filter((a) => !a.recoveredAt && !a.contactedAt && Date.now() - new Date(a.updatedAt).getTime() > 15 * 60_000).length

  // Resumo do topo: últimos 30 dias, sem pedidos de teste.
  const since = Date.now() - 30 * 86_400_000
  const approved30 = orders.filter((o) => !o.test && o.status === 'approved' && new Date(o.approvedAt || o.createdAt).getTime() >= since)
  const revenue30 = approved30.reduce((sum, o) => sum + o.amount, 0)
  const live = products.filter((p) => p.status === 'active').length
  const ico = 15

  const tabs = [
    { key: 'geral', icon: <BarChart3 size={ico} />, label: 'Visão geral', content: <StoreOverview orders={orders} products={products} abandoned={abandoned} /> },
    { key: 'vendas', icon: <Receipt size={ico} />, label: 'Vendas', badge: salesAlerts, badgeAlert: true, badgeLabel: salesBadgeLabel, content: <StoreOrdersTable orders={orders} products={products} /> },
    { key: 'produtos', icon: <Package size={ico} />, label: 'Produtos', badge: products.length, badgeLabel: `${products.length} produtos`, content: <ProductsGrid products={products} orders={orders} onCreate={() => setCreating(true)} /> },
    { key: 'alunos', icon: <Users size={ico} />, label: 'Alunos', badge: members.length, badgeLabel: `${members.length} alunos`, content: <StoreMembersTable members={members} enrollments={enrollments} progress={progress} products={products} lessonCounts={lessonCounts} emailOn={status?.email ?? false} /> },
    { key: 'abandonados', icon: <ShoppingCart size={ico} />, label: 'Abandonados', badge: openCarts, badgeAlert: true, badgeLabel: `${openCarts} carrinhos sem contato`, content: <StoreAbandonedPanel carts={abandoned} /> },
    { key: 'membros', icon: <Palette size={ico} />, label: 'Área de membros', content: <StoreMembersThemePanel /> },
    { key: 'recebimento', icon: <Wallet size={ico} />, label: 'Recebimento', content: <StorePaymentSettingsPanel principalReady={status?.mpPrincipal ?? status?.mercadoPago ?? false} principalEmail={status?.mpPrincipalEmail} principalInvalid={status?.mpPrincipalInvalid} /> },
    { key: 'comentarios', icon: <MessageSquare size={ico} />, label: 'Comentários', badge: pendingComments, badgeAlert: true, badgeLabel: `${pendingComments} comentários novos`, content: <StoreCommentsPanel comments={comments} products={products} /> },
    { key: 'cupons', icon: <Ticket size={ico} />, label: 'Cupons', content: <StoreCouponsPanel coupons={coupons} products={products} /> },
    { key: 'nota', icon: <FileText size={ico} />, label: 'Nota fiscal', content: <StoreInvoicePanel hasToken={status?.invoice?.hasToken ?? false} onTokenSaved={() => storeAdminStatus().then(setStatus).catch(() => {})} /> },
  ]
  const activeTab = Math.max(0, tabs.findIndex((t) => t.key === params.get('aba')))

  const kpis = [
    { icon: <Wallet size={13} />, label: 'Faturamento (30 dias)', value: formatCents(revenue30) },
    { icon: <ShoppingBag size={13} />, label: 'Vendas (30 dias)', value: String(approved30.length) },
    { icon: <Package size={13} />, label: 'Produtos no ar', value: `${live} de ${products.length}` },
    { icon: <Users size={13} />, label: 'Alunos', value: String(members.length) },
  ]

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-600/30" aria-hidden="true">
            <Store size={20} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight text-slate-900">Loja</h1>
            <p className="truncate text-xs text-slate-500">Checkout, área de membros e vendas dos produtos digitais</p>
          </div>
        </div>

        <dl className="order-3 flex w-full flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-3 lg:order-none lg:w-auto lg:flex-1 lg:justify-center lg:border-0 lg:pt-0">
          {kpis.map((k) => (
            <div key={k.label} className="min-w-[110px]">
              <dt className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                <span aria-hidden="true" className="text-slate-400">{k.icon}</span>
                {k.label}
              </dt>
              <dd className="text-base font-bold tabular-nums text-slate-900">{k.value}</dd>
            </div>
          ))}
        </dl>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <a href="/membros" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <ExternalLink size={15} aria-hidden="true" /> Área de membros
          </a>
          <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>Novo produto</Button>
        </div>
      </header>

      {(pixToConfirm > 0 || refundRequests > 0 || pendingComments > 0) && (
        <ul className="grid gap-3 md:grid-cols-3" aria-label="Precisa da sua atenção">
          {pixToConfirm > 0 && <Alert tone="amber" icon={<Banknote size={18} />} title={`${pixToConfirm} Pix para confirmar`} text="Confira no banco e confirme na aba Vendas." />}
          {refundRequests > 0 && <Alert tone="red" icon={<AlertCircle size={18} />} title={`${refundRequests} ${refundRequests > 1 ? 'pedidos' : 'pedido'} de reembolso`} text="Veja na aba Vendas." />}
          {pendingComments > 0 && <Alert tone="blue" icon={<MessageSquare size={18} />} title={`${pendingComments} ${pendingComments > 1 ? 'comentários novos' : 'comentário novo'}`} text="Aprove ou responda na aba Comentários." />}
        </ul>
      )}

      <div className="overflow-clip rounded-2xl border border-slate-200 bg-white shadow-sm">
        <Tabs
          label="Seções da loja"
          variant="pills"
          active={activeTab}
          onChange={(i) => setParams((p) => {
            const next = new URLSearchParams(p)
            if (i === 0) next.delete('aba')
            else next.set('aba', tabs[i].key)
            return next
          }, { replace: true })}
          tabs={tabs}
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

/** Foto do produto (como era antes: fundo com a imagem). Sem foto, fundo neutro com ícone. */
function ProductThumb({ url, name }: { url?: string | null; name: string }) {
  if (url) return <div role="img" aria-label={name} className="h-full w-full bg-cover bg-center transition duration-300 group-hover:scale-105" style={{ backgroundImage: `url(${url})` }} />
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 text-slate-400">
      <ImageOff size={22} aria-hidden="true" />
      <span className="text-[11px] font-medium">Sem foto</span>
      <span className="sr-only">{name}</span>
    </div>
  )
}

type ProductFilter = 'all' | StoreProduct['status']
type ProductSort = 'recent' | 'name' | 'sales'

/** Data do Firestore (Timestamp) ou texto ISO, em milissegundos. */
function timeOf(v: unknown) {
  const t = v as { toMillis?: () => number } | string | null | undefined
  if (t && typeof t === 'object' && t.toMillis) return t.toMillis()
  return typeof t === 'string' ? new Date(t).getTime() || 0 : 0
}

function ProductsGrid({ products, orders, onCreate }: { products: StoreProduct[]; orders: StoreOrder[]; onCreate: () => void }) {
  const [duplicate, setDuplicate] = useState<StoreProduct | null>(null)
  const [filter, setFilter] = useState<ProductFilter>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<ProductSort>('recent')
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
  const q = search.trim().toLowerCase()
  const list = products
    .filter((p) => (filter === 'all' || p.status === filter) && (!q || p.name.toLowerCase().includes(q)))
    .sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name, 'pt-BR')
        : sort === 'sales'
          ? (sales.get(b.id) ?? 0) - (sales.get(a.id) ?? 0)
          : timeOf(b.updatedAt ?? b.createdAt) - timeOf(a.updatedAt ?? a.createdAt)
    )
  const filters: { key: ProductFilter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'active', label: 'No ar' },
    { key: 'draft', label: 'Rascunho' },
    { key: 'archived', label: 'Arquivados' },
  ]
  const actionCls = 'flex flex-1 items-center justify-center gap-1.5 py-2 text-slate-500 hover:bg-slate-50 hover:text-brand-700'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
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
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input aria-label="Buscar produto" placeholder="Buscar produto" value={search} onChange={(e) => setSearch(e.target.value)} className="!pl-9" />
        </div>
        <Select aria-label="Ordenar produtos" value={sort} onChange={(e) => setSort(e.target.value as ProductSort)} className="!w-48">
          <option value="recent">Mexidos por último</option>
          <option value="sales">Mais vendidos</option>
          <option value="name">Nome (A a Z)</option>
        </Select>
      </div>

      {list.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">Nenhum produto com esse filtro.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {list.map((p) => {
            const sold = sales.get(p.id) ?? 0
            const lessons = p.lessonCount ?? 0
            return (
              <li key={p.id} className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-brand-300 hover:shadow-md">
                <Link to={`/loja/produtos/${p.id}`} className="flex flex-1 flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
                  <div className="relative aspect-[16/9] overflow-hidden">
                    <ProductThumb url={p.imageUrl} name={p.name} />
                    <Badge className={`absolute left-2.5 top-2.5 shadow-sm ${STATUS_LABEL[p.status].cls}`}>{STATUS_LABEL[p.status].text}</Badge>
                    {p.privateTo && (
                      <span className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 text-white" title="Privado: só você vê" aria-label="Privado">
                        <Lock size={11} aria-hidden="true" />
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3.5">
                    <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800 group-hover:text-brand-700">{p.name}</h3>
                    <div className="mt-auto flex items-end justify-between gap-2">
                      <p className="font-bold text-slate-900">
                        {formatCents(p.price)}
                        {p.comparePrice && p.comparePrice > p.price && <span className="ml-1.5 text-xs font-normal text-slate-400 line-through">{formatCents(p.comparePrice)}</span>}
                      </p>
                      <p className="flex items-center gap-2.5 text-xs text-slate-500">
                        <span className="flex items-center gap-1" title="Vendas aprovadas"><ShoppingBag size={12} aria-hidden="true" /> {sold}<span className="sr-only"> {sold === 1 ? 'venda' : 'vendas'}</span></span>
                        <span className="flex items-center gap-1" title="Aulas"><BookOpen size={12} aria-hidden="true" /> {lessons}<span className="sr-only"> {lessons === 1 ? 'aula' : 'aulas'}</span></span>
                      </p>
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
      )}
      <DuplicateProductModal product={duplicate} onClose={() => setDuplicate(null)} />
    </div>
  )
}

function NewProductModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [onlyMe, setOnlyMe] = useState(false)
  // "Só eu vejo" é só pro Nicolas (as regras e o servidor conferem o e-mail também).
  const canPrivate = canUsePrivate(auth.currentUser?.email)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile || !name.trim()) return
    const value = parseCurrencyToNumber(price) ?? 0
    setBusy(true)
    try {
      const id = await createStoreProduct(name.trim(), Math.round(value * 100), profile.id, onlyMe)
      onClose()
      setName('')
      setPrice('')
      setOnlyMe(false)
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
        {canPrivate && (
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" checked={onlyMe} onChange={(e) => setOnlyMe(e.target.checked)} className="h-3.5 w-3.5" />
            <Lock size={11} aria-hidden="true" /> Privado
          </label>
          )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}>Criar e configurar</Button>
        </div>
      </form>
    </Modal>
  )
}
