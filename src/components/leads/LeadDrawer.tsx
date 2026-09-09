import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { Trash2, ArrowRightCircle, Plus, Phone, MessageCircle, Mail, Video, MoreHorizontal } from 'lucide-react'
import { Drawer } from '../ui/Drawer'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Tabs } from '../ui/Tabs'
import { CommentsPanel } from '../comments/CommentsPanel'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { updateLead, deleteLead, convertLeadToClient, addLeadContact } from '../../services/leadService'
import { LeadForm } from './LeadForm'
import { leadToFormState, formStateToLeadFields, type LeadFormState } from './leadFormState'
import {
  LEAD_STATUS_LABEL,
  LEAD_STATUS_COLOR,
  LEAD_CONTACT_TYPE_LABEL,
  LEAD_CONTACT_OUTCOME_LABEL,
  LEAD_LOST_REASON_LABEL,
  type Lead,
  type LeadContactType,
  type LeadContactOutcome,
} from '../../types'

const CONTACT_TYPE_ICON: Record<LeadContactType, typeof Phone> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  meeting: Video,
  other: MoreHorizontal,
}

function InfoTab({ lead }: { lead: Lead }) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const [form, setForm] = useState<LeadFormState>(() => leadToFormState(lead))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    try {
      await updateLead(lead.id, formStateToLeadFields(form), profile.id, profile.name)
      toast.success('Lead atualizado')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao atualizar lead')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <LeadForm value={form} onChange={setForm} users={users} />
      <Button onClick={handleSave} loading={saving} className="self-start">
        Salvar alterações
      </Button>
    </div>
  )
}

function ContactHistoryTab({ lead }: { lead: Lead }) {
  const { profile } = useAuth()
  const [adding, setAdding] = useState(false)
  const [type, setType] = useState<LeadContactType>('call')
  const [dateStr, setDateStr] = useState(new Date().toISOString().slice(0, 10))
  const [timeStr, setTimeStr] = useState('')
  const [summary, setSummary] = useState('')
  const [outcome, setOutcome] = useState<LeadContactOutcome>('positive')
  const [saving, setSaving] = useState(false)

  const history = [...(lead.contactHistory ?? [])].sort((a, b) => b.date.toMillis() - a.date.toMillis())

  const resetForm = () => {
    setType('call')
    setDateStr(new Date().toISOString().slice(0, 10))
    setTimeStr('')
    setSummary('')
    setOutcome('positive')
    setAdding(false)
  }

  const handleSave = async () => {
    if (!profile || !summary.trim()) return
    setSaving(true)
    try {
      const date = timeStr ? new Date(`${dateStr}T${timeStr}`) : new Date(`${dateStr}T00:00:00`)
      await addLeadContact(lead, { type, date: Timestamp.fromDate(date), summary: summary.trim(), outcome }, profile.id, profile.name)
      toast.success('Contato registrado')
      resetForm()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao registrar contato')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!adding ? (
        <Button size="sm" icon={<Plus size={13} />} onClick={() => setAdding(true)} className="self-start">
          Registrar contato
        </Button>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Tipo">
              <Select value={type} onChange={(e) => setType(e.target.value as LeadContactType)}>
                {(Object.entries(LEAD_CONTACT_TYPE_LABEL) as [LeadContactType, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="Resultado">
              <Select value={outcome} onChange={(e) => setOutcome(e.target.value as LeadContactOutcome)}>
                {(Object.entries(LEAD_CONTACT_OUTCOME_LABEL) as [LeadContactOutcome, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="Data">
              <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
            </Field>
            <Field label="Horário">
              <Input type="time" value={timeStr} onChange={(e) => setTimeStr(e.target.value)} />
            </Field>
          </div>
          <Field label="Resumo do contato">
            <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={resetForm}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} loading={saving} disabled={!summary.trim()}>
              Salvar contato
            </Button>
          </div>
        </div>
      )}

      {history.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum contato registrado ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {history.map((entry) => {
            const Icon = CONTACT_TYPE_ICON[entry.type]
            const outcomeColor =
              entry.outcome === 'positive' ? 'bg-emerald-50 text-emerald-600' : entry.outcome === 'negative' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'
            return (
              <div key={entry.id} className="flex items-start gap-2.5 rounded-lg border border-slate-100 p-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <Icon size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-700">{LEAD_CONTACT_TYPE_LABEL[entry.type]}</span>
                    <Badge className={outcomeColor}>{LEAD_CONTACT_OUTCOME_LABEL[entry.outcome]}</Badge>
                    <span className="ml-auto text-xs text-slate-400">{format(entry.date.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{entry.summary}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function LeadDrawer({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const navigate = useNavigate()
  const [converting, setConverting] = useState(false)

  if (!lead || !profile) return null

  const handleDelete = async () => {
    if (!confirm(`Excluir o lead "${lead.contactName}"?`)) return
    await deleteLead(lead, profile.id, profile.name)
    onClose()
  }

  const handleConvert = async () => {
    if (!confirm(`Converter "${lead.contactName}" em cliente?`)) return
    setConverting(true)
    try {
      const clientId = await convertLeadToClient(lead, profile.id, profile.name, users)
      toast.success('Lead convertido em cliente')
      onClose()
      navigate(`/clientes/${clientId}`)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao converter lead')
    } finally {
      setConverting(false)
    }
  }

  return (
    <Drawer
      open={!!lead}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span>{lead.contactName}</span>
          {lead.companyName && <span className="text-sm font-normal text-slate-400">— {lead.companyName}</span>}
        </div>
      }
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Badge style={{ backgroundColor: `${LEAD_STATUS_COLOR[lead.status]}1A`, color: LEAD_STATUS_COLOR[lead.status] }}>
            {LEAD_STATUS_LABEL[lead.status]}
          </Badge>
          {lead.status === 'lost' && lead.lostReason && (
            <p className="text-xs text-slate-400">
              Motivo: {LEAD_LOST_REASON_LABEL[lead.lostReason]}
              {lead.lostReasonNote ? ` — ${lead.lostReasonNote}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {lead.status === 'closed' &&
            (lead.convertedClientId ? (
              <Button size="sm" variant="secondary" onClick={() => navigate(`/clientes/${lead.convertedClientId}`)}>
                Ver cliente
              </Button>
            ) : (
              <Button
                size="sm"
                icon={<ArrowRightCircle size={14} />}
                onClick={handleConvert}
                loading={converting}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Converter em cliente
              </Button>
            ))}
          <button onClick={handleDelete} aria-label="Excluir lead" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <Tabs
        tabs={[
          { label: 'Informações', content: <InfoTab lead={lead} /> },
          { label: 'Histórico de contatos', content: <ContactHistoryTab lead={lead} /> },
          { label: 'Comentários', content: <CommentsPanel entityType="lead" entityId={lead.id} /> },
        ]}
      />
    </Drawer>
  )
}
