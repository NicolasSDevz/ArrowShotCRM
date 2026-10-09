import { useEffect, useState } from 'react'
import { memberOrders, memberRefundRequest, type MemberOrder } from '../../../services/storeApi'
import { formatCents } from '../../../types/store'

const STATUS: Record<MemberOrder['status'], string> = {
  approved: 'Aprovada',
  pending: 'Aguardando pagamento',
  refused: 'Não aprovada',
  refunded: 'Reembolsada',
}

/** "Minhas compras" no perfil do aluno, com o pedido de reembolso dentro da garantia. */
export function MyPurchases() {
  const [orders, setOrders] = useState<MemberOrder[] | null>(null)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  const load = () =>
    memberOrders()
      .then((r) => setOrders(r.orders))
      .catch((err: Error) => setError(err.message))

  useEffect(() => {
    load()
  }, [])

  const send = async (orderId: string) => {
    setBusy(true)
    setStatus('')
    try {
      await memberRefundRequest(orderId, reason)
      setStatus('Pedido de reembolso enviado. A equipe vai analisar e devolver o valor pelo mesmo meio de pagamento.')
      setOpenId(null)
      setReason('')
      await load()
    } catch (err) {
      setStatus((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="purchases-title" className="mt-6 rounded-xl border border-[var(--m-border)] bg-[var(--m-card)] p-5">
      <h2 id="purchases-title" className="font-semibold">Minhas compras</h2>
      {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
      {!orders && !error && <p className="mt-2 text-sm text-[var(--m-muted)]">Carregando...</p>}
      {orders?.length === 0 && <p className="mt-2 text-sm text-[var(--m-muted)]">Nenhuma compra encontrada neste e-mail.</p>}
      <ul className="mt-3 space-y-3">
        {orders?.map((o) => (
          <li key={o.orderId} className="rounded-lg border border-[var(--m-border2)] p-3 text-sm">
            <p className="font-medium">{o.items.join(' + ')}</p>
            <p className="text-[var(--m-muted)]">
              {formatCents(o.amount)}, {STATUS[o.status]}
              {o.approvedAt ? `, em ${new Date(o.approvedAt).toLocaleDateString('pt-BR')}` : ''}
            </p>
            {o.status === 'approved' && o.guaranteeUntil && !o.refundRequestedAt && (
              <p className="text-xs text-[var(--m-faint)]">
                {o.canRequestRefund ? `Garantia até ${new Date(o.guaranteeUntil).toLocaleDateString('pt-BR')}` : 'Prazo de garantia encerrado'}
              </p>
            )}
            {o.refundRequestedAt && o.status === 'approved' && (
              <p className="mt-1 text-xs text-amber-400">Reembolso pedido em {new Date(o.refundRequestedAt).toLocaleDateString('pt-BR')}. Aguardando a equipe.</p>
            )}
            {o.canRequestRefund && openId !== o.orderId && (
              <button onClick={() => setOpenId(o.orderId)} className="mt-2 text-xs text-[var(--m-muted)] underline-offset-2 hover:text-[var(--m-text)] hover:underline">
                Pedir reembolso
              </button>
            )}
            {openId === o.orderId && (
              <div className="mt-2 space-y-2">
                <label className="block text-xs text-[var(--m-muted)]">
                  Conte o motivo (opcional)
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1 w-full resize-none rounded-lg border border-[var(--m-border)] bg-[var(--m-soft)] p-2 text-sm text-[var(--m-text)] outline-none" />
                </label>
                <div className="flex gap-2">
                  <button disabled={busy} onClick={() => send(o.orderId)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60">
                    {busy ? 'Enviando...' : 'Confirmar pedido de reembolso'}
                  </button>
                  <button onClick={() => setOpenId(null)} className="rounded-lg px-3 py-1.5 text-xs text-[var(--m-muted)] hover:bg-[var(--m-soft)]">Cancelar</button>
                </div>
              </div>
            )}
            {!o.canRequestRefund && o.status === 'approved' && !o.refundRequestedAt && o.supportEmail && (
              <p className="mt-1 text-xs text-[var(--m-faint)]">Dúvidas: {o.supportEmail}</p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-[var(--m-text2)]" aria-live="polite">{status}</p>
    </section>
  )
}
