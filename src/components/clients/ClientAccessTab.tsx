import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Copy, Eye, EyeOff, KeyRound, Link2, Loader2, Lock, Pencil, Plus, RefreshCw, Trash2, UserCheck } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input, Textarea } from '../ui/Field'
import { usePrivacy } from '../../context/PrivacyContext'
import { askConfirm } from '../../utils/confirmDialog'
import { showError } from '../../utils/notifyError'
import {
  createCredentialRequestLink,
  credentialRequestUrl,
  deleteClientCredential,
  disableCredentialRequestLink,
  listClientCredentials,
  revealCredentialPassword,
  saveClientCredential,
} from '../../services/credentialsApi'
import { CREDENTIAL_SERVICES, type CredentialEntry, type CredentialRequestStatus } from '../../types/clientCredentials'
import type { Client } from '../../types/client'

interface CardDef {
  key: string
  title: string
  loginLabel: string
  hint?: string
  custom: boolean
}

const fmt = (iso: string | null) => (iso ? format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '')

/** Aba "Acessos" da ficha do cliente: logins e senhas das contas (site,
 *  Facebook, Instagram, Google…). A senha fica criptografada no servidor e
 *  só aparece quando alguém clica em "Mostrar" — e isso fica registrado. O
 *  cliente pode preencher sozinho por um link. */
