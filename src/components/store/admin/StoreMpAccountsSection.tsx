import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CheckCircle2, CreditCard, Lock, Pencil, Plus, Trash2, XCircle } from 'lucide-react'
import { auth } from '../../../firebase/config'
import { useStoreMpAccounts } from '../../../hooks/useStore'
import { storeDeleteMpAccount, storeSaveMpAccount } from '../../../services/storeApi'
import { askConfirm } from '../../../utils/confirmDialog'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { Field, Input } from '../../ui/Field'
import { canUsePrivate, type StoreMpAccount, type StoreProduct } from '../../../types/store'

/** Contas do Mercado Pago (Pix e cartão): a principal (Vercel) e as cadastradas aqui.
 *  Cada produto escolhe a sua na aba Geral; o quadro de baixo mostra pra onde vai cada um. */
export function StoreMpAccountsSection({ principalReady, products }: { principalReady: boolean; products: StoreProduct[] }) {
  const { data: accounts } = useStoreMpAccounts()
  const [editing, setEditing] = useState<StoreMpAccount | 'new' | null>(null)
  const countFor = (id: string | null) => products.filter((p) => (p.mpAccountId || null) === id && p.status !== 'archived').length
  const labelOf = (id?: string | null) => (id ? accounts.find((a) => a.id === id)?.label ?? 'Conta removida' : 'Conta principal')

  const remove = async (a: StoreMpAccount) => {
    if (!(await askConfirm({ title: `Excluir a conta "${a.label}"?`, message: 'O token sai do sistema. Os pedidos já feitos continuam registrados.', confirmLabel: 'Excluir conta', danger: true }))) return
    try {
      await storeDeleteMpAccount(a.id)
      toast.success('Conta excluída')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const live = products.filter((p) => p.status !== 'archived')

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-800"><CreditCard size={16} className="text-brand-600" aria-hidden="true" /> Mercado Pago: Pix e cartão</h2>
          <p className="mt-0.5 text-sm text-slate-500">Cada produto escolhe em qual conta cai o dinheiro (aba Geral do produto). O Pix e o cartão daquele produto vão juntos pra mesma conta.</p>
        </div>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>Adicionar conta</Button>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <li className="flex flex-col gap-1.5 rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-slate-800">Conta principal</p>
            {principalReady ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 size={13} aria-hidden="true" /> Conectada</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400"><XCircle size={13} aria-hidden="true" /> Não configurada</span>
            )}
          </div>
          <p className="text-xs text-slate-500">Configurada na Vercel. Recebe os produtos sem conta escolhida.</p>
          <p className="mt-auto pt-1 text-xs font-medium text-slate-600">{countFor(null)} {countFor(null) === 1 ? 'produto' : 'produtos'}</p>
        </li>
        {accounts.map((a) => (
          <li key={a.id} className="flex flex-col gap-1.5 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-800">
                {a.privateTo && <Lock size={12} className="shrink-0 text-slate-400" aria-label="Privada" />}
                <span className="truncate">{a.label}</span>
              </p>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 size={13} aria-hidden="true" /> Conectada</span>
            </div>
            <p className="truncate text-xs text-slate-500">{a.mpEmail || a.mpNickname || 'Conta do Mercado Pago'}</p>
            <div className="mt-auto flex items-center gap-1 pt-1">
              <p className="flex-1 text-xs font-medium text-slate-600">{countFor(a.id)} {countFor(a.id) === 1 ? 'produto' : 'produtos'}</p>
              <button type="button" onClick={() => setEditing(a)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Editar a conta ${a.label}`}><Pencil size={14} /></button>
              <button type="button" onClick={() => remove(a)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Excluir a conta ${a.label}`}><Trash2 size={14} /></button>
            </div>
          </li>
        ))}
      </ul>

      {live.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Pra onde vai cada produto</p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {live.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Link to={`/loja/produtos/${p.id}`} className="min-w-0 flex-1 truncate font-medium text-slate-700 hover:text-brand-700 hover:underline">{p.name}</Link>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${p.mpAccountId ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>{labelOf(p.mpAccountId)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <MpAccountModal account={editing} onClose={() => setEditing(null)} />
    </section>
  )
}

function MpAccountModal({ account, onClose }: { account: StoreMpAccount | 'new' | null; onClose: () => void }) {
  const editing = account && account !== 'new' ? account : null
  const [label, setLabel] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [openedFor, setOpenedFor] = useState<string | null>(null)
  const canPrivate = canUsePrivate(auth.currentUser?.email)

  // Abriu (ou trocou de conta): preenche com o que está salvo. O token nunca volta pra tela.
  const key = account === 'new' ? 'new' : account?.id ?? null
  if (key !== openedFor) {
    setOpenedFor(key)
    setLabel(editing?.label ?? '')
    setPublicKey(editing?.publicKey ?? '')
    setAccessToken('')
    setIsPrivate(!!editing?.privateTo)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await storeSaveMpAccount({ id: editing?.id, label: label.trim(), publicKey: publicKey.trim(), accessToken: accessToken.trim() || undefined, private: isPrivate })
      toast.success(editing ? 'Conta atualizada' : 'Conta conectada. Agora escolha ela nos produtos (aba Geral).')
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!account} onClose={onClose} title={editing ? `Editar ${editing.label}` : 'Conectar conta do Mercado Pago'}>
      <form onSubmit={submit} className="space-y-3">
        <ol className="list-decimal space-y-0.5 rounded-xl bg-slate-50 p-3 pl-7 text-xs text-slate-600">
          <li>Entre no Mercado Pago com a conta que vai receber.</li>
          <li>Vá em <b>Seu negócio &gt; Configurações &gt; Credenciais</b> (ou mercadopago.com.br/developers, Suas integrações).</li>
          <li>Em <b>Credenciais de produção</b>, copie a <b>Public key</b> e o <b>Access token</b>.</li>
        </ol>
        <Field label="Apelido" required><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Bruno, Flores" autoFocus /></Field>
        <Field label="Public key" required><Input value={publicKey} onChange={(e) => setPublicKey(e.target.value)} placeholder="APP_USR-..." /></Field>
        <Field label={editing ? 'Access token (só se for trocar)' : 'Access token'} required={!editing}>
          <Input type="password" autoComplete="off" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder={editing ? 'Deixe em branco pra manter o atual' : 'APP_USR-...'} />
        </Field>
        <p className="text-[11px] text-slate-400">O token é conferido no Mercado Pago e guardado cifrado no servidor. Ninguém consegue ver ele de novo pelo CRM.</p>
        {canPrivate && (
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="h-3.5 w-3.5" />
            <Lock size={11} aria-hidden="true" /> Privada
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}>{editing ? 'Salvar' : 'Conectar conta'}</Button>
        </div>
      </form>
    </Modal>
  )
}
