import { useEffect, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Save, Plus, Trash2, FileDown, KeyRound, ShieldCheck, Loader2, RefreshCw } from 'lucide-react'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { updateClient } from '../../services/clientService'
import { notifyAdminsOfAction } from '../../services/notificationService'
import { maskPhone } from '../../utils/masks'
import { dateInputToTimestamp, timestampToDateInput } from '../../utils/dateInput'
import { ensureActPrefix, normalizeMetaAccountId } from '../../utils/metaReportData'
import { getMetaTokenStatus, saveMetaToken, deleteMetaToken, type MetaTokenStatus } from '../../services/metaApi'
import { tokenValidity, fmtExpiry } from '../../utils/metaTokenValidity'
import { trafficServices } from '../../utils/clientServices'
import { metaTotals, googleTotals } from '../../utils/campaignPlanningStats'
import { MetaTokenRenewModal } from './MetaTokenRenewModal'
import {
  EMPTY_CAMPAIGN_PLANNING,
  EMPTY_CAMPAIGN_PLANNING_ACCESS,
  EMPTY_META_ADS_PLANNING,
  EMPTY_GOOGLE_ADS_PLANNING,
  META_FUNNEL_STAGE_LABEL,
  META_OBJECTIVE_LABEL,
  GOOGLE_ADS_NETWORK_LABEL,
  GOOGLE_BID_TYPE_LABEL,
  type Client,
  type CampaignPlanning,
  type CampaignPlanningAccess,
  type MetaAdsPlanning,
  type MetaCampaignItem,
  type GoogleAdsPlanning,
  type GoogleCampaignItem,
  type MetaFunnelStage,
  type MetaObjective,
  type GoogleAdsNetwork,
  type GoogleBidType,
  type PaidTrafficBriefing,
} from '../../types'

function toNumberOrUndefined(v: string) {
  return v === '' ? undefined : Number(v)
}

const toDateInputValue = timestampToDateInput

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function SectionTitle({ children }: { children: string }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</p>
}

function SubTitle({ children }: { children: string }) {
  return <p className="mb-1.5 text-sm font-semibold text-slate-700">{children}</p>
}

/** Cabeçalho de plataforma (Google/Meta) com barra de cor e contagem de
 *  estrutura ao vivo — campanhas / conjuntos-grupos / anúncios — pra dar a
 *  visão geral que hoje só aparecia depois de gerar o PDF. */
