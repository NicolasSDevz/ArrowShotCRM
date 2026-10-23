import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Ban, CheckCircle2, ChevronDown, Clock, Copy, Download, FileText, Layers, Package, RotateCcw, Trash2, Wallet } from 'lucide-react'
import { MetricCard } from '../../ui/MetricCard'
import { useAuth } from '../../../context/AuthContext'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Input, Select } from '../../ui/Field'
import { EmptyState } from '../../ui/EmptyState'
import { storeAccessLink, storeCancelOrder, storeDeleteOrder, storeConfirmOrder, storeEmitInvoice, storeReconcileOrders, storeRefundOrder, storeDenyRefund, storeSyncInvoices } from '../../../services/storeApi'
import { askConfirm } from '../../../utils/confirmDialog'
import { DateRangeFilter, inRange, resolveRange, type DateRangeValue } from './DateRangeFilter'
import { formatCents, STORE_METHOD_LABEL, STORE_ORDER_STATUS_LABEL, type StoreOrder, type StoreOrderStatus, type StoreProduct } from '../../../types/store'

const STATUS_CLS: Record<StoreOrderStatus, string> = {
  approved: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  refused: 'bg-red-50 text-red-600',
  refunded: 'bg-slate-100 text-slate-600',
}

/** Bolinha de cor do status (o tema escuro deixa o selo neutro; a cor fica só no ponto). */
const STATUS_DOT: Record<StoreOrderStatus, string> = {
  approved: '#4cc38a',
  pending: '#f5b544',
  refused: '#f28b8b',
  refunded: '#85858b',
}

