import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { useProducts } from '../../hooks/useProducts'
import { createClient, updateClient } from '../../services/clientService'
import { createInitialWorkflowTasks, createLandingPageWorkflowTasks } from '../../services/clientWorkflowTemplates'
import { logActivity } from '../../services/activityService'
import { notifyAdminsOfAction } from '../../services/notificationService'
import { removeClientBirthdays } from '../../services/birthdayService'
import { uploadClientLogo, removeClientLogo } from '../../services/clientLogoService'
import { ClientLogoField } from './ClientLogoField'
import { computedPrice, discountLabel, formatBRL } from '../../utils/pricing'
import { modulesFromProducts, productModules, resolveServices, PRODUCT_MODULE_SHORT } from '../../utils/productModules'
import { maskPhone, isPhoneComplete, maskDocument, maskCurrencyInput, parseCurrencyToNumber, maskCep, isCepComplete } from '../../utils/masks'
import { dateInputToTimestamp, timestampToDateInput } from '../../utils/dateInput'
import { fetchAddressByCep } from '../../services/viaCepService'
import { BRAZIL_STATES } from '../../utils/brazilStates'
import {
  CLIENT_PACKAGE_LABEL,
  CLIENT_STATUS_LABEL,
  CLIENT_CATEGORY_LABEL,
  STYLE_CATALOG_DESCRIPTION,
  STYLE_CATALOG_LABEL,
  getClientOwnerIds,
  type Client,
  type ClientCategory,
  type ClientPackage,
  type ClientServiceContract,
  type ClientStatus,
  type StyleCatalog,
} from '../../types/client'
import type { DiscountType, Product } from '../../types/product'
import { LANDING_PAGE_TYPE_LABEL, type LandingPageType } from '../../types/landingPage'
import { showError } from '../../utils/notifyError'

const WHATSAPP_GROUP_PREFIX = 'https://chat.whatsapp.com/'

/** Preço de um serviço contratado, em edição (valores em texto). */
type ContractDraft = { tierId: string; discountId: string; customType: DiscountType; customValue: string; price: string; priceTouched: boolean }
const CUSTOM_DISCOUNT = '__custom'

function draftContract(d: ContractDraft): Pick<ClientServiceContract, 'tierId' | 'discountId' | 'customDiscount'> {
  const custom = d.discountId === CUSTOM_DISCOUNT && Number(d.customValue) > 0
  return {
    tierId: d.tierId || null,
    discountId: d.discountId && d.discountId !== CUSTOM_DISCOUNT ? d.discountId : null,
    customDiscount: custom ? { type: d.customType, value: Number(d.customValue) } : null,
  }
}

/** Valor calculado (tabela − desconto) já no formato da máscara de R$, ou ''. */
function calcPriceMask(product: Product, d: ContractDraft): string {
  const v = computedPrice(product, draftContract(d))
  return v == null ? '' : maskCurrencyInput(String(Math.round(v * 100)))
}

function newDraft(product: Product): ContractDraft {
  const d: ContractDraft = { tierId: product.tiers?.[0]?.id ?? '', discountId: '', customType: 'percent', customValue: '', price: '', priceTouched: false }
  return { ...d, price: calcPriceMask(product, d) }
}

const EMPTY = {
  companyName: '',
  whatsapp: '',
  city: '',
  segment: '',
  document: '',
  addressStreet: '',
  addressComplement: '',
  addressCity: '',
  addressState: '',
  addressZip: '',
  whatsappGroupLink: '',
  package: '' as ClientPackage | '',
  styleCatalog: '' as StyleCatalog | '',
  ownerIds: [] as string[],
  monthlyValue: '',
  contractStartDate: '',
  notes: '',
  status: 'prospect' as ClientStatus,
  churnReason: '',
  categoria: '' as ClientCategory | '',
  socialMedia: false,
  paidTraffic: false,
  metaAds: false,
  googleAds: false,
  landingPage: false,
  landingPageType: '' as LandingPageType | '',
  contractedProductIds: [] as string[],
  contracts: {} as Record<string, ContractDraft>,
}

const toDateInputValue = timestampToDateInput

