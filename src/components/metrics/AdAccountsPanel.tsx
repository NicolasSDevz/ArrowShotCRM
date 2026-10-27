import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CheckCircle2, KeyRound, Loader2, RefreshCw, Search, ShieldAlert, Trash2, Users, Plug } from 'lucide-react'
import { useClients } from '../../hooks/useClients'
import { useAuth } from '../../context/AuthContext'
import { usePrivacy } from '../../context/PrivacyContext'
import { updateClient } from '../../services/clientService'
import { deleteMetaToken, listMetaTokenStatuses, saveMetaToken, testMetaConnection, type MetaClientTokenRow } from '../../services/metaApi'
import { tokenValidity } from '../../utils/metaTokenValidity'
import { ensureActPrefix, normalizeMetaAccountId } from '../../utils/metaReportData'
import { maskGoogleAdsId } from '../../utils/masks'
import { trafficServices, hasContractedPaidTraffic } from '../../utils/clientServices'
import { EMPTY_CAMPAIGN_PLANNING, EMPTY_CAMPAIGN_PLANNING_ACCESS, type CampaignPlanningAccess } from '../../types/campaignPlanning'
import { isClientInOperation, type Client } from '../../types/client'
import { MetaTokenRenewModal } from '../clients/MetaTokenRenewModal'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Input } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { StatCard } from '../ui/StatCard'
import { askConfirm } from '../../utils/confirmDialog'
import { showError } from '../../utils/notifyError'

/** Grava um campo de "acessos" do planejamento sem mexer no resto. */
async function saveAccess(client: Client, patch: Partial<CampaignPlanningAccess>, userId: string, userName: string) {
  const planning = client.campaignPlanning ?? EMPTY_CAMPAIGN_PLANNING
  const acessos = { ...(planning.acessos ?? EMPTY_CAMPAIGN_PLANNING_ACCESS), ...patch }
  await updateClient(client.id, { campaignPlanning: { ...planning, acessos } }, userId, userName)
}

/** Status do token em texto curto, sem emoji (leitor de tela). */
function tokenText(row: MetaClientTokenRow | undefined) {
  const v = tokenValidity({ hasToken: !!row, expiresAt: row?.expiresAt ?? null })
  if (v.level === 'none') return { text: 'Sem token', tone: 'bg-slate-100 text-slate-500', level: v.level }
  if (v.level === 'unknown') return { text: 'Token salvo', tone: 'bg-slate-100 text-slate-600', level: v.level }
  if (v.level === 'red') return { text: 'Token vencido', tone: 'bg-red-100 text-red-700', level: v.level }
  if (v.level === 'yellow') return { text: `Vence em ${v.daysLeft} dia${v.daysLeft === 1 ? '' : 's'}`, tone: 'bg-amber-100 text-amber-700', level: v.level }
  return { text: `Válido por ${v.daysLeft} dias`, tone: 'bg-emerald-100 text-emerald-700', level: v.level }
}

