import { useMemo, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { Link2, Trash2, UserPlus, XCircle } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Field, Input, Select } from '../../ui/Field'
import { Modal } from '../../ui/Modal'
import { EmptyState } from '../../ui/EmptyState'
import { Badge } from '../../ui/Badge'
import { storeAccessLink, storeDeleteMember, storeGrantAccess, storeRevokeAccess } from '../../../services/storeApi'
import { askConfirm } from '../../../utils/confirmDialog'
import { copyText } from './StoreOrdersTable'
import type { StoreEnrollment, StoreMember, StoreProduct, StoreProgress } from '../../../types/store'

/** Alunos: quem tem acesso a quê, progresso, link de acesso e liberação manual. */
export function StoreMembersTable({
  members,
  enrollments,
  progress,
  products,
  lessonCounts,
}: {
  members: StoreMember[]
  enrollments: StoreEnrollment[]
  progress: StoreProgress[]
  products: StoreProduct[]
  /** total de aulas por produto (pra calcular %). */
  lessonCounts: Record<string, number>
}) {
  const [search, setSearch] = useState('')
  const [productId, setProductId] = useState('')
  const [grantOpen, setGrantOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? 'Produto removido'

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return members
      .map((m) => ({ member: m, access: enrollments.filter((e) => e.uid === m.id && e.active) }))
      .filter((r) => (!productId || r.access.some((a) => a.productId === productId)) && (!q || r.member.name.toLowerCase().includes(q) || r.member.email.includes(q)))
  }, [members, enrollments, search, productId])

  const percentFor = (uid: string, pid: string) => {
    const p = progress.find((x) => x.id === `${uid}_${pid}`)
    const total = lessonCounts[pid] || 0
    return total ? Math.min(100, Math.round(((p?.completed?.length ?? 0) / total) * 100)) : 0
  }

  const newLink = async (m: StoreMember) => {
    setBusy(m.id)
    try {
      const { accessUrl } = await storeAccessLink(m.id)
      await copyText(accessUrl, `Link de acesso de ${m.name} copiado`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const removeMember = async (m: StoreMember) => {
    const ok = await askConfirm({
      title: `Remover o aluno ${m.name}?`,
      message: 'Apaga o aluno, os acessos, o progresso e os links de acesso. As vendas dele continuam registradas na aba Vendas. Não dá para desfazer.',
      confirmLabel: 'Remover aluno',
      danger: true,
    })
    if (!ok) return
    setBusy(m.id)
    try {
      await storeDeleteMember(m.id)
      toast.success(`${m.name} removido`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const revoke = async (m: StoreMember, pid: string) => {
    if (!(await askConfirm({ title: 'Remover acesso', message: `${m.name} perde o acesso a ${productName(pid)}.`, confirmLabel: 'Remover', danger: true }))) return
    try {
      await storeRevokeAccess(m.id, pid)
      toast.success('Acesso removido')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <Input aria-label="Buscar aluno por nome ou e-mail" placeholder="Buscar aluno por nome ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select aria-label="Produto" value={productId} onChange={(e) => setProductId(e.target.value)} className="!w-56">
          <option value="">Todos os produtos</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Button icon={<UserPlus size={15} />} onClick={() => setGrantOpen(true)} disabled={!products.length}>Liberar acesso</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nenhum aluno" description="Os compradores viram alunos automaticamente. Você também pode liberar acesso manualmente." />
      ) : (
        <ul className="space-y-2">
          {rows.map(({ member: m, access }) => (
            <li key={m.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-800">{m.name}</h3>
                  <p className="text-sm text-slate-500">{m.email}{m.phone ? `, ${m.phone}` : ''}</p>
                  <p className="text-xs text-slate-400">
                    Aluno desde {new Date(m.createdAt).toLocaleDateString('pt-BR')}
                    {m.lastAccessAt ? `, último acesso em ${new Date(m.lastAccessAt).toLocaleDateString('pt-BR')}` : ', ainda não acessou'}
                    {m.hasPassword ? ', já criou senha' : ''}
                  </p>
                </div>
                <Button size="sm" variant="secondary" icon={<Link2 size={14} />} loading={busy === m.id} onClick={() => newLink(m)} aria-label={`Gerar e copiar link de acesso de ${m.name}`}>
                  Copiar link de acesso
                </Button>
                <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} disabled={busy === m.id} onClick={() => removeMember(m)} aria-label={`Remover o aluno ${m.name}`}>
                  Remover aluno
                </Button>
              </div>
              {access.length > 0 ? (
                <ul className="mt-3 space-y-1.5">
                  {access.map((a) => {
                    const pct = percentFor(m.id, a.productId)
                    return (
                      <li key={a.id} className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="min-w-[180px] font-medium text-slate-700">{productName(a.productId)}</span>
                        {a.source === 'manual' && <Badge className="bg-slate-100 text-slate-600">liberado manualmente</Badge>}
                        <span className="flex items-center gap-2 text-slate-500">
                          <span className="h-1.5 w-28 rounded-full bg-slate-100" aria-hidden="true"><span className="block h-1.5 rounded-full bg-brand-600" style={{ width: `${pct}%` }} /></span>
                          {pct}% concluído
                        </span>
                        <button onClick={() => revoke(m, a.productId)} className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-red-600" aria-label={`Remover acesso de ${m.name} a ${productName(a.productId)}`}>
                          <XCircle size={14} /> Remover acesso
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-400">Sem acesso ativo.</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <GrantModal open={grantOpen} onClose={() => setGrantOpen(false)} products={products} />
    </div>
  )
}

function GrantModal({ open, onClose, products }: { open: boolean; onClose: () => void; products: StoreProduct[] }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [productId, setProductId] = useState('')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState('')

  const close = () => {
    setName('')
    setEmail('')
    setProductId('')
    setLink('')
    onClose()
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { accessUrl } = await storeGrantAccess(email, name, productId || products[0].id)
      setLink(accessUrl)
      toast.success('Acesso liberado')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title="Liberar acesso manualmente">
      {link ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Pronto. Envie este link para {name || email} (por WhatsApp, por exemplo). É o acesso direto à área de membros.</p>
          <Input readOnly value={link} aria-label="Link de acesso" onFocus={(e) => e.currentTarget.select()} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>Fechar</Button>
            <Button onClick={() => copyText(link, 'Link copiado')}>Copiar link</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Field label="Nome do aluno"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="E-mail" required><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Produto" required>
            <Select value={productId || products[0]?.id} onChange={(e) => setProductId(e.target.value)}>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={close}>Cancelar</Button>
            <Button type="submit" loading={busy}>Liberar acesso</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
