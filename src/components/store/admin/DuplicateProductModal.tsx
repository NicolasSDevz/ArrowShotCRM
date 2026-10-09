import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../../../context/AuthContext'
import { duplicateStoreProduct } from '../../../services/storeService'
import { Modal } from '../../ui/Modal'
import { Field, Input } from '../../ui/Field'
import { Button } from '../../ui/Button'
import type { StoreProduct } from '../../../types/store'

/** Duplica um produto já configurado para criar outro sem refazer tudo. */
export function DuplicateProductModal({ product, onClose }: { product: StoreProduct | null; onClose: () => void }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [withContent, setWithContent] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!product) return null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    const finalName = name.trim() || `${product.name} (cópia)`
    setBusy(true)
    try {
      const id = await duplicateStoreProduct(product, finalName, withContent, profile.id)
      toast.success('Produto duplicado. Ajuste o que muda e coloque No ar.')
      setName('')
      setWithContent(false)
      onClose()
      navigate(`/loja/produtos/${id}`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Duplicar ${product.name}`}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-500">
          A cópia já vem com preço, tela do checkout, order bumps, desconto no Pix, banner, cores e área de membros iguais. Ela nasce como rascunho e com um link
          próprio, para você trocar só o que muda.
        </p>
        <Field label="Nome do novo produto"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${product.name} (cópia)`} autoFocus /></Field>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={withContent} onChange={(e) => setWithContent(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>
            Copiar também os módulos e as aulas
            <span className="block text-xs text-slate-400">Deixe desmarcado se o conteúdo do novo produto vai ser outro.</span>
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}>Duplicar</Button>
        </div>
      </form>
    </Modal>
  )
}
