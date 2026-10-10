import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Ban, CheckCircle2, Copy, Download, FileText, RotateCcw } from 'lucide-react'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Input, Select } from '../../ui/Field'
import { EmptyState } from '../../ui/EmptyState'
import { storeAccessLink, storeCancelOrder, storeConfirmOrder, storeEmitInvoice, storeReconcileOrders, storeRefundOrder, storeSyncInvoices } from '../../../services/storeApi'
import { askConfirm } from '../../../utils/confirmDialog'
import { formatCents, STORE_METHOD_LABEL, STORE_ORDER_STATUS_LABEL, type StoreOrder, type StoreOrderStatus, type StoreProduct } from '../../../types/store'

const STATUS_CLS: Record<StoreOrderStatus, string> = {
  approved: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  refused: 'bg-red-50 text-red-600',
  refunded: 'bg-slate-100 text-slate-600',
}

export function OrderStatusBadge({ status, manual, expired }: { status: StoreOrderStatus; manual?: boolean; expired?: boolean }) {
  return <Badge className={STATUS_CLS[status]}>{status === 'pending' && manual ? 'Aguardando confirmação' : expired && status === 'refused' ? 'Expirado' : STORE_ORDER_STATUS_LABEL[status]}</Badge>
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
      const url = o.memberUid ? (await storeAccessLink(o.memberUid)).accessUrl : o.accessUrl!
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

  return { busy: refunding, confirmPayment, cancelOrder, refund, copyAccess }
}

/** Lista de pedidos com filtro, exportação CSV, link de acesso e reembolso. */
export function StoreOrdersTable({ orders, products }: { orders: StoreOrder[]; products: StoreProduct[] }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'' | StoreOrderStatus>('')
  const [productId, setProductId] = useState('')
  const { busy: refunding, confirmPayment, cancelOrder, refund, copyAccess } = useOrderActions()
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
    return orders.filter(
      (o) =>
        (!status || o.status === status) &&
        (!productId || o.productIds?.includes(productId)) &&
        (!q || o.buyer.name.toLowerCase().includes(q) || o.buyer.email.includes(q) || o.id.toLowerCase().includes(q))
    )
  }, [orders, search, status, productId])

  const exportCsv = () => {
    const blob = new Blob([`﻿${toCsv(filtered)}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `vendas-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <Input aria-label="Buscar por nome, e-mail ou pedido" placeholder="Buscar por nome, e-mail ou pedido" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as '' | StoreOrderStatus)} className="!w-48">
          <option value="">Todos os status</option>
          {Object.entries(STORE_ORDER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select aria-label="Produto" value={productId} onChange={(e) => setProductId(e.target.value)} className="!w-56">
          <option value="">Todos os produtos</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Button variant="secondary" icon={<Download size={15} />} onClick={exportCsv} disabled={!filtered.length}>Exportar CSV</Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Nenhum pedido" description="Quando alguém comprar pelo link do checkout, o pedido aparece aqui na hora." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">Pedidos da loja</caption>
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Cliente</th>
                <th scope="col" className="px-4 py-3">Produtos</th>
                <th scope="col" className="px-4 py-3">Valor</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Nota fiscal</th>
                <th scope="col" className="px-4 py-3">Data</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((o) => (
                <tr key={o.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{o.buyer.name}</p>
                    <p className="text-xs text-slate-500">{o.buyer.email}</p>
                    {o.buyer.phone && <p className="text-xs text-slate-400">{o.buyer.phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {o.items.map((i) => (
                      <p key={i.productId}>{i.name}{i.bump ? ' (order bump)' : ''}</p>
                    ))}
                    {o.couponCode && <p className="text-xs text-slate-400">Cupom {o.couponCode} ({o.couponPercent}%)</p>}
                    {o.pixDiscountAmount ? <p className="text-xs text-slate-400">Desconto Pix {o.pixDiscountPercent}% (-{formatCents(o.pixDiscountAmount)})</p> : null}
                    {o.utm?.utm_source && <p className="text-xs text-slate-400">Origem: {o.utm.utm_source}{o.utm.utm_campaign ? `, ${o.utm.utm_campaign}` : ''}</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {formatCents(o.amount)}
                    <p className="text-xs text-slate-400">{STORE_METHOD_LABEL[o.method]}{o.installments && o.installments > 1 ? ` em ${o.installments}x` : ''}</p>
                    {o.pixAccountLabel && <p className="text-xs text-slate-400">Conta: {o.pixAccountLabel}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={o.status} manual={o.method === 'pix_manual'} expired={!!o.expiredAt} />
                    {o.status === 'refunded' && o.refundedBy && <p className="mt-1 text-xs text-slate-400">Por {o.refundedBy}</p>}
                    {o.status === 'approved' && o.capi?.purchase && !o.capi.purchase.ok && (
                      <div className="mt-1">
                        <Badge className="bg-amber-50 text-amber-700">Não marcou no Meta</Badge>
                        <p className="mt-0.5 max-w-[220px] text-xs text-slate-500">{o.capi.purchase.error || 'O Meta recusou'}. Tenta de novo todo dia.</p>
                      </div>
                    )}
                    {o.refundRequest && o.status === 'approved' && (
                      <div className="mt-1">
                        <Badge className="bg-red-50 text-red-600">Reembolso pedido</Badge>
                        <p className="mt-0.5 max-w-[200px] text-xs text-slate-500">
                          {new Date(o.refundRequest.requestedAt).toLocaleDateString('pt-BR')}{o.refundRequest.reason ? `: ${o.refundRequest.reason}` : ''}
                        </p>
                      </div>
                    )}
                    {o.confirmedBy && o.status === 'approved' && <p className="mt-1 text-xs text-slate-400">Confirmado por {o.confirmedBy}</p>}
                    {o.test && <Badge className="ml-1 bg-amber-50 text-amber-700">teste</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <InvoiceCell order={o} busy={emitting === o.id} onEmit={() => emitInvoice(o)} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(o.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {o.method === 'pix_manual' && (o.status === 'pending' || (o.status === 'refused' && o.expiredAt)) && (
                      <>
                        <Button size="sm" icon={<CheckCircle2 size={14} />} loading={refunding === o.id} onClick={() => confirmPayment(o)} aria-label={`Confirmar pagamento de ${o.buyer.name}, ${formatCents(o.amount)}`}>
                          Confirmar pagamento
                        </Button>
                        {o.status === 'pending' && (
                          <Button size="sm" variant="ghost" icon={<Ban size={14} />} onClick={() => cancelOrder(o)} aria-label={`Cancelar pedido de ${o.buyer.name}`}>
                            Cancelar
                          </Button>
                        )}
                      </>
                    )}
                    {o.accessUrl && o.status === 'approved' && (
                      <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => copyAccess(o)} aria-label={`Copiar link de acesso de ${o.buyer.name}`}>
                        Acesso
                      </Button>
                    )}
                    {o.status === 'approved' && (
                      <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} loading={refunding === o.id} onClick={() => refund(o)} aria-label={`Reembolsar pedido de ${o.buyer.name}`}>
                        Reembolsar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
