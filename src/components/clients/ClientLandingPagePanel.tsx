import { useEffect, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Save } from 'lucide-react'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { updateClient } from '../../services/clientService'
import { notifyAdminsOfAction } from '../../services/notificationService'
import { dateInputToTimestamp, timestampToDateInput } from '../../utils/dateInput'
import {
  EMPTY_LANDING_PAGE,
  LANDING_PAGE_PLATFORM_LABEL,
  LANDING_PAGE_STATUS_LABEL,
  type Client,
  type LandingPage,
  type LandingPagePlatform,
  type LandingPageStatus,
} from '../../types'

function SectionTitle({ children }: { children: string }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</p>
}

function mergeLandingPage(saved?: LandingPage): LandingPage {
  const checklist = (saved?.checklist?.length ? saved.checklist : EMPTY_LANDING_PAGE.checklist).map((i) => ({ ...i }))
  return { ...EMPTY_LANDING_PAGE, ...saved, checklist }
}

export function ClientLandingPagePanel({ client }: { client: Client }) {
  const { profile } = useAuth()
  const [form, setForm] = useState<LandingPage>(mergeLandingPage(client.landingPage))
  const [saving, setSaving] = useState(false)

  // Resync só na troca de cliente — mesma razão de ClientCampaignPlanningPanel:
  // depender da identidade do sub-objeto apagaria edições não salvas a cada
  // snapshot novo de `clients`.
  useEffect(() => {
    setForm(mergeLandingPage(client.landingPage))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id])

  const setField = <K extends keyof LandingPage>(key: K, value: LandingPage[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const toggleChecklistItem = (id: string) =>
    setForm((f) => ({ ...f, checklist: f.checklist.map((i) => (i.id === id ? { ...i, done: !i.done } : i)) }))

  const doneCount = form.checklist.filter((i) => i.done).length

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    try {
      const payload: LandingPage = { ...form, preenchidoPor: profile.name, filledAt: Timestamp.now() }
      const first = !client.landingPage?.filledAt
      await updateClient(client.id, { landingPage: payload }, profile.id, profile.name)
      await notifyAdminsOfAction({
        type: 'landing_page_saved',
        message: `${profile.name} ${first ? 'preencheu' : 'atualizou'} a Landing Page — ${client.companyName}`,
        actorId: profile.id,
        actorName: profile.name,
        entityType: 'client',
        entityId: client.id,
      })
      toast.success('Landing Page salva')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar Landing Page')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <SectionTitle>1. Informações da LP</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="URL da landing page">
              <Input value={form.url ?? ''} onChange={(e) => setField('url', e.target.value)} placeholder="https://..." />
            </Field>
          </div>
          <Field label="Plataforma">
            <Select value={form.platform ?? ''} onChange={(e) => setField('platform', e.target.value as LandingPagePlatform)}>
              <option value="">Selecione...</option>
              {Object.entries(LANDING_PAGE_PLATFORM_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setField('status', e.target.value as LandingPageStatus)}>
              {Object.entries(LANDING_PAGE_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Data de entrega prevista">
            <Input
              type="date"
              value={timestampToDateInput(form.expectedDeliveryDate)}
              onChange={(e) => setField('expectedDeliveryDate', dateInputToTimestamp(e.target.value))}
            />
          </Field>
          <Field label="Data de entrega real">
            <Input
              type="date"
              value={timestampToDateInput(form.actualDeliveryDate)}
              onChange={(e) => setField('actualDeliveryDate', dateInputToTimestamp(e.target.value))}
            />
          </Field>
        </div>
      </div>

      <div>
        <SectionTitle>2. Acesso à hospedagem</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Plataforma de hospedagem">
            <Input value={form.hostingPlatform ?? ''} onChange={(e) => setField('hostingPlatform', e.target.value)} />
          </Field>
          <Field label="URL de acesso ao painel">
            <Input value={form.panelUrl ?? ''} onChange={(e) => setField('panelUrl', e.target.value)} placeholder="https://..." />
          </Field>
          <Field label="Login">
            <Input value={form.login ?? ''} onChange={(e) => setField('login', e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Observações de acesso">
              <Textarea rows={2} value={form.accessNotes ?? ''} onChange={(e) => setField('accessNotes', e.target.value)} />
            </Field>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <SectionTitle>3. Checklist de entrega</SectionTitle>
          <span className="text-xs font-medium text-slate-400">
            {doneCount} de {form.checklist.length} concluídos
          </span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 p-3">
          {form.checklist.map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => toggleChecklistItem(item.id)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              />
              <span className={item.done ? 'text-slate-400 line-through' : ''}>{item.text}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>4. Observações</SectionTitle>
        <Textarea rows={3} value={form.observations ?? ''} onChange={(e) => setField('observations', e.target.value)} />
      </div>

      <div className="flex items-center justify-between">
        {form.filledAt ? (
          <p className="text-xs text-slate-400">
            Última atualização por {form.preenchidoPor} em{' '}
            {format(form.filledAt.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        ) : (
          <span />
        )}
        <Button icon={<Save size={14} />} onClick={handleSave} loading={saving}>
          Salvar
        </Button>
      </div>
    </div>
  )
}