export function ClientAccessTab({ client }: { client: Client }) {
  const [entries, setEntries] = useState<Record<string, CredentialEntry>>({})
  const [request, setRequest] = useState<CredentialRequestStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [linkBusy, setLinkBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await listClientCredentials(client.id)
      setEntries(Object.fromEntries(r.entries.map((e) => [e.key, e])))
      setRequest(r.request)
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erro ao carregar os acessos')
    } finally {
      setLoading(false)
    }
  }, [client.id])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  const cards: CardDef[] = [
    ...CREDENTIAL_SERVICES.map((s) => ({ key: s.key, title: s.label, loginLabel: s.loginLabel, hint: s.hint, custom: false })),
    ...Object.values(entries)
      .filter((e) => e.key.startsWith('custom-'))
      .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''))
      .map((e) => ({ key: e.key, title: e.label || 'Outro acesso', loginLabel: 'Login / e-mail', custom: true })),
  ]
  const filled = cards.filter((c) => entries[c.key]?.login || entries[c.key]?.hasPassword).length

  const copyLink = async (token: string) => {
    await navigator.clipboard.writeText(credentialRequestUrl(token))
    toast.success('Link copiado — mande pro cliente preencher')
  }

  const createLink = async () => {
    if (request && !(await askConfirm({ title: 'Gerar um link novo?', message: 'O link atual para de funcionar.', confirmLabel: 'Gerar novo' }))) return
    setLinkBusy(true)
    try {
      const { token } = await createCredentialRequestLink(client.id, client.companyName)
      setRequest({ token, createdAt: new Date().toISOString(), submittedAt: null })
      await copyLink(token)
    } catch (err) {
      showError(err, 'Erro ao criar o link')
    } finally {
      setLinkBusy(false)
    }
  }

  const disableLink = async () => {
    if (!(await askConfirm({ title: 'Desativar o link do cliente?', message: 'Quem tiver o endereço não consegue mais enviar acessos.', confirmLabel: 'Desativar', danger: true }))) return
    setLinkBusy(true)
    try {
      await disableCredentialRequestLink(client.id)
      setRequest(null)
      toast.success('Link desativado')
    } catch (err) {
      showError(err, 'Erro ao desativar o link')
    } finally {
      setLinkBusy(false)
    }
  }

  const addCustom = () => {
    const key = `custom-${crypto.randomUUID().slice(0, 8)}`
    setEntries((prev) => ({ ...prev, [key]: { key, label: '', login: '', note: '', hasPassword: false, updatedAt: null, updatedBy: null, source: 'team' } }))
    setEditing(key)
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <KeyRound size={18} className="text-brand-600" /> Acesso das Contas — {client.companyName}
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
            <Lock size={12} /> Senhas guardadas criptografadas. Toda vez que alguém clica em "Mostrar", fica registrado quem viu.
          </p>
        </div>
        {!loading && !loadError && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {filled} de {cards.length} preenchidos
          </span>
        )}
      </div>

      {/* Link pro cliente preencher */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/50 p-3.5">
        <Link2 size={18} className="shrink-0 text-brand-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">Pedir os acessos pro cliente</p>
          <p className="text-xs text-slate-500">
            {request
              ? request.submittedAt
                ? `O cliente preencheu em ${fmt(request.submittedAt)}. O link continua valendo se ele quiser completar.`
                : 'Link ativo — o cliente ainda não preencheu.'
              : 'Gera um link só deste cliente. O que ele preencher cai direto aqui, sem copiar nada.'}
          </p>
        </div>
        {request ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" icon={<Copy size={13} />} onClick={() => copyLink(request.token)} disabled={linkBusy}>
              Copiar link
            </Button>
            <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={createLink} disabled={linkBusy}>
              Novo link
            </Button>
            <button type="button" onClick={disableLink} disabled={linkBusy} className="px-1.5 text-xs font-medium text-red-500 hover:text-red-600 disabled:opacity-50">
              Desativar
            </button>
          </div>
        ) : (
          <Button size="sm" icon={<Link2 size={13} />} onClick={createLink} loading={linkBusy} disabled={loading || !!loadError}>
            Gerar link e copiar
          </Button>
        )}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 py-6 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin" /> Carregando acessos…
        </p>
      ) : loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">Não foi possível carregar os acessos</p>
          <p className="mt-0.5">{loadError}</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => void load()}>
            Tentar de novo
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {cards.map((c) => (
              <CredentialCard
                key={c.key}
                clientId={client.id}
                def={c}
                entry={entries[c.key]}
                editing={editing === c.key}
                onEdit={() => setEditing(c.key)}
                onCancel={() => {
                  setEditing(null)
                  // Acesso extra novo que nem chegou a ser salvo: some.
                  if (c.custom && !entries[c.key]?.updatedAt) setEntries(({ [c.key]: _drop, ...rest }) => rest)
                }}
                onSaved={() => {
                  setEditing(null)
                  void load()
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={addCustom}
            className="flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 hover:border-brand-400 hover:text-brand-600"
          >
            <Plus size={14} /> Adicionar outro acesso
          </button>
        </>
      )}
    </div>
  )
}

function CredentialCard({
  clientId,
  def,
  entry,
  editing,
  onEdit,
  onCancel,
  onSaved,
}: {
  clientId: string
  def: CardDef
  entry?: CredentialEntry
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  onSaved: () => void
}) {
  const { isPrivacyMode } = usePrivacy()
  const [revealed, setRevealed] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [label, setLabel] = useState(entry?.label ?? '')
  const [login, setLogin] = useState(entry?.login ?? '')
  const [password, setPassword] = useState('')
  const [clearPassword, setClearPassword] = useState(false)
  const [note, setNote] = useState(entry?.note ?? '')
  const [saving, setSaving] = useState(false)
  const has = !!(entry?.login || entry?.hasPassword || entry?.note)

  useEffect(() => {
    if (!editing) return
    setLabel(entry?.label ?? '')
    setLogin(entry?.login ?? '')
    setPassword('')
    setClearPassword(false)
    setNote(entry?.note ?? '')
  }, [editing, entry])

  const getPassword = async () => {
    if (revealed !== null) return revealed
    setRevealing(true)
    try {
      const pw = (await revealCredentialPassword(clientId, def.key)) ?? ''
      setRevealed(pw)
      return pw
    } catch (err) {
      showError(err, 'Erro ao mostrar a senha')
      return null
    } finally {
      setRevealing(false)
    }
  }

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copiado`)
  }

  const save = async () => {
    if (def.custom && !label.trim()) return toast.error('Dê um nome pra esse acesso (ex: TikTok)')
    setSaving(true)
    try {
      await saveClientCredential(clientId, def.key, {
        ...(def.custom ? { label } : {}),
        login,
        note,
        ...(clearPassword ? { password: '' } : password ? { password } : {}),
      })
      setRevealed(null)
      toast.success('Acesso salvo')
      onSaved()
    } catch (err) {
      showError(err, 'Erro ao salvar o acesso')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!(await askConfirm({ title: `Excluir o acesso "${def.title}"?`, confirmLabel: 'Excluir', danger: true }))) return
    try {
      await deleteClientCredential(clientId, def.key)
      toast.success('Acesso excluído')
      onSaved()
    } catch (err) {
      showError(err, 'Erro ao excluir')
    }
  }

  return (
    <div className={`flex flex-col gap-2.5 rounded-xl border p-4 ${has ? 'border-slate-200 bg-white' : 'border-dashed border-slate-200 bg-slate-50/50'}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{def.title || 'Novo acesso'}</p>
          {def.hint && <p className="text-[11px] text-slate-400">{def.hint}</p>}
        </div>
        {entry?.source === 'client' && !editing && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700" title="Preenchido pelo cliente pelo link">
            <UserCheck size={11} /> Cliente
          </span>
        )}
        {!editing && (
          <button type="button" onClick={onEdit} title="Editar" className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <Pencil size={13} />
          </button>
        )}
        {def.custom && !editing && entry?.updatedAt && (
          <button type="button" onClick={remove} title="Excluir" className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          {def.custom && <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome do acesso (ex: TikTok, Canva)" autoFocus />}
          <label className="text-xs font-medium text-slate-500">
            {def.loginLabel}
            <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" className="mt-1" autoFocus={!def.custom} />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Senha
            <Input
              type="text"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setClearPassword(false)
              }}
              autoComplete="off"
              placeholder={entry?.hasPassword ? 'Deixe em branco pra manter a senha atual' : 'Senha'}
              className="mt-1 font-mono"
              disabled={clearPassword}
            />
          </label>
          {entry?.hasPassword && (
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <input type="checkbox" checked={clearPassword} onChange={(e) => setClearPassword(e.target.checked)} /> Apagar a senha salva
            </label>
          )}
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação (ex: código de 2 fatores vai pro celular do dono)" />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} loading={saving}>
              Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : has ? (
        <div className="flex flex-col gap-1.5">
          <Row label={def.loginLabel}>
            {entry?.login ? (
              <>
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{isPrivacyMode ? '••••••' : entry.login}</span>
                <IconBtn title="Copiar" onClick={() => copy(entry.login, def.loginLabel)}>
                  <Copy size={13} />
                </IconBtn>
              </>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </Row>
          <Row label="Senha">
            {entry?.hasPassword ? (
              <>
                <span className="min-w-0 flex-1 truncate font-mono text-slate-800">{revealed !== null && !isPrivacyMode ? revealed : '••••••••'}</span>
                {revealing ? (
                  <Loader2 size={14} className="animate-spin text-slate-400" />
                ) : (
                  <>
                    <IconBtn title={revealed !== null ? 'Esconder' : 'Mostrar'} onClick={() => (revealed !== null ? setRevealed(null) : void getPassword())}>
                      {revealed !== null ? <EyeOff size={13} /> : <Eye size={13} />}
                    </IconBtn>
                    <IconBtn
                      title="Copiar senha"
                      onClick={async () => {
                        const pw = await getPassword()
                        if (pw !== null) await copy(pw, 'Senha')
                      }}
                    >
                      <Copy size={13} />
                    </IconBtn>
                  </>
                )}
              </>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </Row>
          {entry?.note && <p className="whitespace-pre-line rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">{entry.note}</p>}
          {entry?.updatedAt && (
            <p className="text-[11px] text-slate-400">
              Atualizado {entry.updatedBy ? `por ${entry.updatedBy} ` : ''}em {fmt(entry.updatedAt)}
            </p>
          )}
        </div>
      ) : (
        <button type="button" onClick={onEdit} className="flex w-fit items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
          <Plus size={12} /> Preencher
        </button>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-24 shrink-0 text-xs text-slate-400">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
    </div>
  )
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
      {children}
    </button>
  )
}