export function OrderStatusBadge({ status, manual, expired }: { status: StoreOrderStatus; manual?: boolean; expired?: boolean }) {
  return (
    <Badge className={`whitespace-nowrap ${STATUS_CLS[status]}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: expired && status === 'refused' ? STATUS_DOT.refunded : STATUS_DOT[status] }} />
      {status === 'pending' && manual ? 'Aguardando confirmação' : expired && status === 'refused' ? 'Expirado' : STORE_ORDER_STATUS_LABEL[status]}
    </Badge>
  )
}

export async function copyText(text: string, okMsg = 'Copiado') {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(okMsg)
  } catch {
    window.prompt('Copie o texto:', text)
  }
}

function InvoiceCell({ order: o, busy, onEmit }: { order: StoreOrder; busy: boolean; onEmit: () => void }) {
  const inv = o.invoice
  const test = inv?.environment === 'homologacao' ? ' (teste)' : ''
  if (o.status !== 'approved' && !inv) return <span className="text-xs text-slate-300">-</span>
  if (o.test || !(o.amount > 0)) return <span className="text-xs text-slate-400">Não se aplica</span>
  if (inv?.status === 'autorizado') {
    return (
      <div className="space-y-0.5">
        <Badge className="bg-emerald-50 text-emerald-700">Emitida{test}</Badge>
        {inv.pdfUrl && (
          <a href={inv.pdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-brand-600 hover:underline">
            <FileText size={12} aria-hidden="true" /> Nota {inv.numero ?? ''} em PDF
          </a>
        )}
        {inv.emailSent && <p className="text-xs text-slate-400">Enviada por e-mail</p>}
      </div>
    )
  }
  if (inv?.status === 'processando') return <Badge className="bg-amber-50 text-amber-700">Processando na prefeitura{test}</Badge>
  if (inv?.status === 'cancelado') return <Badge className="bg-slate-100 text-slate-600">Cancelada</Badge>
  return (
    <div className="max-w-[220px] space-y-1">
      {inv?.status === 'erro' && <p className="text-xs text-red-600">Erro na nota: {inv.error}</p>}
      {o.status === 'approved' && (
        <Button size="sm" variant="secondary" loading={busy} onClick={onEmit} aria-label={`${inv ? 'Tentar emitir de novo' : 'Emitir'} a nota de ${o.buyer.name}`}>
          {inv ? 'Tentar de novo' : 'Emitir nota'}
        </Button>
      )}
    </div>
  )
}

function toCsv(orders: StoreOrder[]) {
  const head = ['Data', 'Pedido', 'Status', 'Forma', 'Valor', 'Produtos', 'Cupom', 'Nome', 'E-mail', 'Telefone', 'CPF', 'utm_source', 'utm_campaign', 'utm_content']
  const rows = orders.map((o) => [
    new Date(o.createdAt).toLocaleString('pt-BR'),
    o.id,
    STORE_ORDER_STATUS_LABEL[o.status],
    STORE_METHOD_LABEL[o.method],
    (o.amount / 100).toFixed(2).replace('.', ','),
    o.items.map((i) => i.name).join(' + '),
    o.couponCode || '',
    o.buyer.name,
    o.buyer.email,
    o.buyer.phone || '',
    o.buyer.cpf || '',
    o.utm?.utm_source || '',
    o.utm?.utm_campaign || '',
    o.utm?.utm_content || '',
  ])
  return [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
}

/** Pedidos do Mercado Pago ainda pendentes: confere lá ao abrir a tela (cobre webhook que não chegou). */
export function useReconcilePending(orders: StoreOrder[]) {
  const reconciledOnce = useRef(false)
  useEffect(() => {
    if (reconciledOnce.current || !orders.some((o) => o.status === 'pending' && o.mpPaymentId)) return
    reconciledOnce.current = true
    storeReconcileOrders().catch(() => {})
  }, [orders])
}

/** Ações de um pedido (confirmar Pix direto, cancelar, reembolsar, copiar acesso). Usado pela tabela e pelo app do celular. */
export function useOrderActions() {
  const [refunding, setRefunding] = useState<string | null>(null)

  // Link novo na hora: o salvo no pedido vence 30 dias depois do primeiro uso.
  const copyAccess = async (o: StoreOrder) => {
    try {
      const url = o.memberUid ? (await storeAccessLink(o.memberUid, o.productId)).accessUrl : o.accessUrl!
      await copyText(url, 'Link de acesso copiado')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const confirmPayment = async (o: StoreOrder) => {
    const ok = await askConfirm({
      title: 'Confirmar pagamento',
      message: `${o.buyer.name}, ${formatCents(o.amount)} (pedido ${o.id.replace('ord_', '')}). Confira no app do banco se esse Pix caiu. Ao confirmar, o acesso é liberado na hora.`,
      confirmLabel: 'Confirmar e liberar acesso',
    })
    if (!ok) return
    setRefunding(o.id)
    try {
      await storeConfirmOrder(o.id)
      toast.success(`Pagamento de ${o.buyer.name} confirmado e acesso liberado`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setRefunding(null)
    }
  }

  const cancelOrder = async (o: StoreOrder) => {
    if (!(await askConfirm({ title: 'Cancelar pedido', message: `${o.buyer.name}, ${formatCents(o.amount)}. Use quando o Pix não foi pago.`, confirmLabel: 'Cancelar pedido', danger: true }))) return
    try {
      await storeCancelOrder(o.id)
      toast.success('Pedido cancelado')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const denyRefund = async (o: StoreOrder) => {
    if (!(await askConfirm({ title: 'Recusar reembolso', message: `${o.buyer.name}, ${formatCents(o.amount)}. A compra continua valendo e o aluno vê que o reembolso foi recusado.${o.refundRequest?.reason ? ` Motivo dele: ${o.refundRequest.reason}` : ''}`, confirmLabel: 'Recusar reembolso', danger: true }))) return
    try {
      await storeDenyRefund(o.id)
      toast.success('Reembolso recusado')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const refund = async (o: StoreOrder) => {
    const ok = await askConfirm({
      title: 'Reembolsar pedido',
      message: `${o.buyer.name}, ${formatCents(o.amount)}. ${o.mpPaymentId ? 'O dinheiro volta pelo Mercado Pago e o acesso aos produtos é removido.' : 'O acesso aos produtos é removido. Como foi Pix direto na conta, devolva o dinheiro pelo app do banco.'}`,
      confirmLabel: 'Reembolsar',
      danger: true,
    })
    if (!ok) return
    setRefunding(o.id)
    try {
      await storeRefundOrder(o.id)
      toast.success('Pedido reembolsado e acesso removido')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setRefunding(null)
    }
  }

  const { profile } = useAuth()
  const canDelete = profile?.role === 'admin'
  const deleteOrder = async (o: StoreOrder) => {
    const paid = o.status === 'approved' && !o.test && o.amount > 0
    const ok = await askConfirm({
      title: 'Excluir pedido',
      message: `${o.buyer.name}, ${formatCents(o.amount)}. O pedido some das Vendas junto com o acesso que ele liberou e os avisos da venda. Não tem volta.${paid ? ' O dinheiro não é devolvido: se foi pago de verdade, use Reembolsar antes.' : ''}`,
      confirmLabel: 'Excluir pedido',
      danger: true,
    })
    if (!ok) return
    setRefunding(o.id)
    try {
      await storeDeleteOrder(o.id)
      toast.success('Pedido excluído')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setRefunding(null)
    }
  }

  return { busy: refunding, confirmPayment, cancelOrder, refund, denyRefund, copyAccess, deleteOrder, canDelete }
}

type OrderKind = '' | 'with_bump' | 'no_bump'

const mainItems = (o: StoreOrder) => o.items.filter((i) => !i.bump)
const bumpItems = (o: StoreOrder) => o.items.filter((i) => i.bump)


/** Vendas por produto, separando quando ele foi o produto principal e quando entrou como order bump. */
function ProductBreakdown({ paid, products }: { paid: StoreOrder[]; products: StoreProduct[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, { id: string; name: string; mainCount: number; mainRevenue: number; bumpCount: number; bumpRevenue: number }>()
    const get = (id: string, name: string) => {
      if (!map.has(id)) map.set(id, { id, name: products.find((p) => p.id === id)?.name ?? name, mainCount: 0, mainRevenue: 0, bumpCount: 0, bumpRevenue: 0 })
      return map.get(id)!
    }
    for (const o of paid) {
      const bumps = bumpItems(o)
      // Valor do produto principal = total do pedido menos os bumps (já com cupom e desconto aplicados).
      const bumpTotal = bumps.reduce((s, i) => s + i.price, 0)
      for (const i of mainItems(o)) {
        const r = get(i.productId, i.name)
        r.mainCount++
        r.mainRevenue += Math.max(0, o.amount - bumpTotal)
      }
      for (const i of bumps) {
        const r = get(i.productId, i.name)
        r.bumpCount++
        r.bumpRevenue += i.price
      }
    }
    return [...map.values()].sort((a, b) => b.mainRevenue + b.bumpRevenue - (a.mainRevenue + a.bumpRevenue))
  }, [paid, products])

  if (!rows.length) return <EmptyState title="Nenhuma venda aprovada" description="Troque o período ou os filtros para ver as vendas por produto." />

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <caption className="sr-only">Vendas por produto, como produto principal e como order bump</caption>
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-3">Produto</th>
            <th scope="col" className="px-4 py-3 text-right">Vendido como principal</th>
            <th scope="col" className="px-4 py-3 text-right">Vendido como order bump</th>
            <th scope="col" className="px-4 py-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="px-4 py-3 text-left font-medium text-slate-800">{r.name}</th>
              <td className="px-4 py-3 text-right tabular-nums">
                {r.mainCount ? (
                  <>
                    <span className="font-semibold text-slate-800">{formatCents(r.mainRevenue)}</span>
                    <span className="block text-xs text-slate-400">{r.mainCount} {r.mainCount === 1 ? 'venda' : 'vendas'}</span>
                  </>
                ) : (
                  <span className="text-slate-300">-</span>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {r.bumpCount ? (
                  <>
                    <span className="font-semibold text-violet-700">{formatCents(r.bumpRevenue)}</span>
                    <span className="block text-xs text-slate-400">{r.bumpCount} {r.bumpCount === 1 ? 'venda' : 'vendas'}</span>
                  </>
                ) : (
                  <span className="text-slate-300">-</span>
                )}
              </td>
              <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">{formatCents(r.mainRevenue + r.bumpRevenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Vendas: resumo do período, vendas por produto (principal e order bump) e lista de pedidos. */
export function StoreOrdersTable({ orders, products }: { orders: StoreOrder[]; products: StoreProduct[] }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'' | StoreOrderStatus>('')
  const [productId, setProductId] = useState('')
  const [kind, setKind] = useState<OrderKind>('')
  const [period, setPeriod] = useState<DateRangeValue>({ preset: '30d', from: '', to: '' })
  const [view, setView] = useState<'orders' | 'products'>('orders')
  const [openId, setOpenId] = useState<string | null>(null)
  const { busy: refunding, confirmPayment, cancelOrder, refund, denyRefund, copyAccess, deleteOrder, canDelete } = useOrderActions()
  useReconcilePending(orders)
  const [emitting, setEmitting] = useState<string | null>(null)

  // Notas em processamento: confere na Focus ao abrir a tela (o webhook e o cron também fazem isso).
  const syncedOnce = useRef(false)
  useEffect(() => {
    if (syncedOnce.current) return
    const processing = orders.filter((o) => o.invoice?.status === 'processando').map((o) => o.id)
    if (!processing.length) return
    syncedOnce.current = true
    storeSyncInvoices(processing).catch(() => {})
  }, [orders])

  const emitInvoice = async (o: StoreOrder) => {
    setEmitting(o.id)
    try {
      await storeEmitInvoice(o.id)
      toast.success('Nota enviada para emissão')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setEmitting(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const range = resolveRange(period)
    return orders.filter(
      (o) =>
        inRange(o.createdAt, range) &&
        (!status || o.status === status) &&
        (!productId || o.productIds?.includes(productId)) &&
        (!kind || (kind === 'with_bump') === bumpItems(o).length > 0) &&
        (!q || o.buyer.name.toLowerCase().includes(q) || o.buyer.email.includes(q) || o.id.toLowerCase().includes(q))
    )
  }, [orders, search, status, productId, kind, period])

  const paid = filtered.filter((o) => o.status === 'approved' && !o.test)
  const revenue = paid.reduce((s, o) => s + o.amount, 0)
  const bumpRevenue = paid.reduce((s, o) => s + bumpItems(o).reduce((a, i) => a + i.price, 0), 0)
  const withBump = paid.filter((o) => bumpItems(o).length > 0).length
  const waiting = filtered.filter((o) => o.status === 'pending' && !o.test).length

  const exportCsv = () => {
    const blob = new Blob([`﻿${toCsv(filtered)}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `vendas-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const segBtn = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${active ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon={Wallet} accent="green" label="Faturamento aprovado" value={formatCents(revenue)} subtitle={`${paid.length} ${paid.length === 1 ? 'venda' : 'vendas'}`} />
        <MetricCard icon={Package} accent="blue" label="Produto principal" value={formatCents(revenue - bumpRevenue)} subtitle="Sem contar os order bumps" />
        <MetricCard
          icon={Layers}
          accent="violet"
          label="Order bumps"
          value={formatCents(bumpRevenue)}
          subtitle={paid.length ? `${withBump} de ${paid.length} pedidos levaram (${Math.round((withBump / paid.length) * 100)}%)` : undefined}
        />
        <MetricCard icon={Clock} accent="amber" label="Aguardando pagamento" value={String(waiting)} subtitle={waiting ? 'Pix gerado e ainda não pago' : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
        <div className="min-w-[200px] flex-1">
          <Input aria-label="Buscar por nome, e-mail ou pedido" placeholder="Buscar por nome, e-mail ou pedido" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select aria-label="Produto" value={productId} onChange={(e) => setProductId(e.target.value)} className="!w-48">
          <option value="">Todos os produtos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as '' | StoreOrderStatus)} className="!w-40">
          <option value="">Todos os status</option>
          {Object.entries(STORE_ORDER_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <Select aria-label="Order bump" value={kind} onChange={(e) => setKind(e.target.value as OrderKind)} className="!w-auto">
          <option value="">Com e sem bump</option>
          <option value="with_bump">Só com order bump</option>
          <option value="no_bump">Só sem order bump</option>
        </Select>
        <DateRangeFilter value={period} onChange={setPeriod} />
        <Button variant="secondary" icon={<Download size={15} />} onClick={exportCsv} disabled={!filtered.length}>
          CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Como ver as vendas" className="flex gap-1 rounded-xl bg-slate-100 p-1">
          <button type="button" role="radio" aria-checked={view === 'orders'} onClick={() => setView('orders')} className={segBtn(view === 'orders')}>
            Pedidos
          </button>
          <button type="button" role="radio" aria-checked={view === 'products'} onClick={() => setView('products')} className={segBtn(view === 'products')}>
            Por produto
          </button>
        </div>
        <p className="text-sm text-slate-500" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? 'pedido' : 'pedidos'} no filtro
        </p>
      </div>

      {view === 'products' ? (
        <ProductBreakdown paid={paid} products={products} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nenhum pedido"
          description={orders.length ? 'Nenhum pedido com esses filtros. Troque o período ou limpe a busca.' : 'Quando alguém comprar pelo link do checkout, o pedido aparece aqui na hora.'}
        />
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {filtered.map((o) => {
            const open = openId === o.id
            const main = mainItems(o)
            const bumps = bumpItems(o)
            const needsPix = o.method === 'pix_manual' && (o.status === 'pending' || (o.status === 'refused' && !!o.expiredAt))
            const refundAsked = o.status === 'approved' && !!o.refundRequest && !o.refundRequest.deniedAt
            const capiFail = o.status === 'approved' && !!o.capi?.purchase && !o.capi.purchase.ok
            return (
              <li key={o.id} className={open ? 'bg-slate-50/70' : ''}>
                <div className="grid grid-cols-1 items-center gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_7rem_minmax(0,0.9fr)_auto]">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">{o.buyer.name}</p>
                    <p className="truncate text-xs text-slate-500">{o.buyer.email}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-700">{main.map((i) => i.name).join(' + ') || o.productName}</p>
                    {bumps.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {bumps.map((i) => (
                          <span key={i.productId} className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                            + {i.name}
                            <span className="sr-only"> (order bump)</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="whitespace-nowrap md:text-right">
                    <p className="font-semibold tabular-nums text-slate-800">{formatCents(o.amount)}</p>
                    <p className="text-xs text-slate-400">
                      {STORE_METHOD_LABEL[o.method]}
                      {o.installments && o.installments > 1 ? ` em ${o.installments}x` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <OrderStatusBadge status={o.status} manual={o.method === 'pix_manual'} expired={!!o.expiredAt} />
                    {refundAsked && <Badge className="bg-red-50 text-red-600">Reembolso pedido</Badge>}
                    {o.test && <Badge className="bg-amber-50 text-amber-700">teste</Badge>}
                    {capiFail && <span className="h-2 w-2 rounded-full bg-amber-400" title="Não marcou no Meta" aria-label="Não marcou no Meta" />}
                  </div>
                  <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                    <span className="mr-1 text-xs text-slate-400">{new Date(o.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    {needsPix && (
                      <Button size="sm" icon={<CheckCircle2 size={14} />} loading={refunding === o.id} onClick={() => confirmPayment(o)} aria-label={`Confirmar pagamento de ${o.buyer.name}, ${formatCents(o.amount)}`}>
                        Confirmar
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : o.id)}
                      aria-expanded={open}
                      aria-label={`${open ? 'Fechar' : 'Ver'} detalhes do pedido de ${o.buyer.name}`}
                      className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    >
                      Detalhes <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="grid gap-4 border-t border-slate-100 px-4 py-4 text-sm md:grid-cols-3">
                    <dl className="space-y-1">
                      <dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Comprador</dt>
                      <dd className="text-slate-700">{o.buyer.name}</dd>
                      <dd className="text-slate-500">{o.buyer.email}</dd>
                      {o.buyer.phone && <dd className="text-slate-500">{o.buyer.phone}</dd>}
                      {o.buyer.cpf && <dd className="text-slate-500">CPF {o.buyer.cpf}</dd>}
                      <dd className="text-xs text-slate-400">Pedido {o.id.replace('ord_', '')}</dd>
                    </dl>
                    <dl className="space-y-1">
                      <dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Compra</dt>
                      {o.items.map((i) => (
                        <dd key={i.productId} className="flex justify-between gap-3 text-slate-700">
                          <span>
                            {i.name}
                            {i.bump && <span className="text-violet-600"> (order bump)</span>}
                          </span>
                          <span className="tabular-nums text-slate-500">{formatCents(i.price)}</span>
                        </dd>
                      ))}
                      {o.couponCode && <dd className="text-xs text-slate-500">Cupom {o.couponCode} ({o.couponPercent}%)</dd>}
                      {o.pixDiscountAmount ? <dd className="text-xs text-slate-500">Desconto Pix {o.pixDiscountPercent}% (-{formatCents(o.pixDiscountAmount)})</dd> : null}
                      {o.pixAccountLabel && <dd className="text-xs text-slate-500">Conta: {o.pixAccountLabel}</dd>}
                      {o.utm?.utm_source && (
                        <dd className="text-xs text-slate-500">
                          Origem: {o.utm.utm_source}
                          {o.utm.utm_campaign ? `, ${o.utm.utm_campaign}` : ''}
                          {o.utm.utm_content ? `, ${o.utm.utm_content}` : ''}
                        </dd>
                      )}
                    </dl>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Situação</p>
                      {o.confirmedBy && o.status === 'approved' && <p className="text-xs text-slate-500">Confirmado por {o.confirmedBy}</p>}
                      {o.status === 'refunded' && o.refundedBy && <p className="text-xs text-slate-500">Reembolsado por {o.refundedBy}</p>}
                      {o.refundRequest && o.status === 'approved' && (
                        <p className="text-xs text-slate-500">
                          {o.refundRequest.deniedAt ? `Reembolso recusado${o.refundRequest.deniedBy ? ` por ${o.refundRequest.deniedBy}` : ''}` : 'Pediu reembolso'} em{' '}
                          {new Date(o.refundRequest.requestedAt).toLocaleDateString('pt-BR')}
                          {o.refundRequest.reason ? `: ${o.refundRequest.reason}` : ''}
                        </p>
                      )}
                      {capiFail && <p className="text-xs text-amber-700">Não marcou no Meta: {o.capi?.purchase?.error || 'o Meta recusou'}. Tenta de novo todo dia.</p>}
                      <div>
                        <p className="mb-1 text-xs text-slate-500">Nota fiscal</p>
                        <InvoiceCell order={o} busy={emitting === o.id} onEmit={() => emitInvoice(o)} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-3 md:col-span-3">
                      {needsPix && o.status === 'pending' && (
                        <Button size="sm" variant="secondary" icon={<Ban size={14} />} onClick={() => cancelOrder(o)} aria-label={`Cancelar pedido de ${o.buyer.name}`}>
                          Cancelar pedido
                        </Button>
                      )}
                      {o.accessUrl && o.status === 'approved' && (
                        <Button size="sm" variant="secondary" icon={<Copy size={14} />} onClick={() => copyAccess(o)} aria-label={`Copiar link de acesso de ${o.buyer.name}`}>
                          Copiar link de acesso
                        </Button>
                      )}
                      {refundAsked && (
                        <Button size="sm" variant="secondary" icon={<Ban size={14} />} onClick={() => denyRefund(o)} aria-label={`Recusar reembolso de ${o.buyer.name}`}>
                          Recusar reembolso
                        </Button>
                      )}
                      {o.status === 'approved' && (
                        <Button size="sm" variant="secondary" icon={<RotateCcw size={14} />} loading={refunding === o.id} onClick={() => refund(o)} aria-label={`Reembolsar pedido de ${o.buyer.name}`}>
                          Reembolsar
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} loading={refunding === o.id} onClick={() => deleteOrder(o)} aria-label={`Excluir pedido de ${o.buyer.name}`} className="ml-auto">
                          Excluir
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