function PlatformHeader({
  accent,
  title,
  totals,
  unitLabel,
}: {
  accent: 'blue' | 'violet'
  title: string
  totals: { campanhas: number; conjuntos: number; anuncios: number }
  unitLabel: string
}) {
  const bar = accent === 'blue' ? 'bg-blue-500' : 'bg-violet-500'
  const chip = accent === 'blue' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className={`h-5 w-1.5 rounded-full ${bar}`} />
        <SectionTitle>{title}</SectionTitle>
      </div>
      {totals.campanhas > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${chip}`}>
            {totals.campanhas} {totals.campanhas === 1 ? 'campanha' : 'campanhas'}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${chip}`}>
            {totals.conjuntos} {unitLabel}
            {totals.conjuntos === 1 ? '' : 's'}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${chip}`}>
            {totals.anuncios} {totals.anuncios === 1 ? 'anúncio' : 'anúncios'}
          </span>
        </div>
      )}
    </div>
  )
}

function CalculatedField({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <div className="flex h-[38px] items-center rounded-lg border border-slate-100 bg-slate-50 px-3 text-sm text-slate-500">
        {value != null && !Number.isNaN(value) ? formatBRL(value) : '—'}
      </div>
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <div className="min-h-[38px] rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        {value || '—'}
      </div>
    </div>
  )
}

function composeIcpB2C(b: PaidTrafficBriefing): string {
  return (
    [
      b.b2cGenero && `Gênero: ${b.b2cGenero}`,
      b.b2cEstadoCivilFilhos && `Estado civil/filhos: ${b.b2cEstadoCivilFilhos}`,
      b.b2cFaixaEtaria && `Faixa etária: ${b.b2cFaixaEtaria}`,
      b.b2cEscolaridadeProfissao && `Escolaridade/profissão: ${b.b2cEscolaridadeProfissao}`,
      b.b2cRegiao && `Região: ${b.b2cRegiao}`,
    ]
      .filter(Boolean)
      .join(' · ')
  )
}

function composeIcpB2B(b: PaidTrafficBriefing): string {
  return (
    [
      b.b2bSetor && `Setor: ${b.b2bSetor}`,
      b.b2bFaturamentoMinimo != null && `Faturamento mínimo: ${b.b2bFaturamentoMinimo}`,
      b.b2bQuantidadeFuncionarios && `Nº de funcionários: ${b.b2bQuantidadeFuncionarios}`,
      b.b2bCargoDecisor && `Cargo do decisor: ${b.b2bCargoDecisor}`,
      b.b2bLocalizacao && `Localização: ${b.b2bLocalizacao}`,
    ]
      .filter(Boolean)
      .join(' · ')
  )
}

function mergeCampaignPlanning(saved?: CampaignPlanning): CampaignPlanning {
  const acessos = { ...EMPTY_CAMPAIGN_PLANNING_ACCESS, ...saved?.acessos }
  // Sempre exibe o id da conta Meta Ads com o prefixo "act_".
  if (acessos.metaAdsAccountId) acessos.metaAdsAccountId = ensureActPrefix(acessos.metaAdsAccountId)
  return {
    ...EMPTY_CAMPAIGN_PLANNING,
    ...saved,
    acessos,
    metaAds: { ...EMPTY_META_ADS_PLANNING, ...saved?.metaAds, campanhas: saved?.metaAds?.campanhas ?? [] },
    googleAds: { ...EMPTY_GOOGLE_ADS_PLANNING, ...saved?.googleAds, campanhas: saved?.googleAds?.campanhas ?? [] },
  }
}

export function ClientCampaignPlanningPanel({ client }: { client: Client }) {
  const { profile } = useAuth()
  const svc = trafficServices(client)
  // Numeração das seções depende de quais planejamentos aparecem.
  const secMeta = 2
  const secGoogle = svc.meta ? 3 : 2
  const secPublico = 2 + (svc.meta ? 1 : 0) + (svc.google ? 1 : 0)
  const secObs = secPublico + 1
  const [form, setForm] = useState<CampaignPlanning>(mergeCampaignPlanning(client.campaignPlanning))
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Token de acesso Meta Ads específico deste cliente — nunca fica no
  // Firestore/`campaignPlanning` como os demais campos de "Acessos": vive
  // numa coleção server-only, criptografado (ver api/_lib/metaTokenStore.js).
  // Aqui só guardamos o STATUS (configurado? por quem? quando?) — o valor em
  // si nunca volta pro frontend depois de salvo.
  const [tokenStatus, setTokenStatus] = useState<MetaTokenStatus | null>(null)
  const [tokenStatusLoading, setTokenStatusLoading] = useState(true)
  const [tokenInput, setTokenInput] = useState('')
  const [tokenSaving, setTokenSaving] = useState(false)
  const [tokenDeleting, setTokenDeleting] = useState(false)
  const [renewOpen, setRenewOpen] = useState(false)

  const refreshTokenStatus = () => {
    getMetaTokenStatus(client.id)
      .then(setTokenStatus)
      .catch((err) => {
        console.error(err)
      })
  }

  // Resync only on client switch — see ClientBriefingPanel: depending on the
  // sub-object identity would wipe unsaved edits on every `clients` snapshot.
  useEffect(() => {
    setForm(mergeCampaignPlanning(client.campaignPlanning))
    setTestResult(null)
    setTokenInput('')
    setTokenStatusLoading(true)
    getMetaTokenStatus(client.id)
      .then(setTokenStatus)
      .catch((err) => {
        console.error(err)
        setTokenStatus(null)
      })
      .finally(() => setTokenStatusLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id])

  const handleTestConnection = async () => {
    const accountId = normalizeMetaAccountId(form.acessos.metaAdsAccountId ?? '')
    if (!accountId) {
      setTestResult({ ok: false, message: 'Preencha o ID da conta Meta Ads antes de testar.' })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const params = new URLSearchParams({ account_id: accountId, date_preset: 'last_7d', client_id: client.id })
      const res = await fetch(`/api/meta/insights?${params.toString()}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setTestResult({ ok: false, message: body?.error || `Erro ${res.status} ao consultar a API do Meta` })
        return
      }
      setTestResult({ ok: true, message: '✅ Conexão OK — conta encontrada' })
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Falha de rede ao consultar a API do Meta' })
    } finally {
      setTesting(false)
    }
  }

  const handleSaveToken = async () => {
    if (!tokenInput.trim()) {
      toast.error('Cole o token gerado no Explorador da API do Graph.')
      return
    }
    setTokenSaving(true)
    try {
      await saveMetaToken(client.id, tokenInput.trim())
      setTokenInput('')
      setTokenStatus(await getMetaTokenStatus(client.id))
      toast.success('Token salvo — relatórios deste cliente já usam esse token.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar token')
    } finally {
      setTokenSaving(false)
    }
  }

  const handleDeleteToken = async () => {
    if (!confirm('Remover o token deste cliente? Os relatórios voltam a usar o token padrão da agência (se houver acesso).')) return
    setTokenDeleting(true)
    try {
      await deleteMetaToken(client.id)
      setTokenStatus(await getMetaTokenStatus(client.id))
      toast.success('Token removido')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover token')
    } finally {
      setTokenDeleting(false)
    }
  }

  const set = <K extends keyof CampaignPlanning>(key: K, value: CampaignPlanning[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const setAccess = <K extends keyof CampaignPlanningAccess>(key: K, value: CampaignPlanningAccess[K]) =>
    setForm((f) => ({ ...f, acessos: { ...f.acessos, [key]: value } }))

  const setMeta = <K extends keyof MetaAdsPlanning>(key: K, value: MetaAdsPlanning[K]) =>
    setForm((f) => ({ ...f, metaAds: { ...f.metaAds, [key]: value } }))

  const setGoogle = <K extends keyof GoogleAdsPlanning>(key: K, value: GoogleAdsPlanning[K]) =>
    setForm((f) => ({ ...f, googleAds: { ...f.googleAds, [key]: value } }))

  const addMetaCampaign = () =>
    setMeta('campanhas', [...form.metaAds.campanhas, { id: crypto.randomUUID() }])
  const updateMetaCampaign = (id: string, patch: Partial<MetaCampaignItem>) =>
    setMeta('campanhas', form.metaAds.campanhas.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  const removeMetaCampaign = (id: string) =>
    setMeta('campanhas', form.metaAds.campanhas.filter((c) => c.id !== id))

  const addGoogleCampaign = () =>
    setGoogle('campanhas', [...form.googleAds.campanhas, { id: crypto.randomUUID() }])
  const updateGoogleCampaign = (id: string, patch: Partial<GoogleCampaignItem>) =>
    setGoogle('campanhas', form.googleAds.campanhas.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  const removeGoogleCampaign = (id: string) =>
    setGoogle('campanhas', form.googleAds.campanhas.filter((c) => c.id !== id))

  const metaVerbaDiaria =
    form.metaAds.verbaMensal && form.metaAds.diasDoMes ? form.metaAds.verbaMensal / form.metaAds.diasDoMes : undefined
  const googleVerbaDiaria =
    form.googleAds.verbaMensal && form.googleAds.diasDoMes ? form.googleAds.verbaMensal / form.googleAds.diasDoMes : undefined

  const metaStats = metaTotals(form.metaAds)
  const googleStats = googleTotals(form.googleAds)

  const funnelPercents = [
    form.metaAds.distribuicaoTopoPercent,
    form.metaAds.distribuicaoMeioPercent,
    form.metaAds.distribuicaoFundoPercent,
  ]
  const funnelTouched = funnelPercents.some((p) => p != null)
  const funnelSum = funnelPercents.reduce((sum: number, p) => sum + (p ?? 0), 0)

  const funnelVerba = (percent?: number) =>
    metaVerbaDiaria != null && percent != null ? (metaVerbaDiaria * percent) / 100 : undefined

  const handleSave = async () => {
    if (!profile) return
    if (funnelTouched && funnelSum !== 100) {
      toast.error('A distribuição por funil (Topo + Meio + Fundo) deve somar 100%.')
      return
    }
    setSaving(true)
    try {
      const payload: CampaignPlanning = {
        ...form,
        acessos: {
          ...form.acessos,
          // Sempre grava o id da conta Meta Ads com o prefixo "act_".
          metaAdsAccountId: ensureActPrefix(form.acessos.metaAdsAccountId) || undefined,
        },
        preenchidoPor: profile.name,
        filledAt: Timestamp.now(),
      }
      const first = !client.campaignPlanning?.filledAt
      await updateClient(client.id, { campaignPlanning: payload }, profile.id, profile.name)
      await notifyAdminsOfAction({
        type: 'planning_saved',
        message: `${profile.name} ${first ? 'salvou' : 'atualizou'} o planejamento de campanha — ${client.companyName}`,
        actorId: profile.id,
        actorName: profile.name,
        entityType: 'client',
        entityId: client.id,
      })
      toast.success('Planejamento salvo')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar planejamento')
    } finally {
      setSaving(false)
    }
  }

  const handleGeneratePdf = async () => {
    if (funnelTouched && funnelSum !== 100) {
      toast.error('A distribuição por funil (Topo + Meio + Fundo) deve somar 100%.')
      return
    }
    setGenerating(true)
    try {
      const { generateCampaignPlanningPdf } = await import('../../utils/campaignPlanningPdf')
      await generateCampaignPlanningPdf(client, form)
      toast.success('Apresentação gerada')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao gerar apresentação')
    } finally {
      setGenerating(false)
    }
  }

  const lastFilled = client.campaignPlanning?.filledAt
  const briefing = client.paidTrafficBriefing
  const briefingFilled = !!briefing?.filledAt

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-slate-400">
        Preenchido pelos gestores da conta.
        {lastFilled && (
          <>
            {' '}
            Última vez salvo por <strong>{client.campaignPlanning?.preenchidoPor}</strong> em{' '}
            {format(lastFilled.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.
          </>
        )}
      </p>

      {/* SEÇÃO 1 — ACESSOS DAS CONTAS */}
      <div>
        <SectionTitle>1. Acessos das contas</SectionTitle>

        <div className="flex flex-col gap-4">
          <Field label="URL do site">
            <Input value={form.acessos.siteUrl ?? ''} onChange={(e) => setAccess('siteUrl', e.target.value)} />
          </Field>

          <Field label="Link do perfil do Instagram">
            <Input value={form.acessos.instagramLink ?? ''} onChange={(e) => setAccess('instagramLink', e.target.value)} />
          </Field>

          {svc.google && (
          <div>
            <SubTitle>Google Tag Manager</SubTitle>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={!!form.acessos.gtmContainerCriado}
                  onChange={(e) => setAccess('gtmContainerCriado', e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                />
                Container GTM criado
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={!!form.acessos.gtmInstaladoNoSite}
                  onChange={(e) => setAccess('gtmInstaladoNoSite', e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                />
                GTM instalado no site
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={!!form.acessos.gtmRastreamentoCompleto}
                  onChange={(e) => setAccess('gtmRastreamentoCompleto', e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                />
                Rastreamento completo configurado
              </label>
            </div>
          </div>
          )}

          {svc.google && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={!!form.acessos.gmbConfigurado}
              onChange={(e) => setAccess('gmbConfigurado', e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
            />
            Google Meu Negócio configurado
          </label>
          )}

          <Field label="WhatsApp para campanhas — número com DDD">
            <Input
              value={form.acessos.whatsappNumero ?? ''}
              onChange={(e) => setAccess('whatsappNumero', maskPhone(e.target.value))}
              placeholder="(00) 00000-0000"
            />
          </Field>

          <Field label="Link da pasta Drive do cliente">
            <Input value={form.acessos.linkDrive ?? ''} onChange={(e) => setAccess('linkDrive', e.target.value)} />
          </Field>

          {svc.meta && (
          <>
          <div>
            <Field label="ID da conta Meta Ads">
              <div className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  value={form.acessos.metaAdsAccountId ?? ''}
                  onChange={(e) => setAccess('metaAdsAccountId', e.target.value)}
                  onBlur={(e) => setAccess('metaAdsAccountId', ensureActPrefix(e.target.value) || undefined)}
                  placeholder="Ex: 27994847453538948 (o act_ é adicionado automaticamente)"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleTestConnection}
                  loading={testing}
                  className="shrink-0"
                >
                  {testing ? 'Testando…' : 'Testar conexão'}
                </Button>
              </div>
            </Field>
            {testResult && (
              <p
                className={`mt-1 whitespace-pre-wrap text-xs font-medium ${
                  testResult.ok ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {testResult.ok ? testResult.message : `❌ ${testResult.message}`}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              Encontre em Meta Business Suite → Gerenciador de Anúncios → ID da conta
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <SubTitle>Token de Acesso Meta Ads</SubTitle>
            <p className="mb-2 text-xs text-slate-400">
              Necessário quando a conta de anúncios deste cliente fica no Business Manager DELE, fora do alcance do
              usuário automático da Arrow Shot. Gere um token no{' '}
              <a
                href="https://developers.facebook.com/tools/explorer/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 underline"
              >
                Explorador da API do Graph
              </a>{' '}
              do Business Manager do cliente, com as permissões <code className="text-[11px]">ads_read</code>,{' '}
              <code className="text-[11px]">read_insights</code> e <code className="text-[11px]">ads_management</code>.
            </p>

            {tokenStatusLoading ? (
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <Loader2 size={12} className="animate-spin" /> Verificando status do token…
              </p>
            ) : tokenStatus?.hasToken ? (
              <div className="mb-2 flex flex-col gap-1.5 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      tokenValidity(tokenStatus).badgeClass
                    }`}
                  >
                    {tokenValidity(tokenStatus).label}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDeleteToken}
                    loading={tokenDeleting}
                    className="text-red-500 hover:bg-red-50"
                  >
                    Remover
                  </Button>
                </div>
                <span className="flex items-center gap-1.5 text-slate-500">
                  <ShieldCheck size={12} />
                  {tokenStatus.updatedBy ? (
                    <>
                      Configurado por <strong>{tokenStatus.updatedBy}</strong>
                    </>
                  ) : (
                    'Configurado'
                  )}
                  {tokenStatus.updatedAt && (
                    <> em {format(new Date(tokenStatus.updatedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</>
                  )}
                  {tokenStatus.expiresAt && <> · expira em {fmtExpiry(tokenStatus.expiresAt)}</>}
                </span>
              </div>
            ) : (
              <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                  ⚪ Token não configurado
                </span>
                — os relatórios usam o token padrão da agência (se ele tiver acesso a esta conta).
              </p>
            )}

            <div className="mb-2 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<RefreshCw size={13} />}
                onClick={() => setRenewOpen(true)}
              >
                🔄 Renovar token (60 dias)
              </Button>
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                Ou colar um token manualmente
              </summary>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  className="flex-1"
                  type="password"
                  autoComplete="off"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Cole o token aqui — nunca é exibido novamente após salvar"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<KeyRound size={13} />}
                  onClick={handleSaveToken}
                  loading={tokenSaving}
                  className="shrink-0"
                >
                  {tokenStatus?.hasToken ? 'Substituir' : 'Salvar'}
                </Button>
              </div>
              <p className="mt-1 text-slate-400">
                O token é validado com a API do Meta e gravado criptografado no servidor — nunca aparece em logs nem é
                devolvido ao navegador depois de salvo. Prefira o botão "Renovar" acima: ele gera um token de 60 dias
                automaticamente.
              </p>
            </details>
          </div>
          </>
          )}
        </div>
      </div>

      <MetaTokenRenewModal
        open={renewOpen}
        onClose={() => setRenewOpen(false)}
        clientId={client.id}
        clientName={client.companyName}
        onDone={refreshTokenStatus}
      />

      {/* SEÇÃO 2 — PLANEJAMENTO META ADS */}
      {svc.meta && (
      <div>
        <PlatformHeader accent="violet" title={`${secMeta}. Planejamento Meta Ads`} totals={metaStats} unitLabel="conjunto" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Verba mensal Meta Ads (R$)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.metaAds.verbaMensal ?? ''}
              onChange={(e) => setMeta('verbaMensal', toNumberOrUndefined(e.target.value))}
            />
          </Field>
          <Field label="Dias do mês">
            <Input
              type="number"
              min="1"
              max="31"
              value={form.metaAds.diasDoMes ?? 30}
              onChange={(e) => setMeta('diasDoMes', toNumberOrUndefined(e.target.value))}
            />
          </Field>
          <CalculatedField label="Verba diária" value={metaVerbaDiaria} />
        </div>

        <div className="mt-4">
          <SubTitle>Distribuição por funil</SubTitle>
          {funnelTouched && funnelSum !== 100 && (
            <p className="mb-2 text-xs font-medium text-red-500">As três porcentagens devem somar 100% (atual: {funnelSum}%).</p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                ['topo', 'distribuicaoTopoPercent'],
                ['meio', 'distribuicaoMeioPercent'],
                ['fundo', 'distribuicaoFundoPercent'],
              ] as [MetaFunnelStage, 'distribuicaoTopoPercent' | 'distribuicaoMeioPercent' | 'distribuicaoFundoPercent'][]
            ).map(([stage, key]) => (
              <div key={stage} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
                <Field label={`${META_FUNNEL_STAGE_LABEL[stage]} — % do orçamento`}>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={form.metaAds[key] ?? ''}
                    onChange={(e) => setMeta(key, toNumberOrUndefined(e.target.value))}
                  />
                </Field>
                <CalculatedField label="Verba calculada" value={funnelVerba(form.metaAds[key])} />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <SubTitle>Campanhas planejadas</SubTitle>
          <div className="flex flex-col gap-3">
            {form.metaAds.campanhas.map((c) => (
              <div key={c.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Field label="Etapa do funil">
                    <Select
                      value={c.etapaFunil ?? ''}
                      onChange={(e) => updateMetaCampaign(c.id, { etapaFunil: (e.target.value || undefined) as MetaFunnelStage })}
                    >
                      <option value="">Selecione...</option>
                      {(Object.entries(META_FUNNEL_STAGE_LABEL) as [MetaFunnelStage, string][]).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Objetivo">
                    <Select
                      value={c.objetivo ?? ''}
                      onChange={(e) => updateMetaCampaign(c.id, { objetivo: (e.target.value || undefined) as MetaObjective })}
                    >
                      <option value="">Selecione...</option>
                      {(Object.entries(META_OBJECTIVE_LABEL) as [MetaObjective, string][]).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Nome da campanha">
                    <Input
                      value={c.nomeCampanha ?? ''}
                      onChange={(e) => updateMetaCampaign(c.id, { nomeCampanha: e.target.value })}
                    />
                  </Field>
                  <Field label="Nome do conjunto de anúncios">
                    <Input
                      value={c.nomeConjunto ?? ''}
                      onChange={(e) => updateMetaCampaign(c.id, { nomeConjunto: e.target.value })}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Descrição da campanha">
                      <Input value={c.descricao ?? ''} onChange={(e) => updateMetaCampaign(c.id, { descricao: e.target.value })} />
                    </Field>
                  </div>
                  <Field label="Públicos">
                    <Input value={c.publicos ?? ''} onChange={(e) => updateMetaCampaign(c.id, { publicos: e.target.value })} />
                  </Field>
                  <Field label="Verba diária (R$)">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={c.verbaDiaria ?? ''}
                      onChange={(e) => updateMetaCampaign(c.id, { verbaDiaria: toNumberOrUndefined(e.target.value) })}
                    />
                  </Field>
                  <Field label="Qtd. conjuntos de anúncios">
                    <Input
                      type="number"
                      min="1"
                      value={c.qtdConjuntos ?? ''}
                      onChange={(e) => updateMetaCampaign(c.id, { qtdConjuntos: toNumberOrUndefined(e.target.value) })}
                      placeholder="1"
                    />
                  </Field>
                  <Field label="Qtd. anúncios">
                    <Input
                      type="number"
                      min="1"
                      value={c.qtdAnuncios ?? ''}
                      onChange={(e) => updateMetaCampaign(c.id, { qtdAnuncios: toNumberOrUndefined(e.target.value) })}
                      placeholder="1"
                    />
                  </Field>
                  <Field label="Data de criação">
                    <Input
                      type="date"
                      value={toDateInputValue(c.dataCriacao)}
                      onChange={(e) =>
                        updateMetaCampaign(c.id, { dataCriacao: dateInputToTimestamp(e.target.value) })
                      }
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Observações">
                      <Input value={c.observacoes ?? ''} onChange={(e) => updateMetaCampaign(c.id, { observacoes: e.target.value })} />
                    </Field>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={13} />}
                  onClick={() => removeMetaCampaign(c.id)}
                  className="self-start text-red-500 hover:bg-red-50"
                >
                  Remover campanha
                </Button>
              </div>
            ))}
            <Button variant="secondary" size="sm" icon={<Plus size={13} />} onClick={addMetaCampaign} className="self-start">
              Adicionar campanha
            </Button>
          </div>
        </div>

        <div className="mt-4 sm:w-1/3">
          <Field label="Número máximo de conjuntos de anúncios">
            <Input
              type="number"
              min="0"
              value={form.metaAds.maxConjuntosAnuncios ?? ''}
              onChange={(e) => setMeta('maxConjuntosAnuncios', toNumberOrUndefined(e.target.value))}
            />
          </Field>
        </div>

        <div className="mt-4">
          <SubTitle>Segmentação geográfica</SubTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Cidades desejadas (bairro entre parênteses, se houver)">
              <Textarea
                rows={4}
                value={form.metaAds.cidadesDesejadas ?? ''}
                onChange={(e) => setMeta('cidadesDesejadas', e.target.value)}
                placeholder={'Uma por linha. Ex: São Paulo (Moema)'}
              />
            </Field>
            <Field label="Cidades excluídas">
              <Textarea
                rows={4}
                value={form.metaAds.cidadesExcluidas ?? ''}
                onChange={(e) => setMeta('cidadesExcluidas', e.target.value)}
                placeholder="Uma por linha"
              />
            </Field>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Palavras-chave / interesses positivos">
            <Textarea
              rows={4}
              value={form.metaAds.palavrasChavePositivas ?? ''}
              onChange={(e) => setMeta('palavrasChavePositivas', e.target.value)}
              placeholder="Uma por linha"
            />
          </Field>
          <Field label="Palavras-chave / interesses negativos">
            <Textarea
              rows={4}
              value={form.metaAds.palavrasChaveNegativas ?? ''}
              onChange={(e) => setMeta('palavrasChaveNegativas', e.target.value)}
              placeholder="Uma por linha"
            />
          </Field>
        </div>
      </div>

      )}

      {/* SEÇÃO 3 — PLANEJAMENTO GOOGLE ADS */}
      {svc.google && (
      <div>
        <PlatformHeader accent="blue" title={`${secGoogle}. Planejamento Google Ads`} totals={googleStats} unitLabel="grupo" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Verba mensal Google Ads (R$)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.googleAds.verbaMensal ?? ''}
              onChange={(e) => setGoogle('verbaMensal', toNumberOrUndefined(e.target.value))}
            />
          </Field>
          <Field label="Dias do mês">
            <Input
              type="number"
              min="1"
              max="31"
              value={form.googleAds.diasDoMes ?? 30}
              onChange={(e) => setGoogle('diasDoMes', toNumberOrUndefined(e.target.value))}
            />
          </Field>
          <CalculatedField label="Verba diária" value={googleVerbaDiaria} />
        </div>

        <div className="mt-4">
          <SubTitle>Campanhas planejadas</SubTitle>
          <div className="flex flex-col gap-3">
            {form.googleAds.campanhas.map((c) => (
              <div key={c.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Field label="Rede">
                    <Select
                      value={c.rede ?? ''}
                      onChange={(e) => updateGoogleCampaign(c.id, { rede: (e.target.value || undefined) as GoogleAdsNetwork })}
                    >
                      <option value="">Selecione...</option>
                      {(Object.entries(GOOGLE_ADS_NETWORK_LABEL) as [GoogleAdsNetwork, string][]).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Nome da campanha">
                    <Input value={c.nomeCampanha ?? ''} onChange={(e) => updateGoogleCampaign(c.id, { nomeCampanha: e.target.value })} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Grupos de anúncios">
                      <Input
                        value={c.gruposAnuncios ?? ''}
                        onChange={(e) => updateGoogleCampaign(c.id, { gruposAnuncios: e.target.value })}
                      />
                    </Field>
                  </div>
                  <Field label="Tipo de lance">
                    <Select
                      value={c.tipoLance ?? ''}
                      onChange={(e) => updateGoogleCampaign(c.id, { tipoLance: (e.target.value || undefined) as GoogleBidType })}
                    >
                      <option value="">Selecione...</option>
                      {(Object.entries(GOOGLE_BID_TYPE_LABEL) as [GoogleBidType, string][]).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Verba diária (R$)">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={c.verbaDiaria ?? ''}
                      onChange={(e) => updateGoogleCampaign(c.id, { verbaDiaria: toNumberOrUndefined(e.target.value) })}
                    />
                  </Field>
                  <Field label="Qtd. grupos de anúncios">
                    <Input
                      type="number"
                      min="1"
                      value={c.qtdGrupos ?? ''}
                      onChange={(e) => updateGoogleCampaign(c.id, { qtdGrupos: toNumberOrUndefined(e.target.value) })}
                      placeholder="1"
                    />
                  </Field>
                  <Field label="Qtd. anúncios">
                    <Input
                      type="number"
                      min="1"
                      value={c.qtdAnuncios ?? ''}
                      onChange={(e) => updateGoogleCampaign(c.id, { qtdAnuncios: toNumberOrUndefined(e.target.value) })}
                      placeholder="1"
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Observações">
                      <Input
                        value={c.observacoes ?? ''}
                        onChange={(e) => updateGoogleCampaign(c.id, { observacoes: e.target.value })}
                      />
                    </Field>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={13} />}
                  onClick={() => removeGoogleCampaign(c.id)}
                  className="self-start text-red-500 hover:bg-red-50"
                >
                  Remover campanha
                </Button>
              </div>
            ))}
            <Button variant="secondary" size="sm" icon={<Plus size={13} />} onClick={addGoogleCampaign} className="self-start">
              Adicionar campanha
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <SubTitle>Segmentação geográfica</SubTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Cidades desejadas (bairro entre parênteses, se houver)">
              <Textarea
                rows={4}
                value={form.googleAds.cidadesDesejadas ?? ''}
                onChange={(e) => setGoogle('cidadesDesejadas', e.target.value)}
                placeholder={'Uma por linha. Ex: São Paulo (Moema)'}
              />
            </Field>
            <Field label="Cidades excluídas">
              <Textarea
                rows={4}
                value={form.googleAds.cidadesExcluidas ?? ''}
                onChange={(e) => setGoogle('cidadesExcluidas', e.target.value)}
                placeholder="Uma por linha"
              />
            </Field>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Palavras-chave positivas">
            <Textarea
              rows={4}
              value={form.googleAds.palavrasChavePositivas ?? ''}
              onChange={(e) => setGoogle('palavrasChavePositivas', e.target.value)}
              placeholder="Uma por linha"
            />
          </Field>
          <Field label="Palavras-chave negativas">
            <Textarea
              rows={4}
              value={form.googleAds.palavrasChaveNegativas ?? ''}
              onChange={(e) => setGoogle('palavrasChaveNegativas', e.target.value)}
              placeholder="Uma por linha"
            />
          </Field>
        </div>
      </div>
      )}

      {/* SEÇÃO 4 — PÚBLICO-ALVO (somente leitura, do Briefing de Tráfego Pago) */}
      <div>
        <SectionTitle>{`${secPublico}. Público-alvo`}</SectionTitle>
        {!briefingFilled ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
            Preencha o Briefing de Tráfego Pago para ver os dados de público-alvo aqui.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ReadOnlyField label="Perfil do cliente ideal (ICP B2C)" value={composeIcpB2C(briefing!)} />
            <ReadOnlyField label="Perfil do cliente ideal (ICP B2B)" value={composeIcpB2B(briefing!)} />
            <ReadOnlyField label="Principal dor do cliente" value={briefing!.b2cDorPrincipal ?? ''} />
            <ReadOnlyField label="Objeção mais comum" value={briefing!.objecaoComum ?? ''} />
          </div>
        )}
      </div>

      {/* SEÇÃO 5 — OBSERVAÇÕES GERAIS */}
      <div>
        <SectionTitle>{`${secObs}. Observações gerais`}</SectionTitle>
        <Textarea rows={3} value={form.observacoesGerais ?? ''} onChange={(e) => set('observacoesGerais', e.target.value)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<Save size={14} />} onClick={handleSave} loading={saving}>
          Salvar planejamento
        </Button>
        <Button
          variant="secondary"
          icon={<FileDown size={14} />}
          onClick={handleGeneratePdf}
          loading={generating}
        >
          Gerar apresentação
        </Button>
      </div>
    </div>
  )
}