/** Campo de ID que salva ao sair (Enter também). */
function IdField({
  label,
  value,
  placeholder,
  format,
  onSave,
}: {
  label: string
  value: string
  placeholder: string
  format: (v: string) => string
  onSave: (v: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  useEffect(() => setDraft(value), [value])

  const commit = async () => {
    const next = format(draft.trim())
    if (next === value) return
    setSaving(true)
    try {
      await onSave(next)
    } catch (err) {
      setDraft(value)
      showError(err, `Erro ao salvar ${label}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        placeholder={placeholder}
        disabled={saving}
        className="w-full pr-8 font-mono text-[13px]"
      />
      {saving && <Loader2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-slate-400" aria-hidden="true" />}
    </label>
  )
}

function PasteTokenModal({ client, hasToken, onClose, onDone }: { client: Client; hasToken: boolean; onClose: () => void; onDone: () => void }) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)

  const save = async () => {
    if (token.trim().length < 20) return toast.error('Cole o token inteiro.')
    setBusy('save')
    try {
      await saveMetaToken(client.id, token.trim())
      toast.success(`${client.companyName}: token salvo`)
      onDone()
      onClose()
    } catch (err) {
      showError(err, 'Erro ao salvar o token')
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    const ok = await askConfirm({
      title: `Remover o token de ${client.companyName}?`,
      message: 'Os relatórios voltam a usar o token padrão da agência, se ele tiver acesso a esta conta.',
      confirmLabel: 'Remover',
      danger: true,
    })
    if (!ok) return
    setBusy('delete')
    try {
      await deleteMetaToken(client.id)
      toast.success(`${client.companyName}: token removido`)
      onDone()
      onClose()
    } catch (err) {
      showError(err, 'Erro ao remover o token')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Colar token: ${client.companyName}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-500">
          Cole um token gerado no Explorador da API do Graph, no Business Manager do cliente, com as permissões ads_read, read_insights e
          ads_management. Ele é conferido com o Meta e guardado criptografado. Depois de salvo, não aparece de novo.
        </p>
        <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Cole o token aqui" aria-label="Token do Meta Ads" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {hasToken ? (
            <Button variant="ghost" icon={<Trash2 size={14} />} onClick={remove} loading={busy === 'delete'} className="text-red-500 hover:bg-red-50">
              Remover token atual
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button icon={<KeyRound size={14} />} onClick={save} loading={busy === 'save'}>
              {hasToken ? 'Substituir' : 'Salvar token'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

type Filter = 'all' | 'pending'

/** Métricas > Contas e tokens: o ID da conta Meta, o token e o ID do Google
 *  de cada cliente num lugar só (antes ficavam no Planejamento de Campanha). */
export function AdAccountsPanel() {
  const { profile } = useAuth()
  const { isPrivacyMode } = usePrivacy()
  const { data: clients } = useClients()
  const [tokens, setTokens] = useState<MetaClientTokenRow[] | null>(null)
  const [tokensError, setTokensError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [renewFor, setRenewFor] = useState<{ client: Client; isNew: boolean } | null>(null)
  const [pasteFor, setPasteFor] = useState<Client | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [tests, setTests] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [announce, setAnnounce] = useState('')

  const loadTokens = () => {
    setTokensError(null)
    listMetaTokenStatuses()
      .then(setTokens)
      .catch((err) => {
        setTokens([])
        setTokensError(err instanceof Error ? err.message : 'Erro ao carregar os tokens')
      })
  }
  useEffect(loadTokens, [])

  const tokenBy = useMemo(() => new Map((tokens ?? []).map((t) => [t.clientId, t])), [tokens])

  const rows = useMemo(() => {
    return clients
      .filter((c) => (isClientInOperation(c) && hasContractedPaidTraffic(c)) || !!c.campaignPlanning?.acessos?.metaAdsAccountId || !!c.campaignPlanning?.acessos?.googleAdsAccountId)
      .filter((c) => c.status !== 'churned')
      .map((c) => {
        const svc = trafficServices(c)
        const acc = c.campaignPlanning?.acessos
        const metaId = acc?.metaAdsAccountId ? ensureActPrefix(acc.metaAdsAccountId) : ''
        const googleId = acc?.googleAdsAccountId ? maskGoogleAdsId(acc.googleAdsAccountId) : ''
        const tk = tokenText(tokenBy.get(c.id))
        const issues: string[] = []
        if (svc.meta && !metaId) issues.push('sem ID do Meta')
        if (svc.meta && (tk.level === 'none' || tk.level === 'red' || tk.level === 'yellow')) issues.push(tk.level === 'none' ? 'sem token' : tk.text.toLowerCase())
        if (svc.google && !googleId) issues.push('sem ID do Google')
        return { client: c, svc, metaId, googleId, tk, issues }
      })
      .sort((a, b) => b.issues.length - a.issues.length || a.client.companyName.localeCompare(b.client.companyName))
  }, [clients, tokenBy])

  const needle = search.trim().toLowerCase()
  const visible = rows.filter((r) => (filter === 'pending' ? r.issues.length > 0 : true) && (!needle || r.client.companyName.toLowerCase().includes(needle)))

  const summary = {
    total: rows.length,
    noMetaId: rows.filter((r) => r.svc.meta && !r.metaId).length,
    tokenIssue: rows.filter((r) => r.svc.meta && r.tk.level !== 'green' && r.tk.level !== 'unknown').length,
    noGoogleId: rows.filter((r) => r.svc.google && !r.googleId).length,
  }

  const test = async (r: (typeof rows)[number]) => {
    const id = normalizeMetaAccountId(r.metaId)
    if (!id) return
    setTesting(r.client.id)
    try {
      const res = await testMetaConnection(id, r.client.id)
      const body = await res.json().catch(() => ({}))
      const result = res.ok ? { ok: true, message: 'Conexão OK, conta encontrada' } : { ok: false, message: body?.error || `Erro ${res.status} no Meta` }
      setTests((t) => ({ ...t, [r.client.id]: result }))
      setAnnounce(`${r.client.companyName}: ${result.message}`)
    } catch (err) {
      setTests((t) => ({ ...t, [r.client.id]: { ok: false, message: err instanceof Error ? err.message : 'Falha de rede' } }))
    } finally {
      setTesting(null)
    }
  }

  const name = (c: Client) => (isPrivacyMode ? '••••••' : c.companyName)

  return (
    <div className="flex flex-col gap-4">
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Clientes de tráfego" value={summary.total} icon={Users} accent="blue" hint="Em operação" />
        <StatCard label="Sem ID do Meta" value={summary.noMetaId} icon={Plug} accent={summary.noMetaId ? 'amber' : 'green'} hint="Conta de anúncios" />
        <StatCard label="Token para ver" value={summary.tokenIssue} icon={KeyRound} accent={summary.tokenIssue ? 'amber' : 'green'} hint="Sem token, vencido ou vencendo" />
        <StatCard label="Sem ID do Google" value={summary.noGoogleId} icon={Plug} accent={summary.noGoogleId ? 'amber' : 'green'} hint="Customer ID" />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <label className="relative">
          <span className="sr-only">Buscar cliente</span>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            className="h-9 w-64 max-w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm outline-none focus:border-brand-600"
          />
        </label>
        <div role="group" aria-label="Filtrar clientes" className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
          {(
            [
              ['all', 'Todos'],
              ['pending', 'Com pendência'],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${filter === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" icon={<RefreshCw size={13} />} onClick={loadTokens} className="ml-auto">
          Atualizar tokens
        </Button>
      </div>

      {tokensError && <p className="text-sm text-red-600">Não consegui ler os tokens: {tokensError}</p>}

      <ul className="flex flex-col gap-2" aria-label={`Contas de ${visible.length} clientes`}>
        {visible.length === 0 && (
          <li className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
            {filter === 'pending' ? 'Nenhuma pendência. Tudo conectado.' : 'Nenhum cliente encontrado.'}
          </li>
        )}
        {visible.map((r) => {
          const { client: c } = r
          const row = tokenBy.get(c.id)
          const result = tests[c.id]
          const headingId = `acc-${c.id}`
          return (
            <li key={c.id}>
              <article aria-labelledby={headingId} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={isPrivacyMode ? 'Cliente' : c.companyName} photoURL={isPrivacyMode ? null : c.logoUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <h3 id={headingId} className="truncate text-sm font-semibold text-slate-900">
                      <Link to={`/clientes/${c.id}`} className="hover:text-brand-600">
                        {name(c)}
                      </Link>
                    </h3>
                    <p className="text-xs text-slate-500">
                      {r.issues.length ? (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <ShieldAlert size={12} aria-hidden="true" /> Falta: {r.issues.join(', ')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 size={12} aria-hidden="true" /> Tudo conectado
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className={`mt-3 grid gap-3 ${r.svc.meta && r.svc.google ? 'lg:grid-cols-[1.4fr_1fr]' : ''}`}>
                  {r.svc.meta && (
                    <section aria-label={`Meta Ads de ${c.companyName}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meta Ads</p>
                        {tokens === null ? (
                          <span className="text-xs text-slate-400">Lendo token…</span>
                        ) : (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.tk.tone}`}>{r.tk.text}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <IdField
                          label={`ID da conta Meta Ads de ${c.companyName}`}
                          value={r.metaId}
                          placeholder="act_000000000000000"
                          format={(v) => (v ? ensureActPrefix(v) : '')}
                          onSave={async (v) => {
                            if (!profile) return
                            await saveAccess(c, { metaAdsAccountId: v || undefined }, profile.id, profile.name)
                            toast.success(`${c.companyName}: ID do Meta salvo`)
                          }}
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => test(r)}
                          loading={testing === c.id}
                          disabled={!r.metaId}
                          aria-label={`Testar a conexão do Meta de ${c.companyName}`}
                        >
                          Testar
                        </Button>
                        <Button
                          size="sm"
                          variant={r.tk.level === 'green' || r.tk.level === 'unknown' ? 'secondary' : 'primary'}
                          icon={<KeyRound size={13} />}
                          onClick={() => setRenewFor({ client: c, isNew: !row })}
                          aria-label={`${c.companyName}: ${row ? 'renovar o token por 60 dias' : 'colocar o token do Meta'}`}
                        >
                          {row ? 'Renovar token' : 'Colocar token'}
                        </Button>
                        <button
                          type="button"
                          onClick={() => setPasteFor(c)}
                          className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
                          aria-label={`${c.companyName}: colar um token manualmente`}
                        >
                          Colar manual
                        </button>
                      </div>
                      {result && (
                        <p className={`mt-2 text-xs font-medium ${result.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                          {result.ok ? result.message : `Não conectou: ${result.message}`}
                        </p>
                      )}
                    </section>
                  )}
                  {r.svc.google && (
                    <section aria-label={`Google Ads de ${c.companyName}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Google Ads</p>
                      <IdField
                        label={`ID da conta Google Ads de ${c.companyName}`}
                        value={r.googleId}
                        placeholder="000-000-0000"
                        format={(v) => maskGoogleAdsId(v)}
                        onSave={async (v) => {
                          if (!profile) return
                          await saveAccess(c, { googleAdsAccountId: v.replace(/\D/g, '') || undefined }, profile.id, profile.name)
                          toast.success(`${c.companyName}: ID do Google salvo`)
                        }}
                      />
                    </section>
                  )}
                </div>
              </article>
            </li>
          )
        })}
      </ul>

      {renewFor && (
        <MetaTokenRenewModal
          open
          onClose={() => setRenewFor(null)}
          clientId={renewFor.client.id}
          clientName={renewFor.client.companyName}
          isNew={renewFor.isNew}
          onDone={loadTokens}
        />
      )}
      {pasteFor && <PasteTokenModal client={pasteFor} hasToken={tokenBy.has(pasteFor.id)} onClose={() => setPasteFor(null)} onDone={loadTokens} />}
    </div>
  )
}
