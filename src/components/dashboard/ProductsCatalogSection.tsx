import { useState } from 'react'
import toast from 'react-hot-toast'
import { Package, Plus, Pencil, Trash2, Check, EyeOff } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useProducts } from '../../hooks/useProducts'
import { deleteProduct } from '../../services/productService'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { ProductFormModal } from './ProductFormModal'
import { productModules, PRODUCT_MODULE_SHORT } from '../../utils/productModules'
import { applyDiscount, basePrice, discountLabel, formatBRL as brl, lowestPrice } from '../../utils/pricing'
import type { Product } from '../../types'

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Mostra (só pra quem edita) o que o serviço liga no CRM — e avisa quando
 *  ainda não foi configurado, pra ninguém descobrir só na hora de cadastrar
 *  um cliente. */
function ProductModuleBadges({ product }: { product: Product }) {
  const { keys, inferred } = productModules(product)
  if (keys.length === 0) {
    return <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">Não liga nenhuma área do CRM — clique em editar e marque o que ele ativa.</p>
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-slate-400">Liga no CRM:</span>
      {keys.map((k) => (
        <span key={k} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
          {PRODUCT_MODULE_SHORT[k]}
        </span>
      ))}
      {inferred && <span className="text-[11px] text-amber-600">(sugerido pelo nome — abra e salve pra confirmar)</span>}
    </div>
  )
}

/** Simulador rápido de preço no cartão: escolhe o nível e o desconto e vê o
 *  valor final — pra qualquer interno montar uma proposta sem calculadora. */
function PriceSimulator({ product }: { product: Product }) {
  const [tierId, setTierId] = useState(product.tiers?.[0]?.id ?? '')
  const [discountId, setDiscountId] = useState('')
  const base = basePrice(product, tierId || null)
  const discount = product.discounts?.find((d) => d.id === discountId)
  const final = base != null ? applyDiscount(base, discount) : undefined
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Simular preço</p>
      <div className="flex flex-wrap gap-2">
        {(product.tiers?.length ?? 0) > 0 && (
          <select value={tierId} onChange={(e) => setTierId(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs">
            {product.tiers!.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.price != null ? ` — ${brl(t.price)}` : ''}
              </option>
            ))}
          </select>
        )}
        {(product.discounts?.length ?? 0) > 0 && (
          <select value={discountId} onChange={(e) => setDiscountId(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs">
            <option value="">Sem desconto</option>
            {product.discounts!.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} (−{discountLabel(d)})
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="text-sm text-slate-600">
        {final == null ? (
          'Sem preço definido.'
        ) : (
          <>
            {discount && base != null && <span className="mr-1.5 text-slate-400 line-through">{brl(base)}</span>}
            <span className="text-base font-extrabold text-brand-600">{brl(final)}</span>
          </>
        )}
      </p>
    </div>
  )
}

function ProductCard({ product, canEdit, onEdit, onDelete }: { product: Product; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 ${!product.active ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold text-slate-900">
            {product.name}
            {!product.active && (
              <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                <EyeOff size={10} /> Inativo
              </span>
            )}
          </p>
          {product.price == null && lowestPrice(product) != null && (
            <p className="mt-0.5 text-lg font-extrabold text-brand-600">
              <span className="text-sm font-medium text-slate-400">a partir de </span>
              {formatBRL(lowestPrice(product)!)}
            </p>
          )}
          {(product.price != null || product.priceNote) && (
            <p className="mt-0.5 text-lg font-extrabold text-brand-600">
              {product.price != null && formatBRL(product.price)}
              {product.price != null && product.priceNote && ' '}
              {product.priceNote && <span className="text-sm font-medium text-slate-400">{product.priceNote}</span>}
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex shrink-0 gap-1">
            <button onClick={onEdit} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Editar">
              <Pencil size={14} />
            </button>
            <button onClick={onDelete} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500" aria-label="Excluir">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {product.description && <p className="text-sm text-slate-600">{product.description}</p>}

      {(product.tiers?.length ?? 0) > 0 && (
        <ul className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-100">
          {product.tiers!.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                {t.description && <p className="text-xs text-slate-400">{t.description}</p>}
              </div>
              <p className="shrink-0 text-sm font-bold text-slate-700">{t.price != null ? formatBRL(t.price) : '—'}</p>
            </li>
          ))}
        </ul>
      )}

      {(product.discounts?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-400">Descontos:</span>
          {product.discounts!.map((d) => (
            <span key={d.id} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              {d.name} · −{discountLabel(d)}
            </span>
          ))}
        </div>
      )}

      {((product.tiers?.length ?? 0) > 0 || (product.discounts?.length ?? 0) > 0) && <PriceSimulator product={product} />}

      {canEdit && (
        <ProductModuleBadges product={product} />
      )}

      {product.bonuses.length > 0 && (
        <ul className="flex flex-col gap-1.5 border-t border-slate-50 pt-3">
          {product.bonuses.map((b, i) => (
            <li key={i} className="flex items-start gap-1.5 text-sm text-slate-600">
              <Check size={14} className="mt-0.5 shrink-0 text-emerald-500" />
              {b}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Catálogo de Produtos e Serviços — tabela de preços da agência, mostrada no
 *  Dashboard. Qualquer interno vê os itens ativos; só o Admin (Bruno) vê
 *  também os inativos e tem os botões de adicionar/editar/excluir — a
 *  mesma regra que o firestore.rules aplica na escrita (ver products/{id}). */
export function ProductsCatalogSection() {
  const { profile } = useAuth()
  const { data: products, loading } = useProducts()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)

  const canEdit = profile?.role === 'admin'
  const visible = canEdit ? products : products.filter((p) => p.active)

  const handleDelete = async (product: Product) => {
    if (!confirm(`Excluir "${product.name}" do catálogo? Essa ação não pode ser desfeita.`)) return
    try {
      await deleteProduct(product.id)
      toast.success('Produto removido')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao excluir produto')
    }
  }

  if (loading) return null
  if (visible.length === 0 && !canEdit) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-[17px] font-bold text-slate-900">
            <Package size={17} className="text-brand-600" /> Produtos e Serviços
          </h2>
          <p className="text-xs text-slate-400">
            {canEdit ? 'Tabela de preços da agência — só você edita.' : 'Tabela de preços da agência.'}
          </p>
        </div>
        {canEdit && (
          <Button size="sm" icon={<Plus size={13} />} onClick={() => setCreating(true)}>
            Novo produto
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Package size={24} />}
          title="Nenhum produto cadastrado ainda"
          description='Clique em "Novo produto" para montar a tabela de preços.'
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <ProductCard key={p.id} product={p} canEdit={canEdit} onEdit={() => setEditing(p)} onDelete={() => handleDelete(p)} />
          ))}
        </div>
      )}

      {canEdit && (
        <>
          <ProductFormModal open={creating} onClose={() => setCreating(false)} nextOrder={products.length} />
          <ProductFormModal open={!!editing} onClose={() => setEditing(null)} product={editing} nextOrder={products.length} />
        </>
      )}
    </div>
  )
}
