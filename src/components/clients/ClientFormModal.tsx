import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { createClient, updateClient } from '../../services/clientService'
import { createInitialWorkflowTasks } from '../../services/clientWorkflowTemplates'
import { notifyAdminsOfAction } from '../../services/notificationService'
import { uploadClientLogo, removeClientLogo } from '../../services/clientLogoService'
import { ClientLogoField } from './ClientLogoField'
import { maskPhone, isPhoneComplete, maskDocument, maskCurrencyInput, parseCurrencyToNumber } from '../../utils/masks'
import { dateInputToTimestamp, timestampToDateInput } from '../../utils/dateInput'
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
  type ClientStatus,
  type StyleCatalog,
} from '../../types/client'

const EMPTY = {
  companyName: '',
  whatsapp: '',
  city: '',
  segment: '',
  document: '',
  package: '' as ClientPackage | '',
  styleCatalog: '' as StyleCatalog | '',
  ownerIds: [] as string[],
  monthlyValue: '',
  contractStartDate: '',
  notes: '',
  status: 'prospect' as ClientStatus,
  categoria: '' as ClientCategory | '',
  socialMedia: false,
  paidTraffic: false,
  metaAds: false,
  googleAds: false,
}

const toDateInputValue = timestampToDateInput

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

  useEffect(() => {
    if (client) {
      setForm({
        companyName: client.companyName,
        whatsapp: client.whatsapp ? maskPhone(client.whatsapp) : '',
        city: client.city ?? '',
        segment: client.segment ?? '',
        document: client.document ? maskDocument(client.document) : '',
        package: client.package ?? '',
        styleCatalog: client.styleCatalog ?? '',
        ownerIds: getClientOwnerIds(client),
        monthlyValue: client.monthlyValue != null ? maskCurrencyInput(String(Math.round(client.monthlyValue * 100))) : '',
        contractStartDate: toDateInputValue(client.contractStartDate),
        notes: client.notes ?? '',
        status: client.status,
        categoria: client.categoria ?? '',
        socialMedia: client.modules?.socialMedia ?? false,
        paidTraffic: client.modules?.paidTraffic ?? false,
        metaAds: client.modules?.metaAds ?? false,
        googleAds: client.modules?.googleAds ?? false,
      })
    } else {
      setForm(EMPTY)
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

  const whatsappIncomplete = form.whatsapp.trim() !== '' && !isPhoneComplete(form.whatsapp)

  const autoTaskSummary = [
    form.paidTraffic && 'Tráfego Pago: cria "Onboarding" — as próximas etapas aparecem sozinhas conforme cada uma for concluída',
    form.socialMedia && 'Social Mídia: cria "Ativação de Social Mídia" — as próximas etapas aparecem sozinhas conforme cada uma for concluída',
  ]
    .filter(Boolean)
    .join('; ')

  const canSubmit = form.companyName.trim() !== '' && !whatsappIncomplete

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
        package: form.socialMedia ? form.package || undefined : undefined,
        styleCatalog: form.socialMedia ? form.styleCatalog || undefined : undefined,
        ownerIds: form.ownerIds.length > 0 ? form.ownerIds : undefined,
        categoria: form.categoria || undefined,
        monthlyValue: parseCurrencyToNumber(form.monthlyValue),
        contractStartDate: dateInputToTimestamp(form.contractStartDate),
        notes: form.notes || undefined,
        modules: {
          ...client?.modules,
          socialMedia: form.socialMedia,
          paidTraffic: form.paidTraffic,
          metaAds: form.paidTraffic && form.metaAds,
          googleAds: form.paidTraffic && form.googleAds,
        },
      }
      let targetId: string
      if (client) {
        await updateClient(client.id, { ...basePayload, status: form.status }, profile.id, profile.name)
        targetId = client.id
        if (form.status !== client.status) {
          await notifyAdminsOfAction({
            type: 'client_status_changed',
            message: `${profile.name} alterou o status de ${basePayload.companyName}: "${CLIENT_STATUS_LABEL[client.status]}" → "${CLIENT_STATUS_LABEL[form.status]}"`,
            actorId: profile.id,
            actorName: profile.name,
            entityType: 'client',
            entityId: client.id,
          })
        }
        toast.success('Cliente atualizado')
      } else {
        const newClientId = await createClient({ ...basePayload, status: 'prospect' }, profile.id, profile.name, users)
        targetId = newClientId
        if (createTasks) {
          const newClient = { id: newClientId, companyName: basePayload.companyName, modules: basePayload.modules }
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
        toast.error(logoErr instanceof Error ? logoErr.message : 'Cliente salvo, mas a logo não subiu.')
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
        <Field label="Categoria">
          <Select value={form.categoria} onChange={(e) => set('categoria', e.target.value as ClientCategory | '')}>
            <option value="">Não classificado</option>
            {(Object.entries(CLIENT_CATEGORY_LABEL) as [ClientCategory, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="CNPJ ou CPF">
            <Input
              value={form.document}
              onChange={(e) => set('document', maskDocument(e.target.value))}
              placeholder="000.000.000-00"
            />
          </Field>
        </div>

        <div className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Serviços contratados</p>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.paidTraffic}
              onChange={(e) => set('paidTraffic', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
            />
            Tráfego Pago
          </label>
          {form.paidTraffic && (
            <div className="ml-6 flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.metaAds}
                  onChange={(e) => set('metaAds', e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                />
                Meta Ads
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.googleAds}
                  onChange={(e) => set('googleAds', e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                />
                Google Ads
              </label>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.socialMedia}
              onChange={(e) => set('socialMedia', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
            />
            Social Mídia
          </label>
          {form.socialMedia && (
            <div className="ml-6 flex flex-col gap-2.5">
              <Field label="Pacote">
                <Select value={form.package} onChange={(e) => set('package', e.target.value as ClientPackage)}>
                  <option value="">Nenhum</option>
                  {Object.entries(CLIENT_PACKAGE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Catálogo de estilo">
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
                {form.styleCatalog && (
                  <p className="mt-1 text-xs text-slate-400">{STYLE_CATALOG_DESCRIPTION[form.styleCatalog]}</p>
                )}
              </Field>
            </div>
          )}
        </div>

        <Field label="Valor mensal do contrato (R$)">
          <Input
            value={form.monthlyValue}
            onChange={(e) => set('monthlyValue', maskCurrencyInput(e.target.value))}
            placeholder="R$ 0,00"
          />
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

      {!client && (form.socialMedia || form.paidTraffic) && (
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
