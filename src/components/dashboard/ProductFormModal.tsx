import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Field, Input, Textarea } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { createProduct, updateProduct } from '../../services/productService'
import type { Product } from '../../types'

const EMPTY = {
  name: '',
  price: '',
  priceNote: '',
  description: '',
  active: true,
}

/** Um bônus por linha, com id local só pra manter a key estável do input
 *  enquanto a pessoa digita — igual ao padrão de arrays da planilha de
 *  campanha (ver ClientCampaignPlanningPanel). Achatado pra string[] no save. */
type BonusRow = { id: string; text: string }

function toBonusRows(bonuses?: string[]): BonusRow[] {
  return (bonuses ?? []).map((text) => ({ id: crypto.randomUUID(), text }))
}

export function ProductFormModal({
  open,
  onClose,
  product,
  nextOrder,
}: {
  open: boolean
  onClose: () => void
  product?: Product | null
  nextOrder: number
}) {
  const { profile } = useAuth()
  const [form, setForm] = useState(EMPTY)
  const [bonuses, setBonuses] = useState<BonusRow[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name,
        price: product.price != null ? String(product.price) : '',
        priceNote: product.priceNote ?? '',
        description: product.description ?? '',
        active: product.active,
      })
      setBonuses(toBonusRows(product.bonuses))
    } else {
      setForm(EMPTY)
      setBonuses([])
    }
  }, [product, open])

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const addBonus = () => setBonuses((b) => [...b, { id: crypto.randomUUID(), text: '' }])
  const updateBonus = (id: string, text: string) => setBonuses((b) => b.map((r) => (r.id === id ? { ...r, text } : r)))
  const removeBonus = (id: string) => setBonuses((b) => b.filter((r) => r.id !== id))

  const handleSubmit = async () => {
    if (!form.name.trim() || !profile) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        price: form.price.trim() ? Number(form.price) : undefined,
        priceNote: form.priceNote.trim() || undefined,
        description: form.description.trim() || undefined,
        bonuses: bonuses.map((b) => b.text.trim()).filter(Boolean),
        active: form.active,
        order: product?.order ?? nextOrder,
      }
      if (product) {
        await updateProduct(product.id, payload, profile.id)
        toast.success('Produto atualizado')
      } else {
        await createProduct(payload, profile.id)
        toast.success('Produto adicionado ao catálogo')
      }
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar produto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={product ? 'Editar produto/serviço' : 'Novo produto/serviço'}>
      <div className="flex flex-col gap-3">
        <Field label="Nome do serviço" required>
          <Input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex: Gestão de Tráfego Pago" />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Preço (R$)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
              placeholder="0,00"
            />
          </Field>
          <Field label="Observação do preço">
            <Input
              value={form.priceNote}
              onChange={(e) => set('priceNote', e.target.value)}
              placeholder='Ex: "/mês", "a partir de", "sob consulta"'
            />
          </Field>
        </div>

        <Field label="Descrição">
          <Textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-slate-500">Bônus inclusos</span>
          <div className="flex flex-col gap-2">
            {bonuses.map((b) => (
              <div key={b.id} className="flex items-center gap-1.5">
                <Input value={b.text} onChange={(e) => updateBonus(b.id, e.target.value)} placeholder="Ex: Relatório mensal grátis" />
                <button
                  type="button"
                  onClick={() => removeBonus(b.id)}
                  className="shrink-0 rounded-lg p-2 text-slate-300 hover:bg-red-50 hover:text-red-500"
                  aria-label="Remover bônus"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <Button variant="secondary" size="sm" icon={<Plus size={13} />} onClick={addBonus} className="self-start">
              Adicionar bônus
            </Button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => set('active', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
          />
          Ativo no catálogo (visível pra equipe)
        </label>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!form.name.trim()}>
            {product ? 'Salvar' : 'Adicionar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
