import { useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { Button } from '../../ui/Button'
import { Field, Input, Select } from '../../ui/Field'
import { EmptyState } from '../../ui/EmptyState'
import { createStoreCoupon, deleteStoreCoupon, updateStoreCoupon } from '../../../services/storeService'
import { askConfirm } from '../../../utils/confirmDialog'
import type { StoreCoupon, StoreProduct } from '../../../types/store'

/** Cupons de desconto (% sobre o produto principal). */
export function StoreCouponsPanel({ coupons, products }: { coupons: StoreCoupon[]; products: StoreProduct[] }) {
  const { profile } = useAuth()
  const [code, setCode] = useState('')
  const [percent, setPercent] = useState('10')
  const [productId, setProductId] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    const pct = Number(percent)
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(code.trim())) return toast.error('Código com 3 a 30 letras ou números, sem espaço')
    if (!(pct > 0 && pct <= 100)) return toast.error('Desconto entre 1% e 100%')
    if (coupons.some((c) => c.code === code.trim().toUpperCase())) return toast.error('Já existe um cupom com esse código')
    setBusy(true)
    try {
      await createStoreCoupon(
        { code, percent: pct, productId: productId || null, active: true, maxUses: maxUses ? Number(maxUses) : null, uses: 0, expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null },
        profile.id
      )
      setCode('')
      setMaxUses('')
      setExpiresAt('')
      toast.success('Cupom criado')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const productName = (id?: string | null) => (id ? products.find((p) => p.id === id)?.name ?? 'Produto removido' : 'Todos os produtos')

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-[15px] font-semibold text-slate-800">Novo cupom</h2>
        <Field label="Código" required><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BLACK50" /></Field>
        <Field label="Desconto (%)" required><Input type="number" min={1} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} /></Field>
        <Field label="Vale para">
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Todos os produtos</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Limite de usos (vazio = sem limite)"><Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} /></Field>
        <Field label="Válido até (opcional)"><Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></Field>
        <Button type="submit" icon={<Plus size={15} />} loading={busy} className="w-full">Criar cupom</Button>
      </form>

      {coupons.length === 0 ? (
        <EmptyState title="Nenhum cupom" description="Cupons dão desconto em porcentagem sobre o produto principal do checkout." />
      ) : (
        <ul className="space-y-2">
          {coupons.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-base font-semibold text-slate-800">{c.code}</p>
                <p className="text-slate-500">
                  {c.percent}% de desconto, {productName(c.productId)}. Usado {c.uses ?? 0}{c.maxUses ? ` de ${c.maxUses}` : ''} vezes
                  {c.expiresAt ? `. Vale até ${new Date(c.expiresAt).toLocaleDateString('pt-BR')}` : ''}.
                </p>
              </div>
              <label className="flex items-center gap-2 text-slate-600">
                <input type="checkbox" checked={c.active} onChange={(e) => profile && updateStoreCoupon(c.id, { active: e.target.checked }, profile.id)} />
                {c.active ? 'Ativo' : 'Desativado'}
              </label>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 size={14} />}
                aria-label={`Excluir cupom ${c.code}`}
                onClick={async () => {
                  if (await askConfirm({ title: `Excluir o cupom ${c.code}?`, confirmLabel: 'Excluir', danger: true })) await deleteStoreCoupon(c.id)
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
