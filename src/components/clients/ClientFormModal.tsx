import { SocialPlanEditor } from '../socialMedia/SocialPlanEditor'
import type { SocialPlan } from '../../types/socialPlan'
import { useEffect, useState, type ReactNode } from 'react'
import { Timestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { Trash2, ChevronDown, AlertTriangle, CheckCircle2, FileText } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { ChurnTypeField } from './ChurnTypeField'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { createClient, updateClient } from '../../services/clientService'
import { createInitialWorkflowTasks, createLandingPageWorkflowTasks } from '../../services/clientWorkflowTemplates'
import { logActivity } from '../../services/activityService'
import { notifyAdminsOfAction } from '../../services/notificationService'
import { removeClientBirthdays } from '../../services/birthdayService'
import { uploadClientLogo, removeClientLogo } from '../../services/clientLogoService'
import { ClientLogoField } from './ClientLogoField'
import { ChoiceChip, ServicePicker } from './ServicePicker'
import { maskPhone, isPhoneComplete, maskDocument, maskCurrencyInput, parseCurrencyToNumber, maskCep, isCepComplete } from '../../utils/masks'
import { dateInputToTimestamp, timestampToDateInput } from '../../utils/dateInput'
import { fetchAddressByCep } from '../../services/viaCepService'
import { BRAZIL_STATES } from '../../utils/brazilStates'
import { MIN_NOTES_LENGTH, NOTES_TEMPLATE, missingClientFields, notesContent } from '../../utils/clientCompleteness'
import {
  CLIENT_STATUS_LABEL,
  CLIENT_CATEGORY_LABEL,
  CHURN_TYPE_COUNTS_DEFAULT,
  EARLY_CHURN_DAYS,
  STYLE_CATALOG_DESCRIPTION,
  STYLE_CATALOG_LABEL,
  getClientOwnerIds,
  type Client,
  type ClientCategory,
  type ClientContact,
  type ClientPackage,
  type ClientStatus,
  type ChurnType,
  type StyleCatalog,
} from '../../types/client'
import { LANDING_PAGE_TYPE_LABEL, type LandingPageType } from '../../types/landingPage'
import { showError } from '../../utils/notifyError'

const WHATSAPP_GROUP_PREFIX = 'https://chat.whatsapp.com/'

const EMPTY = {
  companyName: '',
  whatsapp: '',
  email: '',
  instagram: '',
  website: '',
  contacts: [] as ClientContact[],
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
  socialPlan: null as SocialPlan | null,
  styleCatalog: '' as StyleCatalog | '',
  ownerIds: [] as string[],
  monthlyValue: '',
  contractStartDate: '',
  notes: '',
  status: 'prospect' as ClientStatus,
  churnReason: '',
  churnType: '' as ChurnType | '',
  churnCounts: true,
  categoria: '' as ClientCategory | '',
  socialMedia: false,
  paidTraffic: false,
  metaAds: false,
  googleAds: false,
  landingPage: false,
  landingPageType: '' as LandingPageType | '',
  participaJornada: true,
  dataInicioJornada: '',
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

/** Bloco numerado do formulário. */
function Section({ n, title, hint, children, tone = 'default' }: { n: number; title: string; hint?: string; children: ReactNode; tone?: 'default' | 'notes' }) {
  const id = `client-form-section-${n}`
  return (
    <section
      aria-labelledby={id}
      className={`rounded-xl border p-4 ${tone === 'notes' ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-slate-50/60'}`}
    >
      <div className="mb-3 flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${tone === 'notes' ? 'bg-amber-400 text-white' : 'bg-brand-600 text-white'}`}
        >
          {n}
        </span>
        <div className="min-w-0">
          <h3 id={id} className="text-sm font-semibold text-slate-800">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
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
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [createTasks, setCreateTasks] = useState(true)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoRemoved, setLogoRemoved] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [addressOpen, setAddressOpen] = useState(false)
  // Só mostra o "falta preencher" em vermelho depois da primeira tentativa de salvar.
  const [triedSubmit, setTriedSubmit] = useState(false)

  const { socialMedia, landingPage, paidTraffic } = form
  // Plataforma só vale com tráfego pago ligado.
  const metaAds = paidTraffic && form.metaAds
  const googleAds = paidTraffic && form.googleAds

  /** Serviços separados por cobrança — decide se encerrar é churn ou
   *  "Concluído" (só projetos únicos, como Landing Page). */
  const servicesByBilling = {
    recurring: [paidTraffic && 'Tráfego Pago', socialMedia && 'Social Mídia'].filter(Boolean) as string[],
    oneTime: landingPage ? ['Landing Page'] : [],
  }
  const onlyOneTime = servicesByBilling.oneTime.length > 0 && servicesByBilling.recurring.length === 0

  useEffect(() => {
    if (client) {
      setForm({
        companyName: client.companyName,
        whatsapp: client.whatsapp ? maskPhone(client.whatsapp) : '',
        email: client.email ?? '',
        instagram: client.instagram ?? '',
        website: client.website ?? '',
        contacts: (client.contacts ?? []).map((c) => ({ ...c, whatsapp: c.whatsapp ? maskPhone(c.whatsapp) : '' })),
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
        socialPlan: client.socialPlan ?? null,
        styleCatalog: client.styleCatalog ?? '',
        ownerIds: getClientOwnerIds(client),
        monthlyValue: client.monthlyValue != null ? maskCurrencyInput(String(Math.round(client.monthlyValue * 100))) : '',
        contractStartDate: toDateInputValue(client.contractStartDate),
        notes: client.notes ?? '',
        status: client.status,
        churnReason: client.churnReason ?? '',
        churnType: client.churnType ?? '',
        churnCounts: client.churnCounts !== false,
        categoria: client.categoria ?? '',
        socialMedia: client.modules?.socialMedia ?? false,
        paidTraffic: client.modules?.paidTraffic ?? false,
        metaAds: client.modules?.metaAds ?? false,
        googleAds: client.modules?.googleAds ?? false,
        landingPage: client.modules?.landingPage ?? false,
        landingPageType: client.landingPageType ?? '',
        participaJornada: client.participaJornada !== false,
        dataInicioJornada: toDateInputValue(client.dataInicioJornada),
      })
      setAddressOpen(!!(client.address?.street || client.address?.zip || client.address?.city))
    } else {
      setForm(EMPTY)
      setCreateTasks(true)
      setAddressOpen(false)
    }
    setTriedSubmit(false)
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

  /** Dias de contrato até hoje — sugere Early Churn quando é pouco. */
  const contractDays = (() => {
    const start = form.contractStartDate ? new Date(`${form.contractStartDate}T00:00:00`) : client?.createdAt?.toDate?.()
    return start ? Math.floor((Date.now() - start.getTime()) / 86_400_000) : null
  })()

  const handleStatusChange = (status: ClientStatus) => {
    setForm((f) => {
      if (status !== 'churned' || f.churnType) return { ...f, status }
      if (onlyOneTime) return { ...f, status, churnType: 'completed', churnCounts: CHURN_TYPE_COUNTS_DEFAULT.completed }
      const early = contractDays != null && contractDays < EARLY_CHURN_DAYS
      return early ? { ...f, status, churnType: 'early', churnCounts: CHURN_TYPE_COUNTS_DEFAULT.early } : { ...f, status }
    })
  }

  const whatsappIncomplete = form.whatsapp.trim() !== '' && !isPhoneComplete(form.whatsapp)
  const contactPhoneIncomplete = (c: ClientContact) => !!c.whatsapp?.trim() && !isPhoneComplete(c.whatsapp)
  const contactsInvalid = form.contacts.some(contactPhoneIncomplete)
  const setContact = (id: string, patch: Partial<ClientContact>) =>
    setForm((f) => ({ ...f, contacts: f.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
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
    paidTraffic && 'Tráfego Pago: "Onboarding"',
    socialMedia && 'Social Mídia: "Ativação de Social Mídia"',
    landingPage && 'Landing Page: briefing e desenvolvimento',
  ]
    .filter(Boolean)
    .join(' · ')

  const notesLength = notesContent(form.notes).length
  const missing = missingClientFields({
    companyName: form.companyName,
    whatsapp: form.whatsapp,
    segment: form.segment,
    city: form.city,
    notes: form.notes,
    monthlyValue: parseCurrencyToNumber(form.monthlyValue),
    hasStartDate: !!form.contractStartDate,
    ownerCount: form.ownerIds.length,
    paidTraffic,
    socialMedia,
    landingPage,
    metaAds,
    googleAds,
  })
  const formatInvalid = whatsappIncomplete || contactsInvalid || whatsappGroupLinkInvalid
  // Cadastro novo: tudo obrigatório. Edição: só nome, serviço e plataforma
  // (cliente antigo não fica travado), mas a lista do que falta aparece.
  const blocking = client
    ? missing.filter((m) => m === 'Nome da empresa' || m === 'Serviços contratados' || m.startsWith('Plataforma'))
    : missing
  const canSubmit = !formatInvalid && blocking.length === 0
  const isMissing = (label: string) => triedSubmit && missing.includes(label)

  const handleSubmit = async () => {
    if (!profile) return
    if (!canSubmit) {
      setTriedSubmit(true)
      toast.error(formatInvalid ? 'Confira os campos em vermelho.' : `Falta preencher: ${blocking.join(', ')}`)
      return
    }
    if (client && form.status === 'churned' && !form.churnType) {
      toast.error('Escolha o tipo de churn antes de salvar.')
      return
    }
    setSaving(true)
    try {
      const basePayload = {
        companyName: form.companyName.trim(),
        whatsapp: form.whatsapp || undefined,
        email: form.email.trim() || undefined,
        instagram: form.instagram.trim() || undefined,
        website: form.website.trim() || undefined,
        // Pessoas sem nome nem WhatsApp são descartadas; campos vazios não vão pro banco.
        contacts: form.contacts
          .filter((c) => c.name.trim() || c.whatsapp?.trim())
          .map((c) => ({
            id: c.id,
            name: c.name.trim() || 'Contato',
            ...(c.role?.trim() ? { role: c.role.trim() } : {}),
            ...(c.whatsapp?.trim() ? { whatsapp: c.whatsapp.trim() } : {}),
            ...(c.email?.trim() ? { email: c.email.trim() } : {}),
          })),
        city: form.city.trim() || undefined,
        segment: form.segment.trim() || undefined,
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
        socialPlan: socialMedia ? form.socialPlan ?? undefined : undefined,
        styleCatalog: socialMedia ? form.styleCatalog || undefined : undefined,
        landingPageType: landingPage ? form.landingPageType || undefined : undefined,
        ownerIds: form.ownerIds.length > 0 ? form.ownerIds : undefined,
        categoria: form.categoria || undefined,
        monthlyValue: parseCurrencyToNumber(form.monthlyValue),
        contractStartDate: dateInputToTimestamp(form.contractStartDate),
        notes: form.notes.trim() || undefined,
        churnReason: form.status === 'churned' ? form.churnReason.trim() || undefined : undefined,
        churnType: form.status === 'churned' ? form.churnType || undefined : undefined,
        churnCounts: form.status === 'churned' ? form.churnCounts : undefined,
        participaJornada: form.participaJornada,
        dataInicioJornada: form.dataInicioJornada
          ? dateInputToTimestamp(form.dataInicioJornada)
          : client
            ? undefined
            : dateInputToTimestamp(form.contractStartDate) ?? Timestamp.now(),
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
        const justChurned = form.status === 'churned' && client.status !== 'churned'
        await updateClient(
          client.id,
          { ...basePayload, status: form.status, ...(justChurned ? { churnedAt: Timestamp.now() } : {}) },
          profile.id,
          profile.name
        )
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

  const missingMsg = (label: string) =>
    isMissing(label) ? <p className="mt-1 text-xs font-medium text-red-500">Obrigatório.</p> : null
  const totalChecks = 10
  const done = totalChecks - missing.length

  return (
    <Modal open={open} onClose={onClose} title={client ? `Editar cliente${client.companyName ? ` — ${client.companyName}` : ''}` : 'Novo cliente'} width="max-w-3xl">
      <div className="flex flex-col gap-4">
        {/* Progresso do cadastro */}
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          {missing.length === 0 ? (
            <CheckCircle2 size={20} className="shrink-0 text-emerald-500" aria-hidden="true" />
          ) : (
            <AlertTriangle size={20} className="shrink-0 text-amber-500" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800">
              {missing.length === 0 ? 'Cadastro completo' : `Cadastro ${done} de ${totalChecks} — falta ${missing.length === 1 ? '1 item' : `${missing.length} itens`}`}
            </p>
            {missing.length > 0 && <p className="truncate text-xs text-slate-500">{missing.join(' · ')}</p>}
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <div
                className={`h-full rounded-full transition-all duration-300 ${missing.length === 0 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                style={{ width: `${Math.max(0, (done / totalChecks) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {client && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Status">
              <Select value={form.status} onChange={(e) => handleStatusChange(e.target.value as ClientStatus)}>
                {(Object.entries(CLIENT_STATUS_LABEL) as [ClientStatus, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
            {form.status === 'churned' && (
              <div className="flex flex-col gap-3 rounded-xl border border-red-100 bg-red-50/40 p-4 sm:col-span-2">
                <ChurnTypeField
                  value={form.churnType}
                  counts={form.churnCounts}
                  suggestedEarly={contractDays != null && contractDays < EARLY_CHURN_DAYS}
                  contractDays={contractDays}
                  services={servicesByBilling}
                  onChange={(type) => setForm((f) => ({ ...f, churnType: type, churnCounts: CHURN_TYPE_COUNTS_DEFAULT[type] }))}
                  onCountsChange={(v) => set('churnCounts', v)}
                />
                <Field label="Motivo do cancelamento">
                  <Textarea
                    rows={2}
                    value={form.churnReason}
                    onChange={(e) => set('churnReason', e.target.value)}
                    placeholder="Ex: preço, resultado abaixo do esperado, mudou de agência, fechou a empresa..."
                  />
                </Field>
                <p className="-mt-1 text-xs text-slate-400">Tipo e motivo aparecem no detalhe do Churn Rate do Dashboard.</p>
              </div>
            )}
          </div>
        )}

        {/* 1. Empresa */}
        <Section n={1} title="Empresa" hint="Quem é o cliente e onde ele atua.">
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
            <div className="sm:col-span-2">
              <Field label="Nome da empresa" required>
                <Input autoFocus value={form.companyName} onChange={(e) => set('companyName', e.target.value)} placeholder="Ex: SOS Limpeza & Restauração" />
              </Field>
              {missingMsg('Nome da empresa')}
            </div>
            <div>
              <Field label="Segmento" required>
                <Input value={form.segment} onChange={(e) => set('segment', e.target.value)} placeholder="Ex: Limpeza pós-obra, estofados" />
              </Field>
              {missingMsg('Segmento')}
            </div>
            <div>
              <Field label="Cidade/região onde atende" required>
                <Input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Ex: Zona Sul de SP" />
              </Field>
              {missingMsg('Cidade/região')}
            </div>
            <Field label="Instagram">
              <Input value={form.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@perfil" />
            </Field>
            <Field label="Site">
              <Input value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="www.site.com.br" />
            </Field>
            <Field label="CNPJ ou CPF">
              <Input value={form.document} onChange={(e) => set('document', maskDocument(e.target.value))} placeholder="000.000.000-00" />
            </Field>
            <Field label="Categoria">
              <Select value={form.categoria} onChange={(e) => set('categoria', e.target.value as ClientCategory | '')}>
                <option value="">Não classificado</option>
                {(Object.entries(CLIENT_CATEGORY_LABEL) as [ClientCategory, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setAddressOpen((v) => !v)}
              aria-expanded={addressOpen}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium text-slate-600"
            >
              Endereço completo (opcional)
              <ChevronDown size={16} aria-hidden="true" className={`transition-transform ${addressOpen ? 'rotate-180' : ''}`} />
            </button>
            {addressOpen && (
              <div className="grid grid-cols-1 gap-2.5 border-t border-slate-100 p-3 sm:grid-cols-2">
                <Field label="CEP">
                  <Input value={form.addressZip} onChange={(e) => handleCepChange(e.target.value)} placeholder="00000-000" />
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
            )}
          </div>
        </Section>

        {/* 2. Contato */}
        <Section n={2} title="Contato" hint="Todo WhatsApp daqui é reconhecido como cliente: quem chamar não vira lead nem conta como venda.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Field label="WhatsApp principal" required>
                <Input value={form.whatsapp} onChange={(e) => set('whatsapp', maskPhone(e.target.value))} placeholder="(00) 00000-0000" />
              </Field>
              {whatsappIncomplete ? <p className="mt-1 text-xs text-red-500">Número incompleto — informe DDD + número completo.</p> : missingMsg('WhatsApp')}
            </div>
            <Field label="E-mail">
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="contato@empresa.com.br" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Link do grupo do WhatsApp">
                <Input value={form.whatsappGroupLink} onChange={(e) => set('whatsappGroupLink', e.target.value)} placeholder="https://chat.whatsapp.com/..." />
              </Field>
              {whatsappGroupLinkInvalid && <p className="mt-1 text-xs text-red-500">O link precisa começar com {WHATSAPP_GROUP_PREFIX}</p>}
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <p className="text-xs font-medium text-slate-500">Outras pessoas do cliente (dona, sócio, gerente...)</p>
            {form.contacts.map((c) => (
              <div key={c.id} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-[1fr_0.8fr_1fr_auto] sm:items-start">
                <Input value={c.name} onChange={(e) => setContact(c.id, { name: e.target.value })} placeholder="Nome" aria-label="Nome da pessoa" />
                <Input value={c.role ?? ''} onChange={(e) => setContact(c.id, { role: e.target.value })} placeholder="Cargo (ex: proprietária)" aria-label="Cargo" />
                <div>
                  <Input
                    value={c.whatsapp ?? ''}
                    onChange={(e) => setContact(c.id, { whatsapp: maskPhone(e.target.value) })}
                    placeholder="(00) 00000-0000"
                    aria-label="WhatsApp da pessoa"
                  />
                  {contactPhoneIncomplete(c) && <p className="mt-1 text-xs text-red-500">Número incompleto.</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, contacts: f.contacts.filter((x) => x.id !== c.id) }))}
                  aria-label={`Remover ${c.name || 'pessoa'}`}
                  className="h-9 rounded-lg px-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setForm((f) => ({ ...f, contacts: [...f.contacts, { id: crypto.randomUUID(), name: '', role: '', whatsapp: '' }] }))}
              >
                + Adicionar pessoa
              </Button>
            </div>
          </div>
        </Section>

        {/* 3. Serviços */}
        <Section n={3} title="Serviços contratados" hint="Marque tudo o que o cliente fechou. As abas e as tarefas de cada área são liberadas sozinhas.">
          <ServicePicker
            value={{ paidTraffic, metaAds: form.metaAds, googleAds: form.googleAds, socialMedia, landingPage }}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            showMissing={isMissing('Serviços contratados')}
          />

          {socialMedia && (
            <div className="mt-3 flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-white p-3">
              <Field label="Plano (Social Mídia)">
                <SocialPlanEditor value={form.socialPlan} onChange={(plan) => set('socialPlan', plan)} />
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
            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
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
        </Section>

        {/* 4. Contrato */}
        <Section n={4} title="Contrato" hint="Valor que o cliente paga por mês pra agência (sem a verba de anúncio).">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Field label="Valor mensal (R$)" required>
                <Input value={form.monthlyValue} onChange={(e) => set('monthlyValue', maskCurrencyInput(e.target.value))} placeholder="R$ 0,00" inputMode="numeric" />
              </Field>
              {missingMsg('Valor mensal')}
            </div>
            <div>
              <Field label="Data de início" required>
                <Input type="date" value={form.contractStartDate} onChange={(e) => set('contractStartDate', e.target.value)} />
              </Field>
              {missingMsg('Data de início')}
            </div>
          </div>

          <fieldset className="mt-3">
            <legend className="mb-1.5 text-xs font-medium text-slate-500">
              Responsáveis na equipe <span className="text-red-400">*</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {users.length === 0 && <p className="text-xs text-slate-400">Nenhum usuário cadastrado.</p>}
              {users.map((u) => (
                <ChoiceChip key={u.id} checked={form.ownerIds.includes(u.id)} onChange={() => toggleOwner(u.id)} label={u.name} />
              ))}
            </div>
            {isMissing('Responsável') && <p className="mt-1 text-xs font-medium text-red-500">Escolha pelo menos um responsável.</p>}
          </fieldset>
        </Section>

        {/* 5. Observações */}
        <Section
          n={5}
          tone="notes"
          title="Observações: o que foi vendido e combinado"
          hint="A equipe lê isso no topo da ficha e no aviso de cliente novo. Escreva tudo: serviços, verba, prazos, promessas e condições."
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<FileText size={13} />}
              onClick={() => set('notes', form.notes.trim() ? `${form.notes.trimEnd()}\n\n${NOTES_TEMPLATE}` : NOTES_TEMPLATE)}
            >
              Usar roteiro
            </Button>
            <span className="text-xs text-slate-500">Coloca as perguntas no texto pra você só completar.</span>
          </div>
          <Textarea
            rows={8}
            aria-label="Observações: o que foi vendido e combinado"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder={'Ex: fechou tráfego no Meta e no Google, verba de R$ 30/dia, foco em limpeza pós-obra na Zona Sul.\nPrometido 2 criativos novos por mês e relatório toda segunda.\nDesconto de 20% nos 3 primeiros meses.'}
          />
          <p className={`mt-1 text-xs ${notesLength < MIN_NOTES_LENGTH ? (isMissing('Observações completas') ? 'font-medium text-red-500' : 'text-amber-700') : 'text-emerald-700'}`}>
            {notesLength < MIN_NOTES_LENGTH
              ? `Escreva pelo menos ${MIN_NOTES_LENGTH} caracteres (faltam ${MIN_NOTES_LENGTH - notesLength}).`
              : 'Ok — quanto mais detalhe, melhor pra equipe.'}
          </p>
        </Section>

        {(profile?.role === 'admin' || profile?.role === 'manager') && (
          <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <p className="text-sm font-semibold text-slate-800">Jornada do Cliente (CS)</p>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.participaJornada}
                onChange={(e) => set('participaJornada', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              />
              Participa da Jornada do Cliente
            </label>
            {form.participaJornada && (
              <div className="max-w-xs">
                <Field label="Início da jornada">
                  <Input type="date" value={form.dataInicioJornada} onChange={(e) => set('dataInicioJornada', e.target.value)} />
                </Field>
              </div>
            )}
          </div>
        )}

        {!client && (socialMedia || paidTraffic || landingPage) && (
          <label className="flex items-start gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={createTasks}
              onChange={(e) => setCreateTasks(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
            />
            Criar as tarefas padrão dos serviços marcados ({autoTaskSummary})
          </label>
        )}

        {/* Rodapé fixo */}
        <div className="sticky bottom-0 -mx-5 -mb-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3">
          {triedSubmit && blocking.length > 0 && (
            <p role="alert" className="mr-auto text-xs font-medium text-red-500">
              Falta: {blocking.join(', ')}
            </p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={saving} aria-disabled={!canSubmit}>
            {client ? 'Salvar' : 'Cadastrar cliente'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
