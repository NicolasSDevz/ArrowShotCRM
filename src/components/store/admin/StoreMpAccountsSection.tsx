import { useEffect, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { CheckCircle2, CreditCard, Landmark, Lock, Pencil, Plus, QrCode, Star, Stethoscope, Trash2, Wallet, XCircle } from 'lucide-react'
import { auth } from '../../../firebase/config'
import { useAuth } from '../../../context/AuthContext'
import { useStoreMpAccounts, useStoreProducts } from '../../../hooks/useStore'
import { storeDeleteMpAccount, storeSaveMpAccount, storeTestMpAccount, type MpAccountTest } from '../../../services/storeApi'
import { saveStorePaymentSettings, setDefaultMpAccount, setMpPrincipalDisabled, subscribeStorePaymentSettings } from '../../../services/storeService'
import { askConfirm } from '../../../utils/confirmDialog'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { Field, Input, Select } from '../../ui/Field'
import { PIX_KEY_TYPE_LABEL, canUsePrivate, type PixKeyType, type StoreMpAccount, type StorePaymentSettings, type StorePixDirect } from '../../../types/store'

const EMPTY_PIX: StorePixDirect = { enabled: false, pixKeyType: 'cpf', pixKey: '', pixName: '', pixCity: '' }

/** Como esta conta recebe o Pix: pelo Mercado Pago (automático) ou direto na chave do banco. */
function PixDirectFields({ value, onChange }: { value: StorePixDirect; onChange: (v: StorePixDirect) => void }) {
  const set = (patch: Partial<StorePixDirect>) => onChange({ ...value, ...patch })
  const option = (direct: boolean, title: string, text: string) => (
    <label className={`flex cursor-pointer gap-2.5 rounded-xl border p-3 ${value.enabled === direct ? 'border-brand-400 bg-brand-50/60 ring-1 ring-brand-200' : 'border-slate-200 hover:bg-slate-50'}`}>
      <input type="radio" name="pix-mode" checked={value.enabled === direct} onChange={() => set({ enabled: direct })} className="mt-0.5 h-4 w-4" />
      <span>
        <span className="block text-sm font-semibold text-slate-800">{title}</span>
        <span className="block text-xs text-slate-500">{text}</span>
      </span>
    </label>
  )
  return (
    <fieldset className="space-y-2 rounded-xl border border-slate-200 p-3">
      <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-slate-700">
        <QrCode size={14} className="text-slate-400" aria-hidden="true" /> Como receber o Pix
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {option(false, 'Pelo Mercado Pago', 'Automático: o acesso sai sozinho. Taxa de ~0,99%. A conta precisa ter chave Pix cadastrada no próprio Mercado Pago.')}
        {option(true, 'Direto na minha chave', 'Sem taxa, cai no seu banco. Alguém confere e clica em Confirmar na aba Vendas.')}
      </div>
      <div className="space-y-3">
        {value.enabled && (
          <>
            <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
              <Field label="Tipo da chave">
                <Select value={value.pixKeyType} onChange={(e) => set({ pixKeyType: e.target.value as PixKeyType })}>
                  {Object.entries(PIX_KEY_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Chave Pix"><Input value={value.pixKey} onChange={(e) => set({ pixKey: e.target.value })} /></Field>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Nome do titular"><Input value={value.pixName} onChange={(e) => set({ pixName: e.target.value })} placeholder="Como aparece no banco" /></Field>
              <Field label="Cidade do titular"><Input value={value.pixCity} onChange={(e) => set({ pixCity: e.target.value })} placeholder="Vitória" /></Field>
            </div>
          </>
        )}
        <p className="flex items-center gap-1.5 text-xs text-slate-400"><Landmark size={12} aria-hidden="true" /> O cartão sempre passa pelo Mercado Pago desta conta.</p>
      </div>
    </fieldset>
  )
}

/** Contas de recebimento: cada uma é uma conta do Mercado Pago e recebe o Pix e o
 *  cartão dos produtos ligados a ela (o produto escolhe na aba Geral). A principal
 *  é a da Vercel; as outras são cadastradas aqui. */
export function StoreMpAccountsSection({ principalReady, principalEmail, principalInvalid }: { principalReady: boolean; principalEmail?: string | null; principalInvalid?: boolean }) {
  const { data: accounts } = useStoreMpAccounts()
  const { data: products } = useStoreProducts()
  const { profile } = useAuth()
  const [editing, setEditing] = useState<StoreMpAccount | 'new' | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [testing, setTesting] = useState<{ id: string; name: string } | null>(null)
  const [settings, setSettings] = useState<StorePaymentSettings | null>(null)
  useEffect(() => subscribeStorePaymentSettings(setSettings), [])
  const principalLabel = settings?.mpPrincipalLabel || ''
  const principalOff = settings?.mpPrincipalDisabled === true
  const principalOn = principalReady && !principalOff
  // Padrão salvo que não existe mais (conta excluída) volta pra da Vercel.
  const savedDefault = settings?.defaultMpAccountId || ''
  const defaultId = savedDefault && accounts.some((a) => a.id === savedDefault) ? savedDefault : ''
  const nameOf = (id: string) => (id ? accounts.find((a) => a.id === id)?.label : principalLabel) || 'Conta principal'

  const makeDefault = async (id: string) => {
    if (!profile) return
    const moving = products.filter((p) => !p.privateTo && (p.mpAccountId || '') === defaultId).length
    const ok = await askConfirm({
      title: `Tornar "${nameOf(id)}" a conta padrão?`,
      message: `Ela aparece primeiro e os produtos novos já nascem nela. ${moving ? `${moving} produto(s) que estão em "${nameOf(defaultId)}" passam para ela.` : 'Nenhum produto muda agora.'} Produtos privados e os que estão em outra conta ficam como estão. Vendas já feitas continuam na conta em que foram pagas.`,
      confirmLabel: 'Tornar padrão',
    })
    if (!ok) return
    try {
      const n = await setDefaultMpAccount(id, defaultId, products, profile.id)
      toast.success(`${nameOf(id)} agora é a conta padrão${n ? ` (${n} produto(s) passaram para ela)` : ''}`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const togglePrincipal = async () => {
    if (!profile) return
    const name = principalLabel || 'Conta principal'
    if (!principalOff) {
      const ok = await askConfirm({
        title: `Apagar a conta "${name}"?`,
        message: 'Ela some da lista e as vendas novas param de usar as chaves do Mercado Pago da Vercel (MP_ACCESS_TOKEN e MP_PUBLIC_KEY) e o Pix direto dela. Os produtos que recebiam nela ficam sem Pix e cartão até você escolher outra conta neles. Pedidos já feitos continuam registrados.',
        confirmLabel: 'Apagar conta',
        danger: true,
      })
      if (!ok) return
    }
    try {
      await setMpPrincipalDisabled(!principalOff, profile.id)
      // Apagar também desliga o Pix direto dela (senão o checkout continuaria gerando Pix na chave).
      if (!principalOff && settings?.pixManual) await saveStorePaymentSettings({ ...settings, pixManual: false }, profile.id)
      toast.success(principalOff ? 'Conta principal de volta' : `${name} apagada`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const remove = async (a: StoreMpAccount) => {
    if (!(await askConfirm({ title: `Excluir a conta "${a.label}"?`, message: 'Os pedidos já feitos continuam registrados. Os produtos ligados a ela passam a receber na conta principal (a da Vercel).', confirmLabel: 'Excluir conta', danger: true }))) return
    try {
      const r = await storeDeleteMpAccount(a.id)
      toast.success(`Conta excluída${r?.moved ? ` (${r.moved} produto(s) passaram para a conta principal)` : ''}`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-800">Contas de recebimento</h2>
          <p className="mt-0.5 text-sm text-slate-500">Cada conta recebe o Pix e o cartão dos produtos dela. No produto, aba Geral, escolha a conta.</p>
        </div>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>Nova conta</Button>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[
          ...(principalOff ? [] : [<AccountCard
            key="vercel"
            order={defaultId === '' ? 0 : 1}
            name={principalLabel || 'Conta principal'}
            detail={
              !principalReady
                ? 'Mercado Pago não configurado na Vercel'
                : principalInvalid
                  ? 'Vercel: o Mercado Pago recusou o token'
                  : `Vercel · ${principalEmail || 'Mercado Pago'}`
            }
            ready={principalOn}
            pixDirect={settings?.pixManual === true}
            isDefault={defaultId === ''}
            onMakeDefault={principalOn ? () => makeDefault('') : undefined}
            onTest={principalOn ? () => setTesting({ id: '', name: principalLabel || 'Conta principal' }) : undefined}
            onEdit={() => setRenaming(true)}
            editLabel={`Configurar a conta ${principalLabel || 'principal'}`}
            onRemove={togglePrincipal}
          />]),
          ...accounts.map((a) => (
            <AccountCard
              key={a.id}
              order={defaultId === a.id ? 0 : 1}
              name={a.label}
              isPrivate={!!a.privateTo}
              detail={`Mercado Pago${a.mpEmail ? ` · ${a.mpEmail}` : ''}`}
              ready
              pixDirect={a.pixDirect?.enabled === true}
              isDefault={defaultId === a.id}
              onMakeDefault={a.privateTo ? undefined : () => makeDefault(a.id)}
              onTest={() => setTesting({ id: a.id, name: a.label })}
              onEdit={() => setEditing(a)}
              editLabel={`Editar a conta ${a.label}`}
              onRemove={() => remove(a)}
            />
          )),
        ].sort((x, y) => x.props.order - y.props.order)}
      </ul>

      {principalOff && (
        <p className="text-xs text-slate-500">
          A conta principal (da Vercel) está apagada.{' '}
          <button type="button" onClick={togglePrincipal} className="font-semibold text-brand-600 hover:underline">Trazer de volta</button>
        </p>
      )}

      <MpAccountModal account={editing} onClose={() => setEditing(null)} />
      <PrincipalModal open={renaming} settings={settings} onClose={() => setRenaming(false)} />
      <TestModal target={testing} onClose={() => setTesting(null)} />
    </section>
  )
}

function AccountCard({
  name,
  detail,
  ready,
  pixDirect,
  isPrivate,
  isDefault,
  onMakeDefault,
  onTest,
  onEdit,
  editLabel,
  onRemove,
}: {
  /** Só para ordenar a lista (padrão primeiro). */
  order: number
  name: string
  detail: string
  ready: boolean
  pixDirect?: boolean
  isPrivate?: boolean
  isDefault?: boolean
  onMakeDefault?: () => void
  onTest?: () => void
  onEdit: () => void
  editLabel: string
  onRemove?: () => void
}) {
  const chip = (on: boolean) => `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${on ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`
  return (
    <li className={`flex flex-col gap-2 rounded-xl border p-4 ${isDefault ? 'border-brand-300 ring-1 ring-brand-200' : 'border-slate-200'}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600" aria-hidden="true"><Wallet size={17} /></span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-semibold text-slate-800">
            {isPrivate && <Lock size={12} className="shrink-0 text-slate-400" aria-label="Privada" />}
            <span className="truncate">{name}</span>
          </p>
          <p className="truncate text-xs text-slate-500">{detail}</p>
          {isDefault && (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
              <Star size={11} aria-hidden="true" /> Conta padrão
            </p>
          )}
        </div>
        <button type="button" onClick={onEdit} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={editLabel}><Pencil size={14} /></button>
        {onRemove && <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Excluir ${name}`}><Trash2 size={14} /></button>}
      </div>
      <div className="flex gap-1.5">
        <span className={chip(ready || !!pixDirect)}><QrCode size={12} aria-hidden="true" /> {pixDirect ? 'Pix na minha chave' : 'Pix pelo MP'}</span>
        <span className={chip(ready)}><CreditCard size={12} aria-hidden="true" /> Cartão</span>
      </div>
      <div className="flex items-center gap-3 border-t border-slate-100 pt-2">
        {onTest && (
          <button type="button" onClick={onTest} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-brand-700" aria-label={`Testar a conta ${name}`}>
            <Stethoscope size={13} aria-hidden="true" /> Testar
          </button>
        )}
        {!isDefault && onMakeDefault && (
          <button type="button" onClick={onMakeDefault} className="ml-auto text-xs font-semibold text-brand-600 hover:underline" aria-label={`Tornar ${name} a conta padrão`}>
            Tornar padrão
          </button>
        )}
      </div>
    </li>
  )
}

/** Conta principal (Vercel): nome e o Avançado (Pix direto, com o WhatsApp dos comprovantes). */
function PrincipalModal({ open, settings, onClose }: { open: boolean; settings: StorePaymentSettings | null; onClose: () => void }) {
  const { profile } = useAuth()
  const [label, setLabel] = useState('')
  const [pix, setPix] = useState<StorePixDirect>(EMPTY_PIX)
  const [whatsapp, setWhatsapp] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setLabel(settings?.mpPrincipalLabel ?? '')
    setPix({ enabled: settings?.pixManual === true, pixKeyType: settings?.pixKeyType ?? 'cpf', pixKey: settings?.pixKey ?? '', pixName: settings?.pixName ?? '', pixCity: settings?.pixCity ?? '' })
    setWhatsapp(settings?.whatsapp ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    if (pix.enabled && (!pix.pixKey.trim() || !pix.pixName.trim() || !pix.pixCity.trim())) return toast.error('Pix direto: preencha a chave, o nome do titular e a cidade')
    setBusy(true)
    try {
      await saveStorePaymentSettings(
        {
          ...(settings ?? { pixAccounts: [] }),
          mpPrincipalLabel: label.trim(),
          pixManual: pix.enabled,
          pixKeyType: pix.pixKeyType,
          pixKey: pix.pixKey.trim(),
          pixName: pix.pixName.trim(),
          pixCity: pix.pixCity.trim(),
          whatsapp: whatsapp.replace(/\D/g, ''),
        } as StorePaymentSettings,
        profile.id
      )
      toast.success('Conta salva')
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Conta principal">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-500">A conta do Mercado Pago configurada na Vercel (MP_ACCESS_TOKEN e MP_PUBLIC_KEY).</p>
        <Field label="Nome da conta"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Nicolas" autoFocus /></Field>
        <PixDirectFields value={pix} onChange={setPix} />
        {pix.enabled && (
          <Field label="WhatsApp pra receber comprovantes (opcional, vale pra todas as contas)">
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(27) 99999-9999" inputMode="tel" />
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}>Salvar</Button>
        </div>
      </form>
    </Modal>
  )
}

function MpAccountModal({ account, onClose }: { account: StoreMpAccount | 'new' | null; onClose: () => void }) {
  const editing = account && account !== 'new' ? account : null
  const [label, setLabel] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [pix, setPix] = useState<StorePixDirect>(EMPTY_PIX)
  const [busy, setBusy] = useState(false)
  const canPrivate = canUsePrivate(auth.currentUser?.email)

  // Abriu (ou trocou de conta): preenche com o que está salvo. O token nunca volta pra tela.
  useEffect(() => {
    if (!account) return
    setLabel(editing?.label ?? '')
    setPublicKey(editing?.publicKey ?? '')
    setAccessToken('')
    setIsPrivate(!!editing?.privateTo)
    setPix({ ...EMPTY_PIX, ...(editing?.pixDirect ?? {}) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await storeSaveMpAccount({ id: editing?.id, label: label.trim(), publicKey: publicKey.trim(), accessToken: accessToken.trim() || undefined, private: isPrivate, pixDirect: pix })
      toast.success(editing ? 'Conta atualizada' : 'Conta criada. Agora escolha ela nos produtos (aba Geral).')
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!account} onClose={onClose} title={editing ? `Editar ${editing.label}` : 'Nova conta de recebimento'}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-500">Recebe o Pix e o cartão pelo Mercado Pago de quem vai receber.</p>
        <Field label="Nome da conta" required><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Bruno" autoFocus /></Field>
        <details className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600" open={!editing}>
          <summary className="cursor-pointer font-medium text-slate-700">Onde pegar as chaves do Mercado Pago</summary>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5">
            <li>Entre no Mercado Pago com a conta que vai receber.</li>
            <li>Abra <b>mercadopago.com.br/developers</b>, Suas integrações (crie uma aplicação se não tiver).</li>
            <li>Em <b>Credenciais de produção</b>, copie a <b>Public key</b> e o <b>Access token</b>.</li>
          </ol>
        </details>
        <Field label="Public key" required><Input value={publicKey} onChange={(e) => setPublicKey(e.target.value)} placeholder="APP_USR-..." /></Field>
        <Field label={editing ? 'Access token (só se for trocar)' : 'Access token'} required={!editing}>
          <Input type="password" autoComplete="off" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder={editing ? 'Em branco mantém o atual' : 'APP_USR-...'} />
        </Field>
        <p className="text-[11px] text-slate-400">O token é conferido no Mercado Pago e guardado cifrado. Ninguém vê ele de novo pelo CRM.</p>
        <PixDirectFields value={pix} onChange={setPix} />
        {canPrivate && (
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="h-3.5 w-3.5" />
            <Lock size={11} aria-hidden="true" /> Privada
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}>{editing ? 'Salvar' : 'Criar conta'}</Button>
        </div>
      </form>
    </Modal>
  )
}

/** Resultado do teste de uma conta: de quem é no Mercado Pago e se o Pix funciona. */
function TestModal({ target, onClose }: { target: { id: string; name: string } | null; onClose: () => void }) {
  const [result, setResult] = useState<MpAccountTest | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!target) return
    setResult(null)
    setError('')
    storeTestMpAccount(target.id).then(setResult, (err: Error) => setError(err.message))
  }, [target])

  const line = (ok: boolean, title: string, text?: string | null) => (
    <li className="flex gap-2.5">
      {ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" /> : <XCircle size={18} className="mt-0.5 shrink-0 text-red-500" aria-hidden="true" />}
      <div>
        <p className="text-sm font-semibold text-slate-800">{ok ? 'OK: ' : 'Problema: '}{title}</p>
        {text && <p className="text-xs text-slate-500">{text}</p>}
      </div>
    </li>
  )

  return (
    <Modal open={!!target} onClose={onClose} title={`Teste da conta ${target?.name ?? ''}`}>
      <div className="space-y-4" aria-live="polite">
        {!result && !error && <p className="text-sm text-slate-500">Conferindo no Mercado Pago... (gera um Pix de teste de R$ 1,00 e cancela na hora)</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {result && (
          <ul className="space-y-3">
            {result.account
              ? line(true, 'Conta do Mercado Pago', `${result.account.email || result.account.nickname} (id ${result.account.userId}). Confira se é a conta que deve receber.`)
              : line(false, 'Token', result.accountError)}
            {result.test && line(false, 'Credencial de TESTE', 'Esta conta está com chaves TEST-. Cliente de verdade não consegue pagar: troque pelas de produção (APP_USR-).')}
            {!result.publicKeyOk && line(false, 'Public key', 'A public key não parece válida (começa com APP_USR-). Sem ela o cartão não aparece.')}
            {result.account && (result.pix.ok
              ? line(true, 'Pix pelo Mercado Pago', 'O Mercado Pago gerou o QR Code (o teste foi cancelado).')
              : line(false, 'Pix pelo Mercado Pago', [result.pix.hint, result.pix.error && `Resposta do Mercado Pago: ${result.pix.error}`].filter(Boolean).join(' ')))}
          </ul>
        )}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  )
}