const MODULE_LABEL: Record<string, string> = {
  socialMedia: 'Social Mídia',
  paidTraffic: 'Tráfego Pago',
  metaAds: 'Meta Ads',
  googleAds: 'Google Ads',
  landingPage: 'Landing Page',
}

/** Descreve uma expansão de contrato (novo módulo ou aumento de valor) para
 *  registrar como atividade `upsell` — alimenta o card Upsell do Dashboard.
 *  Retorna `null` quando nada foi adicionado. */
function describeUpsell(
  before: Pick<Client, 'modules' | 'monthlyValue'>,
  afterModules: Record<string, boolean | undefined>,
  afterValue?: number
): string | null {
  const added = Object.keys(MODULE_LABEL).filter(
    (k) => afterModules[k] && !(before.modules as Record<string, boolean | undefined> | undefined)?.[k]
  )
  const oldValue = before.monthlyValue ?? 0
  const parts: string[] = []
  if (added.length > 0) parts.push(added.map((k) => MODULE_LABEL[k]).join(' + '))
  if (afterValue != null && afterValue > oldValue && oldValue > 0) {
    parts.push(
      `valor ${oldValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} → ${afterValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
    )
  }
  return parts.length > 0 ? parts.join(', ') : null
}

/** O contrário do upsell: serviço removido ou valor mensal menor, com o
 *  cliente continuando ativo. `amount` = quanto o valor mensal caiu. */
function describeDownsell(
  before: Pick<Client, 'modules' | 'monthlyValue'>,
  afterModules: Record<string, boolean | undefined>,
  afterValue?: number
): { text: string; amount?: number } | null {
  const removed = Object.keys(MODULE_LABEL).filter(
    (k) => !afterModules[k] && (before.modules as Record<string, boolean | undefined> | undefined)?.[k]
  )
  const oldValue = before.monthlyValue ?? 0
  const parts: string[] = []
  if (removed.length > 0) parts.push(`tirou ${removed.map((k) => MODULE_LABEL[k]).join(' + ')}`)
  const dropped = afterValue != null && afterValue > 0 && afterValue < oldValue
  if (dropped) {
    parts.push(
      `valor ${oldValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} → ${afterValue!.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
    )
  }
  return parts.length > 0 ? { text: parts.join(', '), amount: dropped ? oldValue - afterValue! : undefined } : null
}

/** Cliente com menos de 30 dias de contrato: mudança de serviço/valor é
 *  ainda o cadastro sendo completado, não upsell nem downsell. */
function isNewClient(client: Pick<Client, 'contractStartDate' | 'createdAt'>): boolean {
  const start = client.contractStartDate?.toDate?.() ?? client.createdAt?.toDate?.()
  return !!start && Date.now() - start.getTime() < 30 * 24 * 60 * 60 * 1000
}

export function ClientFormModal({
  open,
  onClose,
  client,
}: {
  open: boolean
  onClose: () => void
  client?: Client | null
}) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const { data: products, loading: productsLoading } = useProducts()
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [createTasks, setCreateTasks] = useState(true)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoRemoved, setLogoRemoved] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  // Enquanto a pessoa não digitar o valor mensal, ele acompanha a soma dos serviços.
  const [monthlyTouched, setMonthlyTouched] = useState(false)

  // ---- Serviços: a fonte é o catálogo do Dashboard ----
  // Cada produto diz o que liga no CRM (Social, Meta, Google, Landing Page).
  // As flags antigas do form (socialMedia/paidTraffic/…) só valem pra serviços
  // que o cliente já tinha SEM produto do catálogo (cadastro antigo) ou quando
  // o catálogo está vazio — aí o cadastro cai no modo manual de antes.
  const catalogEmpty = !productsLoading && products.length === 0
  const selectableProducts = products.filter((p) => p.active || form.contractedProductIds.includes(p.id))
  const origCovered = useMemo(
    () => modulesFromProducts(products.filter((p) => (client?.contractedProductIds ?? []).includes(p.id))),
    [products, client]
  )
  const { derived, socialMedia, landingPage, paidTraffic, metaAds, googleAds, showPlatformPicker, platformMissing } = resolveServices(
    products,
    form.contractedProductIds,
    form,
    origCovered
  )
  const selectedContracts = products
    .filter((p) => form.contractedProductIds.includes(p.id))
    .map((p) => {
      const draft = form.contracts[p.id]
      const calc = draft ? computedPrice(p, draftContract(draft)) : computedPrice(p, {})
      const final = draft?.price ? parseCurrencyToNumber(draft.price) : calc
      return { product: p, draft, calc, final }
    })
  const servicesTotal = selectedContracts.reduce((sum, c) => sum + (c.final ?? 0), 0)
  const showLegacyRow = (k: 'socialMedia' | 'landingPage' | 'paidTraffic') => !catalogEmpty && !!client?.modules?.[k] && !origCovered[k] && !derived[k]
    useEffect(() => {
    if (monthlyTouched || servicesTotal <= 0) return
    setForm((f) => {
      const masked = maskCurrencyInput(String(Math.round(servicesTotal * 100)))
      return f.monthlyValue === masked ? f : { ...f, monthlyValue: masked }
    })
  }, [servicesTotal, monthlyTouched])
  const anyService = socialMedia || paidTraffic || landingPage || form.contractedProductIds.length > 0
  const unmappedProducts = products.filter((p) => form.contractedProductIds.includes(p.id) && productModules(p).keys.length === 0)
  const willActivate = [
    socialMedia && 'Social Mídia',
    metaAds && 'Meta Ads',
    googleAds && 'Google Ads',
    landingPage && 'Landing Page',
  ].filter(Boolean) as string[]

  useEffect(() => {
    if (client) {
      setForm({
        companyName: client.companyName,
        whatsapp: client.whatsapp ? maskPhone(client.whatsapp) : '',
        city: client.city ?? '',
        segment: client.segment ?? '',
        document: client.document ? maskDocument(client.document) : '',
        addressStreet: client.address?.street ?? '',
        addressComplement: client.address?.complement ?? '',
        addressCity: client.address?.city ?? '',
        addressState: client.address?.state ?? '',
        addressZip: client.address?.zip ? maskCep(client.address.zip) : '',
        whatsappGroupLink: client.whatsappGroupLink ?? '',
        package: client.package ?? '',
        styleCatalog: client.styleCatalog ?? '',
        ownerIds: getClientOwnerIds(client),
        monthlyValue: client.monthlyValue != null ? maskCurrencyInput(String(Math.round(client.monthlyValue * 100))) : '',
        contractStartDate: toDateInputValue(client.contractStartDate),
        notes: client.notes ?? '',
        status: client.status,
        churnReason: client.churnReason ?? '',
        categoria: client.categoria ?? '',
        socialMedia: client.modules?.socialMedia ?? false,
        paidTraffic: client.modules?.paidTraffic ?? false,
        metaAds: client.modules?.metaAds ?? false,
        googleAds: client.modules?.googleAds ?? false,
        landingPage: client.modules?.landingPage ?? false,
        landingPageType: client.landingPageType ?? '',
        contractedProductIds: client.contractedProductIds ?? [],
        contracts: Object.fromEntries(
          (client.contractedServices ?? []).map((c) => [
            c.productId,
            {
              tierId: c.tierId ?? '',
              discountId: c.customDiscount ? CUSTOM_DISCOUNT : (c.discountId ?? ''),
              customType: c.customDiscount?.type ?? 'percent',
              customValue: c.customDiscount ? String(c.customDiscount.value) : '',
              price: c.finalPrice != null ? maskCurrencyInput(String(Math.round(c.finalPrice * 100))) : '',
              priceTouched: c.finalPrice != null,
            } satisfies ContractDraft,
          ])
        ),
      })
      setMonthlyTouched(client.monthlyValue != null)
    } else {
      setForm(EMPTY)
      setMonthlyTouched(false)
      setCreateTasks(true)
    }
    setLogoFile(null)
    setLogoRemoved(false)
  }, [client, open])

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const toggleOwner = (uid: string) =>
    setForm((f) => ({
      ...f,
      ownerIds: f.ownerIds.includes(uid) ? f.ownerIds.filter((id) => id !== uid) : [...f.ownerIds, uid],
    }))

  const toggleContractedProduct = (id: string) =>
    setForm((f) => {
      const on = f.contractedProductIds.includes(id)
      const product = products.find((x) => x.id === id)
      return {
        ...f,
        contractedProductIds: on ? f.contractedProductIds.filter((pid) => pid !== id) : [...f.contractedProductIds, id],
        contracts: !on && product && !f.contracts[id] ? { ...f.contracts, [id]: newDraft(product) } : f.contracts,
      }
    })

  /** Edita nível/desconto/valor de um serviço; enquanto o valor não foi
   *  digitado na mão, ele se recalcula (tabela − desconto). */
  const updateContract = (product: Product, patch: Partial<ContractDraft>) =>
    setForm((f) => {
      const cur = f.contracts[product.id] ?? newDraft(product)
      const next: ContractDraft = { ...cur, ...patch }
      if (!('price' in patch) && !next.priceTouched) next.price = calcPriceMask(product, next)
      return { ...f, contracts: { ...f.contracts, [product.id]: next } }
    })

  const whatsappIncomplete = form.whatsapp.trim() !== '' && !isPhoneComplete(form.whatsapp)
  const whatsappGroupLinkInvalid = form.whatsappGroupLink.trim() !== '' && !form.whatsappGroupLink.trim().startsWith(WHATSAPP_GROUP_PREFIX)

  const handleCepChange = async (raw: string) => {
    const masked = maskCep(raw)
    set('addressZip', masked)
    if (!isCepComplete(masked)) return
    setCepLoading(true)
    try {
      const result = await fetchAddressByCep(masked)
      if (result) {
        setForm((f) => ({
          ...f,
          addressStreet: result.street || f.addressStreet,
          addressCity: result.city || f.addressCity,
          addressState: result.state || f.addressState,
        }))
      }
    } finally {
      setCepLoading(false)
    }
  }

  const autoTaskSummary = [
    paidTraffic && 'Tráfego Pago: cria "Onboarding" — as próximas etapas aparecem sozinhas conforme cada uma for concluída',
    socialMedia && 'Social Mídia: cria "Ativação de Social Mídia" — as próximas etapas aparecem sozinhas conforme cada uma for concluída',
    landingPage && 'Landing Page: cria "Briefing de Landing Page" e "Desenvolvimento da Landing Page"',
  ]
    .filter(Boolean)
    .join('; ')

  // Cliente novo precisa de pelo menos um serviço e, se tem tráfego pago, de uma plataforma.
  const canSubmit = form.companyName.trim() !== '' && !whatsappIncomplete && !whatsappGroupLinkInvalid && !platformMissing && (!!client || anyService)

  const handleSubmit = async () => {
    if (!canSubmit || !profile) return
    setSaving(true)
    try {
      const basePayload = {
        companyName: form.companyName.trim(),
        whatsapp: form.whatsapp || undefined,
        city: form.city || undefined,
        segment: form.segment || undefined,
        document: form.document || undefined,
        address:
          form.addressStreet || form.addressComplement || form.addressCity || form.addressState || form.addressZip
            ? {
                street: form.addressStreet || undefined,
                complement: form.addressComplement || undefined,
                city: form.addressCity || undefined,
                state: form.addressState || undefined,
                zip: form.addressZip || undefined,
              }
            : undefined,
        whatsappGroupLink: form.whatsappGroupLink.trim() || undefined,
        package: socialMedia ? form.package || undefined : undefined,
        styleCatalog: socialMedia ? form.styleCatalog || undefined : undefined,
        landingPageType: landingPage ? form.landingPageType || undefined : undefined,
        ownerIds: form.ownerIds.length > 0 ? form.ownerIds : undefined,
        categoria: form.categoria || undefined,
        monthlyValue: parseCurrencyToNumber(form.monthlyValue),
        contractStartDate: dateInputToTimestamp(form.contractStartDate),
        notes: form.notes || undefined,
        churnReason: form.status === 'churned' ? form.churnReason.trim() || undefined : undefined,
        contractedProductIds: form.contractedProductIds.length > 0 ? form.contractedProductIds : undefined,
        contractedServices: selectedContracts.map(({ product, draft }): ClientServiceContract => {
          const c = draft ? draftContract(draft) : {}
          const price = draft?.price ? (parseCurrencyToNumber(draft.price) ?? null) : null
          return { productId: product.id, ...c, finalPrice: price }
        }),
        modules: {
          ...client?.modules,
          socialMedia,
          paidTraffic,
          metaAds,
          googleAds,
          landingPage,
        },
      }
      let targetId: string
      if (client) {
        await updateClient(client.id, { ...basePayload, status: form.status }, profile.id, profile.name)
        targetId = client.id

        const stillActive = form.status !== 'churned'
        const upsell = isNewClient(client) ? null : describeUpsell(client, basePayload.modules, basePayload.monthlyValue)
        const downsell =
          isNewClient(client) || !stillActive ? null : describeDownsell(client, basePayload.modules, basePayload.monthlyValue)
        if (downsell) {
          await logActivity({
            entityType: 'client',
            entityId: client.id,
            clientId: client.id,
            action: 'downsell',
            message: `reduziu o contrato: ${downsell.text}`,
            amount: downsell.amount,
            userId: profile.id,
            userName: profile.name,
          })
        }
        if (upsell) {
          await logActivity({
            entityType: 'client',
            entityId: client.id,
            clientId: client.id,
            action: 'upsell',
            message: `expandiu o contrato: ${upsell}`,
            userId: profile.id,
            userName: profile.name,
          })
        }

        // Landing Page contratada agora (não tinha antes) — cria as tarefas
        // padrão de briefing/desenvolvimento, igual acontece na criação do
        // cliente (ver createInitialWorkflowTasks).
        if (basePayload.modules.landingPage && !client.modules?.landingPage) {
          const updatedClient = {
            id: client.id,
            companyName: basePayload.companyName,
            modules: basePayload.modules,
            ownerIds: basePayload.ownerIds,
          }
          await createLandingPageWorkflowTasks(updatedClient, profile.id, profile.name, users)
        }

        if (form.status !== client.status) {
          await notifyAdminsOfAction({
            type: 'client_status_changed',
            message: `${profile.name} alterou o status de ${basePayload.companyName}: "${CLIENT_STATUS_LABEL[client.status]}" → "${CLIENT_STATUS_LABEL[form.status]}"`,
            actorId: profile.id,
            actorName: profile.name,
            entityType: 'client',
            entityId: client.id,
          })
          // Cliente encerrado -> tira os aniversários do calendário e para os
          // lembretes.
          if (form.status === 'churned') {
            await removeClientBirthdays(client.id).catch((err) =>
              console.error('[cliente] falha ao remover aniversários', err)
            )
          }
        }
        toast.success('Cliente atualizado')
      } else {
        const newClientId = await createClient({ ...basePayload, status: 'prospect' }, profile.id, profile.name, users)
        targetId = newClientId
        if (createTasks) {
          const newClient = {
            id: newClientId,
            companyName: basePayload.companyName,
            modules: basePayload.modules,
            ownerIds: basePayload.ownerIds,
          }
          await createInitialWorkflowTasks(newClient, profile.id, profile.name, users)
        }
        toast.success('Cliente cadastrado com sucesso')
      }

      // Logo — best-effort, não bloqueia o cadastro se o Storage falhar.
      try {
        if (logoFile) await uploadClientLogo(targetId, logoFile, profile.id, profile.name)
        else if (client && logoRemoved && client.logoUrl) await removeClientLogo(targetId, profile.id, profile.name)
      } catch (logoErr) {
        console.error(logoErr)
        showError(logoErr, 'Cliente salvo, mas a logo não subiu.')
      }

      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar cliente')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={client ? 'Editar cliente' : 'Novo cliente'} width="max-w-2xl">
      <div className="mb-3">
        <ClientLogoField
          companyName={form.companyName}
          logoUrl={logoRemoved ? null : client?.logoUrl}
          pendingFile={logoFile}
          onPick={(f) => {
            setLogoFile(f)
            setLogoRemoved(false)
          }}
          onRemove={() => {
            setLogoFile(null)
            setLogoRemoved(true)
          }}
          busy={saving}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome da empresa" required>
          <Input autoFocus value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />
        </Field>
        <Field label="WhatsApp">
          <Input
            value={form.whatsapp}
            onChange={(e) => set('whatsapp', maskPhone(e.target.value))}
            placeholder="(00) 00000-0000"
          />
          {whatsappIncomplete && <p className="mt-1 text-xs text-red-500">Número incompleto — informe DDD + número completo.</p>}
        </Field>
        <Field label="CNPJ ou CPF">
          <Input
            value={form.document}
            onChange={(e) => set('document', maskDocument(e.target.value))}
            placeholder="000.000.000-00"
          />
        </Field>
        <Field label="Link do grupo WhatsApp">
          <Input
            value={form.whatsappGroupLink}
            onChange={(e) => set('whatsappGroupLink', e.target.value)}
            placeholder="https://chat.whatsapp.com/..."
          />
          {whatsappGroupLinkInvalid && (
            <p className="mt-1 text-xs text-red-500">O link precisa começar com {WHATSAPP_GROUP_PREFIX}</p>
          )}
        </Field>

        <div className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Endereço completo</p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Field label="CEP">
              <Input
                value={form.addressZip}
                onChange={(e) => handleCepChange(e.target.value)}
                placeholder="00000-000"
              />
              {cepLoading && <p className="mt-1 text-xs text-slate-400">Buscando endereço...</p>}
            </Field>
            <Field label="Estado">
              <Select value={form.addressState} onChange={(e) => set('addressState', e.target.value)}>
                <option value="">Selecione</option>
                {BRAZIL_STATES.map((s) => (
                  <option key={s.uf} value={s.uf}>
                    {s.uf} — {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cidade">
              <Input value={form.addressCity} onChange={(e) => set('addressCity', e.target.value)} />
            </Field>
            <Field label="Rua e número">
              <Input value={form.addressStreet} onChange={(e) => set('addressStreet', e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Complemento">
                <Input value={form.addressComplement} onChange={(e) => set('addressComplement', e.target.value)} />
              </Field>
            </div>
          </div>
        </div>

        <Field label="Cidade/Região">
          <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="Segmento">
          <Input value={form.segment} onChange={(e) => set('segment', e.target.value)} placeholder="Ex: Limpeza, Estética" />
        </Field>
        {client && (
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set('status', e.target.value as ClientStatus)}>
              {(Object.entries(CLIENT_STATUS_LABEL) as [ClientStatus, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
        )}
        {client && form.status === 'churned' && (
          <div className="sm:col-span-2">
            <Field label="Motivo do cancelamento">
              <Textarea
                rows={2}
                value={form.churnReason}
                onChange={(e) => set('churnReason', e.target.value)}
                placeholder="Ex: preço, resultado abaixo do esperado, mudou de agência..."
              />
            </Field>
            <p className="mt-1 text-xs text-slate-400">Aparece no popup de Churn Rate do Dashboard.</p>
          </div>
        )}
        <Field label="Categoria">
          <Select value={form.categoria} onChange={(e) => set('categoria', e.target.value as ClientCategory | '')}>
            <option value="">Não classificado</option>
            {(Object.entries(CLIENT_CATEGORY_LABEL) as [ClientCategory, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>

        <div className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Serviços contratados</p>

          {catalogEmpty ? (
            <>
              <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                O catálogo de serviços do Dashboard está vazio — marque abaixo à mão. Cadastre os serviços em Dashboard → Produtos e Serviços pra eles
                aparecerem aqui.
              </p>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={form.paidTraffic} onChange={(e) => set('paidTraffic', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                Tráfego Pago
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={form.socialMedia} onChange={(e) => set('socialMedia', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                Social Mídia
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={form.landingPage} onChange={(e) => set('landingPage', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                Landing Page
              </label>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-400">
                Os serviços vêm do catálogo do Dashboard (Produtos e Serviços). Marque o que este cliente contratou — as abas e as tarefas de cada área
                são liberadas sozinhas.
              </p>
              <div className="flex flex-col gap-1.5">
                {selectableProducts.map((p) => {
                  const { keys, inferred } = productModules(p)
                  const checked = form.contractedProductIds.includes(p.id)
                  // Cliente antigo com o serviço marcado mas sem preço salvo: abre um rascunho na hora.
                  const draft = form.contracts[p.id] ?? (checked ? newDraft(p) : undefined)
                  const calc = draft ? computedPrice(p, draftContract(draft)) : undefined
                  const basePriceText = draft ? computedPrice(p, { tierId: draft.tierId || null }) : undefined
                  return (
                    <div key={p.id} className="flex flex-col">
                      <label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleContractedProduct(p.id)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                        />
                        <span className="font-medium">{p.name}</span>
                        {!p.active && <span className="text-[11px] text-slate-400">(inativo)</span>}
                        {keys.map((k) => (
                          <span key={k} className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">
                            {PRODUCT_MODULE_SHORT[k]}
                            {inferred && '?'}
                          </span>
                        ))}
                      </label>

                      {checked && draft && (
                        <div className="ml-6 mt-1.5 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-2.5 sm:grid-cols-2">
                          {(p.tiers?.length ?? 0) > 0 && (
                            <Field label="Nível do serviço">
                              <Select value={draft.tierId} onChange={(e) => updateContract(p, { tierId: e.target.value })}>
                                {p.tiers!.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                    {t.price != null ? ` — ${formatBRL(t.price)}` : ''}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                          )}
                          <Field label="Desconto">
                            <Select value={draft.discountId} onChange={(e) => updateContract(p, { discountId: e.target.value })}>
                              <option value="">Sem desconto</option>
                              {(p.discounts ?? []).map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name} (−{discountLabel(d)})
                                </option>
                              ))}
                              <option value={CUSTOM_DISCOUNT}>Personalizado…</option>
                            </Select>
                          </Field>
                          {draft.discountId === CUSTOM_DISCOUNT && (
                            <Field label="Desconto personalizado">
                              <div className="flex gap-1.5">
                                <Select value={draft.customType} onChange={(e) => updateContract(p, { customType: e.target.value as DiscountType })} className="max-w-[80px]">
                                  <option value="percent">%</option>
                                  <option value="fixed">R$</option>
                                </Select>
                                <Input type="number" min="0" step="0.01" value={draft.customValue} onChange={(e) => updateContract(p, { customValue: e.target.value })} placeholder="0" />
                              </div>
                            </Field>
                          )}
                          <Field label="Valor mensal deste cliente (R$)">
                            <Input
                              value={draft.price}
                              onChange={(e) => updateContract(p, { price: maskCurrencyInput(e.target.value), priceTouched: true })}
                              placeholder="R$ 0,00"
                            />
                          </Field>
                          <p className="text-xs text-slate-400 sm:col-span-2">
                            {basePriceText != null && <>Tabela: {formatBRL(basePriceText)}. </>}
                            {calc != null && calc !== basePriceText && <>Com desconto: {formatBRL(calc)}. </>}
                            O valor acima é o que este cliente paga — pode ser diferente da tabela.
                            {draft.priceTouched && calc != null && (
                              <button type="button" onClick={() => updateContract(p, { price: maskCurrencyInput(String(Math.round(calc * 100))), priceTouched: false })} className="ml-1 font-medium text-brand-600 underline">
                                Voltar ao valor calculado
                              </button>
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {(['paidTraffic', 'socialMedia', 'landingPage'] as const).some(showLegacyRow) && (
                <div className="flex flex-col gap-1.5 border-t border-slate-200 pt-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Já ativos neste cliente (cadastro antigo)</p>
                  {showLegacyRow('paidTraffic') && (
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={form.paidTraffic} onChange={(e) => set('paidTraffic', e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                      Tráfego Pago
                    </label>
                  )}
                  {showLegacyRow('socialMedia') && (
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={form.socialMedia} onChange={(e) => set('socialMedia', e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                      Social Mídia
                    </label>
                  )}
                  {showLegacyRow('landingPage') && (
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={form.landingPage} onChange={(e) => set('landingPage', e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                      Landing Page
                    </label>
                  )}
                  <p className="text-xs text-slate-400">Esses serviços foram marcados antes do catálogo. Marque o serviço correspondente acima pra passar a usar o catálogo.</p>
                </div>
              )}
            </>
          )}

          {showPlatformPicker && (
            <div className={`flex flex-col gap-1.5 rounded-md border p-2.5 ${platformMissing ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
              <p className="text-xs font-semibold text-slate-700">Em qual plataforma o tráfego pago deste cliente roda?</p>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.metaAds} onChange={(e) => set('metaAds', e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                Meta Ads (Facebook / Instagram)
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.googleAds} onChange={(e) => set('googleAds', e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                Google Ads
              </label>
              <p className={`text-xs ${platformMissing ? 'font-medium text-amber-700' : 'text-slate-400'}`}>
                {platformMissing
                  ? 'Escolha pelo menos uma — é isso que define o Planejamento de Campanha, as otimizações e os relatórios deste cliente.'
                  : 'Define o Planejamento de Campanha, as otimizações e os relatórios deste cliente.'}
              </p>
            </div>
          )}

          {unmappedProducts.length > 0 && (
            <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
              {unmappedProducts.map((p) => p.name).join(', ')}: este serviço ainda não liga nenhuma área do CRM (nada de abas nem tarefas
              automáticas). Peça pro Bruno configurar em Dashboard → Produtos e Serviços.
            </p>
          )}

          {socialMedia && (
            <div className="flex flex-col gap-2.5 border-t border-slate-200 pt-2.5">
              <Field label="Pacote (Social Mídia)">
                <Select value={form.package} onChange={(e) => set('package', e.target.value as ClientPackage)}>
                  <option value="">Nenhum</option>
                  {Object.entries(CLIENT_PACKAGE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Catálogo de estilo (Social Mídia)">
                <Select
                  value={form.styleCatalog}
                  onChange={(e) => set('styleCatalog', (e.target.value ? Number(e.target.value) : '') as StyleCatalog | '')}
                >
                  <option value="">Nenhum escolhido ainda</option>
                  {Object.entries(STYLE_CATALOG_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
                {form.styleCatalog && <p className="mt-1 text-xs text-slate-400">{STYLE_CATALOG_DESCRIPTION[form.styleCatalog]}</p>}
              </Field>
            </div>
          )}

          {landingPage && (
            <div className="flex flex-col gap-2.5 border-t border-slate-200 pt-2.5">
              <Field label="Tipo de Landing Page">
                <Select value={form.landingPageType} onChange={(e) => set('landingPageType', e.target.value as LandingPageType)}>
                  <option value="">Selecione...</option>
                  {Object.entries(LANDING_PAGE_TYPE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          {willActivate.length > 0 ? (
            <p className="text-xs font-medium text-emerald-700">Vai ativar no CRM: {willActivate.join(' · ')}</p>
          ) : (
            !client && <p className="text-xs font-medium text-amber-700">Selecione pelo menos um serviço pra cadastrar o cliente.</p>
          )}
        </div>

        <Field label="Valor mensal do contrato (R$)">
          <Input
            value={form.monthlyValue}
            onChange={(e) => {
              setMonthlyTouched(true)
              set('monthlyValue', maskCurrencyInput(e.target.value))
            }}
            placeholder="R$ 0,00"
          />
          {servicesTotal > 0 && (
            <p className="mt-1 text-xs text-slate-400">
              Soma dos serviços: {formatBRL(servicesTotal)}
              {maskCurrencyInput(String(Math.round(servicesTotal * 100))) !== form.monthlyValue && (
                <button
                  type="button"
                  onClick={() => {
                    setMonthlyTouched(false)
                    set('monthlyValue', maskCurrencyInput(String(Math.round(servicesTotal * 100))))
                  }}
                  className="ml-1 font-medium text-brand-600 underline"
                >
                  usar
                </button>
              )}
            </p>
          )}
        </Field>
        <Field label="Data de início">
          <Input type="date" value={form.contractStartDate} onChange={(e) => set('contractStartDate', e.target.value)} />
        </Field>

        <div className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-500">Responsável interno</span>
          <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 p-2.5">
            {users.length === 0 && <p className="text-xs text-slate-400">Nenhum usuário cadastrado.</p>}
            {users.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.ownerIds.includes(u.id)}
                  onChange={() => toggleOwner(u.id)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                />
                {u.name}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-400">Selecione um ou mais responsáveis (ex: co-gestão de Tráfego Pago).</p>
        </div>

        <div className="sm:col-span-2">
          <Field label="Observações">
            <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      </div>

      {!client && (socialMedia || paidTraffic || landingPage) && (
        <label className="mt-3 flex items-start gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={createTasks}
            onChange={(e) => setCreateTasks(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
          />
          Criar automaticamente as tarefas padrão dos serviços marcados acima ({autoTaskSummary})
        </label>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} loading={saving} disabled={!canSubmit}>
          {client ? 'Salvar' : 'Cadastrar'}
        </Button>
      </div>
    </Modal>
  )
}
