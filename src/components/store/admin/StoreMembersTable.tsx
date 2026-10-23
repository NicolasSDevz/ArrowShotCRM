import { useMemo, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { Activity, ChevronDown, GraduationCap, KeyRound, Link2, Mail, Trash2, UserPlus, Users, UserX, XCircle } from 'lucide-react'
import { MetricCard } from '../../ui/MetricCard'
import { Button } from '../../ui/Button'
import { Field, Input, Select } from '../../ui/Field'
import { Modal } from '../../ui/Modal'
import { EmptyState } from '../../ui/EmptyState'
import { Badge } from '../../ui/Badge'
import { storeAccessLink, storeDeleteMember, storeEmailTest, storeGrantAccess, storeRevokeAccess } from '../../../services/storeApi'
import { askConfirm } from '../../../utils/confirmDialog'
import { copyText } from './StoreOrdersTable'
import { TempPasswordModal } from './TempPasswordModal'
import type { StoreEnrollment, StoreMember, StoreProduct, StoreProgress } from '../../../types/store'

type MemberStatus = 'active' | 'idle' | 'never'

const initialsOf = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()


/** Alunos: quem tem acesso a quê, progresso, link de acesso e liberação manual. */
export function StoreMembersTable({
  members,
  enrollments,
  progress,
  products,
  lessonCounts,
  emailOn = false,
}: {
  members: StoreMember[]
  enrollments: StoreEnrollment[]
  progress: StoreProgress[]
  products: StoreProduct[]
  /** total de aulas por produto (pra calcular %). */
  lessonCounts: Record<string, number>
  /** E-mail automático (Gmail ou Resend) configurado? */
  emailOn?: boolean
}) {
  const [search, setSearch] = useState('')
  const [productId, setProductId] = useState('')
  const [grantOpen, setGrantOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [tempFor, setTempFor] = useState<StoreMember | null>(null)
  const [testing, setTesting] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | MemberStatus>('all')
  const [openId, setOpenId] = useState<string | null>(null)

  const emailTest = async () => {
    setTesting(true)
    try {
      const { to } = await storeEmailTest()
      toast.success(`E-mail de teste enviado para ${to}. Confira a caixa de entrada e o spam.`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setTesting(false)
    }
  }
  const firstProductOf = (uid: string) => enrollments.find((e) => e.uid === uid && e.active)?.productId

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
      const { accessUrl } = await storeAccessLink(m.id, enrollments.find((e) => e.uid === m.id && e.active)?.productId)
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

  const now = Date.now()
  const WEEK = 7 * 86_400_000
  const statusOf = (m: StoreMember): { key: MemberStatus; label: string; cls: string } => {
    if (m.lastAccessAt && now - new Date(m.lastAccessAt).getTime() <= WEEK) return { key: 'active', label: 'Ativo esta semana', cls: 'bg-emerald-50 text-emerald-700' }
    if (m.lastAccessAt) return { key: 'idle', label: 'Sumido', cls: 'bg-amber-50 text-amber-700' }
    if (!m.hasPassword && m.tempPasswordUntil && new Date(m.tempPasswordUntil).getTime() < now) return { key: 'never', label: 'Senha provisória vencida', cls: 'bg-red-50 text-red-600' }
    return { key: 'never', label: 'Nunca acessou', cls: 'bg-slate-100 text-slate-600' }
  }
  const avgPercent = (uid: string, access: StoreEnrollment[]) =>
    access.length ? Math.round(access.reduce((s, a) => s + percentFor(uid, a.productId), 0) / access.length) : 0

  const allRows = rows
  const counts = {
    all: allRows.length,
    active: allRows.filter((r) => statusOf(r.member).key === 'active').length,
    idle: allRows.filter((r) => statusOf(r.member).key === 'idle').length,
    never: allRows.filter((r) => statusOf(r.member).key === 'never').length,
  }
  const shown = statusFilter === 'all' ? allRows : allRows.filter((r) => statusOf(r.member).key === statusFilter)
  const avgAll = allRows.length ? Math.round(allRows.reduce((s, r) => s + avgPercent(r.member.id, r.access), 0) / allRows.length) : 0
  const chips: { key: 'all' | MemberStatus; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'active', label: 'Ativos esta semana' },
    { key: 'idle', label: 'Sumidos' },
    { key: 'never', label: 'Nunca acessaram' },
  ]
  const date = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon={Users} accent="blue" label="Alunos" value={String(counts.all)} />
        <MetricCard icon={Activity} accent="green" label="Ativos esta semana" value={String(counts.active)} />
        <MetricCard icon={UserX} accent="amber" label="Nunca acessaram" value={String(counts.never)} subtitle={counts.never ? 'Mande o link ou uma senha provisória' : undefined} />
        <MetricCard icon={GraduationCap} accent="violet" label="Conclusão média" value={`${avgAll}%`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
        <div className="min-w-[200px] flex-1">
          <Input aria-label="Buscar aluno por nome ou e-mail" placeholder="Buscar aluno por nome ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select aria-label="Produto" value={productId} onChange={(e) => setProductId(e.target.value)} className="!w-52">
          <option value="">Todos os produtos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        <Button icon={<UserPlus size={15} />} onClick={() => setGrantOpen(true)} disabled={!products.length}>
          Liberar acesso
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Filtrar alunos" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={statusFilter === c.key}
              onClick={() => setStatusFilter(c.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${statusFilter === c.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {c.label} <span className="ml-0.5 opacity-60">{counts[c.key]}</span>
            </button>
          ))}
        </div>
        <p role="status" className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Mail size={13} aria-hidden="true" />
          {emailOn ? 'E-mail automático ligado' : 'E-mail automático desligado: mande o acesso pelo WhatsApp'}
          {emailOn && (
            <button type="button" onClick={emailTest} disabled={testing} className="font-semibold text-brand-600 hover:underline disabled:opacity-60">
              {testing ? 'Enviando...' : 'Testar'}
            </button>
          )}
        </p>
      </div>

      {shown.length === 0 ? (
        <EmptyState title="Nenhum aluno" description={allRows.length ? 'Nenhum aluno neste filtro.' : 'Os compradores viram alunos automaticamente. Você também pode liberar acesso manualmente.'} />
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {shown.map(({ member: m, access }) => {
            const st = statusOf(m)
            const pct = avgPercent(m.id, access)
            const open = openId === m.id
            return (
              <li key={m.id} className={open ? 'bg-slate-50/70' : ''}>
                <div className="grid grid-cols-1 items-center gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_9rem_auto]">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700" aria-hidden="true">
                      {initialsOf(m.name || m.email)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800">{m.name || m.email}</p>
                      <p className="truncate text-xs text-slate-500">{m.email}</p>
                    </div>
                  </div>
                  <div className="min-w-0">
                    {access.length ? (
                      <>
                        <p className="truncate text-sm text-slate-700">
                          {access.length === 1 ? productName(access[0].productId) : `${access.length} produtos`}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                          <span className="h-1.5 w-24 rounded-full bg-slate-100" aria-hidden="true">
                            <span className="block h-1.5 rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                          </span>
                          {pct}% concluído
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-slate-400">Sem acesso ativo</p>
                    )}
                  </div>
                  <div>
                    <Badge className={st.cls}>{st.label}</Badge>
                    <p className="mt-0.5 text-xs text-slate-400">{m.lastAccessAt ? `Último acesso ${date(m.lastAccessAt)}` : `Aluno desde ${date(m.createdAt)}`}</p>
                  </div>
                  <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                    <Button size="sm" variant="secondary" icon={<Link2 size={14} />} loading={busy === m.id} onClick={() => newLink(m)} aria-label={`Gerar e copiar link de acesso de ${m.name}`}>
                      Link
                    </Button>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : m.id)}
                      aria-expanded={open}
                      aria-label={`${open ? 'Fechar' : 'Ver'} detalhes de ${m.name}`}
                      className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    >
                      Detalhes <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="space-y-4 border-t border-slate-100 px-4 py-4 text-sm">
                    <dl className="grid gap-x-6 gap-y-1 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-4">
                      <div><dt className="inline font-semibold text-slate-600">Aluno desde: </dt><dd className="inline">{date(m.createdAt)}</dd></div>
                      <div><dt className="inline font-semibold text-slate-600">Último acesso: </dt><dd className="inline">{m.lastAccessAt ? date(m.lastAccessAt) : 'ainda não acessou'}</dd></div>
                      <div>
                        <dt className="inline font-semibold text-slate-600">Senha: </dt>
                        <dd className="inline">
                          {m.hasPassword
                            ? 'já criou a dele'
                            : m.tempPasswordUntil
                              ? new Date(m.tempPasswordUntil).getTime() > now
                                ? `provisória até ${date(m.tempPasswordUntil)}`
                                : 'provisória vencida'
                              : 'não criou'}
                        </dd>
                      </div>
                      {m.phone && <div><dt className="inline font-semibold text-slate-600">WhatsApp: </dt><dd className="inline">{m.phone}</dd></div>}
                    </dl>

                    {access.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Produtos</p>
                        <ul className="space-y-2">
                          {access.map((a) => {
                            const p = percentFor(m.id, a.productId)
                            return (
                              <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                                <span className="min-w-[160px] flex-1 font-medium text-slate-700">{productName(a.productId)}</span>
                                {a.source === 'manual' && <Badge className="bg-slate-100 text-slate-600">liberado manualmente</Badge>}
                                {a.source === 'equipe' && <Badge className="bg-brand-50 text-brand-700">equipe</Badge>}
                                <span className="flex items-center gap-2 text-xs text-slate-500">
                                  <span className="h-1.5 w-24 rounded-full bg-slate-100" aria-hidden="true">
                                    <span className="block h-1.5 rounded-full bg-brand-600" style={{ width: `${p}%` }} />
                                  </span>
                                  {p}%
                                </span>
                                <button onClick={() => revoke(m, a.productId)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-600" aria-label={`Remover acesso de ${m.name} a ${productName(a.productId)}`}>
                                  <XCircle size={14} aria-hidden="true" /> Remover acesso
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                      <Button size="sm" variant="secondary" icon={<KeyRound size={14} />} disabled={busy === m.id} onClick={() => setTempFor(m)} aria-label={`Criar senha provisória para ${m.name}`}>
                        Senha provisória
                      </Button>
                      <Button size="sm" variant="secondary" icon={<Link2 size={14} />} loading={busy === m.id} onClick={() => newLink(m)} aria-label={`Gerar e copiar link de acesso de ${m.name}`}>
                        Copiar link de acesso
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} disabled={busy === m.id} onClick={() => removeMember(m)} aria-label={`Remover o aluno ${m.name}`} className="ml-auto">
                        Remover aluno
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <GrantModal
        open={grantOpen}
        onClose={() => setGrantOpen(false)}
        products={products}
        onTempPassword={(uid, name, email, phone) => setTempFor({ id: uid, name: name || email, email, phone: phone || null, hasPassword: false, createdAt: new Date().toISOString() })}
      />
      <TempPasswordModal member={tempFor} productId={tempFor ? firstProductOf(tempFor.id) : undefined} emailOn={emailOn} onClose={() => setTempFor(null)} />
    </div>
  )
}

function GrantModal({
  open,
  onClose,
  products,
  onTempPassword,
}: {
  open: boolean
  onClose: () => void
  products: StoreProduct[]
  onTempPassword: (uid: string, name: string, email: string, phone: string) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [uid, setUid] = useState('')
  const [emailed, setEmailed] = useState(false)
  const [productId, setProductId] = useState('')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState('')

  const close = () => {
    setName('')
    setEmail('')
    setProductId('')
    setLink('')
    setPhone('')
    setUid('')
    setEmailed(false)
    onClose()
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { accessUrl, uid: newUid, emailSent } = await storeGrantAccess(email, name, productId || products[0].id, phone)
      setLink(accessUrl)
      setUid(newUid)
      setEmailed(!!emailSent)
      toast.success(emailSent ? `Acesso liberado e enviado para ${email}` : 'Acesso liberado')
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
          <p className="text-sm text-slate-600">
            {emailed
              ? `Pronto. ${name || email} recebeu por e-mail o link e uma senha provisória (vale 1 dia). Se quiser, mande também pelo WhatsApp.`
              : `Pronto. Envie este link para ${name || email} (por WhatsApp, por exemplo). É o acesso direto à área de membros.`}
          </p>
          <Input readOnly value={link} aria-label="Link de acesso" onFocus={(e) => e.currentTarget.select()} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>Fechar</Button>
            <Button
              variant="secondary"
              icon={<KeyRound size={14} />}
              onClick={() => {
                const data = [uid, name, email, phone] as const
                close()
                onTempPassword(...data)
              }}
            >
              Mandar senha provisória
            </Button>
            <Button onClick={() => copyText(link, 'Link copiado')}>Copiar link</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Field label="Nome do aluno"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="E-mail" required><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="WhatsApp (opcional)"><Input inputMode="tel" placeholder="Ex.: 11 98765-4321" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
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
