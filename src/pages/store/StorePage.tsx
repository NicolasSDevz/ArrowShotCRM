import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CopyPlus, ExternalLink, Package, Plus } from 'lucide-react'
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
import { maskCurrencyInput, parseCurrencyToNumber } from '../../utils/masks'
import { formatCents, type StoreProduct } from '../../types/store'

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

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Loja</h1>
          <p className="text-sm text-slate-500">Checkout próprio, área de membros e vendas dos nossos produtos digitais.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/membros" target="_blank" rel="noreferrer" className="inline-flex h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <ExternalLink size={15} /> Ver área de membros
          </a>
          <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>Novo produto</Button>
        </div>
      </header>


      <Tabs
        label="Seções da loja"
        tabs={[
          { label: 'Visão geral', content: <StoreOverview orders={orders} products={products} /> },
          { label: `Produtos (${products.length})`, content: <ProductsGrid products={products} onCreate={() => setCreating(true)} /> },
          { label: salesBadges ? `Vendas (${salesBadges})` : 'Vendas', content: <StoreOrdersTable orders={orders} products={products} /> },
          { label: `Alunos (${members.length})`, content: <StoreMembersTable members={members} enrollments={enrollments} progress={progress} products={products} lessonCounts={lessonCounts} /> },
          { label: 'Cupons', content: <StoreCouponsPanel coupons={coupons} products={products} /> },
          { label: pendingComments ? `Comentários (${pendingComments} novos)` : 'Comentários', content: <StoreCommentsPanel comments={comments} products={products} /> },
          { label: 'Recebimento', content: <StorePaymentSettingsPanel mercadoPago={status?.mercadoPago ?? false} /> },
          { label: 'Nota fiscal', content: <StoreInvoicePanel hasToken={status?.invoice?.hasToken ?? false} onTokenSaved={() => storeAdminStatus().then(setStatus).catch(() => {})} /> },
        ]}
      />

      <NewProductModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

function ProductsGrid({ products, onCreate }: { products: StoreProduct[]; onCreate: () => void }) {
  const [duplicate, setDuplicate] = useState<StoreProduct | null>(null)
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
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {products.map((p) => (
        <li key={p.id}>
          <Link to={`/loja/produtos/${p.id}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:shadow-md">
            <div className="aspect-[16/9] bg-slate-100 bg-cover bg-center" style={p.imageUrl ? { backgroundImage: `url(${p.imageUrl})` } : undefined}>
              {!p.imageUrl && <span className="flex h-full items-center justify-center text-slate-300"><Package size={40} /></span>}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-800 group-hover:text-brand-700">{p.name}</h3>
                <Badge className={STATUS_LABEL[p.status].cls}>{STATUS_LABEL[p.status].text}</Badge>
              </div>
              <p className="text-sm text-slate-500">{formatCents(p.price)}</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setDuplicate(p)}
            className="mt-1.5 flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-600"
            aria-label={`Duplicar o produto ${p.name}`}
          >
            <CopyPlus size={13} aria-hidden="true" /> Duplicar
          </button>
        </li>
      ))}
      <DuplicateProductModal product={duplicate} onClose={() => setDuplicate(null)} />
    </ul>
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
