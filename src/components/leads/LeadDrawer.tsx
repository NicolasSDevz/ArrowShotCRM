import { useState } from 'react'
import { FormAnswersList } from './FormAnswerValue'
import { useLeadForms } from '../../hooks/useLeadForms'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Trash2, ArrowRightCircle, TriangleAlert, Mic } from 'lucide-react'
import { Drawer } from '../ui/Drawer'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Field, Input, Select } from '../ui/Field'
import { Tabs } from '../ui/Tabs'
import { LeadBantTab } from './LeadBantTab'
import { LeadMeetingTab } from './LeadMeetingTab'
import { LeadChamadasTab } from './LeadChamadasTab'
import { LeadFeed } from './LeadFeed'
import { CommentsPanel } from '../comments/CommentsPanel'
import { useAuth } from '../../context/AuthContext'
import { usePrivacy } from '../../context/PrivacyContext'
import { useUsers } from '../../hooks/useUsers'
import { updateLead, deleteLead, moveLeadToPipeline, moveLeadStatus } from '../../services/leadService'
import { ConvertLeadModal } from './ConvertLeadModal'
import { useClients } from '../../hooks/useClients'
import { useLeads } from '../../hooks/useLeads'
import { findClientMatch, findDuplicateLeads, MATCH_REASON_LABEL } from '../../utils/leadDuplicates'
import { LeadForm } from './LeadForm'
import { useProducts } from '../../hooks/useProducts'
import { contactError } from '../../utils/validation'
import { useLeadPipelines } from '../../hooks/useLeadPipelines'
import { leadToFormState, formStateToLeadFields, type LeadFormState } from './leadFormState'
import {
  locateLead,
  isQuestionnaireLead,
  leadFormStage,
  LEAD_FORM_STAGE_LABEL,
  LEAD_LOST_REASON_LABEL,
  type Lead,
  type LeadLostReason,
  type ResolvedPipeline,
} from '../../types'
import { askConfirm } from '../../utils/confirmDialog'
import { temAcessoAoCopiloto } from '../../config/copilotoAccess'

/** "Mover para": troca a etapa e/ou o pipeline do lead sem sair do cartão.
 *  Etapa de perda pede o motivo ali mesmo; etapa de ganho oferece converter
 *  em cliente (onWon), igual a arrastar no quadro. */
function LeadMoveControl({
  lead,
  pipelines,
  current,
  onWon,
}: {
  lead: Lead
  pipelines: ResolvedPipeline[]
  current: { pipelineId: string; stageId: string }
  onWon: () => void
}) {
  const { profile } = useAuth()
  const [pipelineId, setPipelineId] = useState(current.pipelineId)
  const [stageId, setStageId] = useState(current.stageId)
  const [lostReason, setLostReason] = useState<LeadLostReason>('price')
  const [lostNote, setLostNote] = useState('')
  const [saving, setSaving] = useState(false)

  const target = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0]
  const stage = target.stages.find((s) => s.id === stageId) ?? target.stages[0]
  const unchanged = target.id === current.pipelineId && stage.id === current.stageId
  const isLost = stage.kind === 'lost'

  const choosePipeline = (id: string) => {
    setPipelineId(id)
    const next = pipelines.find((p) => p.id === id)
    // Mesmo pipeline: volta pra etapa atual; outro: começa na primeira.
    setStageId(id === current.pipelineId ? current.stageId : (next?.stages[0].id ?? ''))
  }

  const handleMove = async () => {
    if (!profile || unchanged) return
    setSaving(true)
    const extra = isLost ? { lostReason, lostReasonNote: lostNote } : undefined
    try {
      if (target.id === current.pipelineId) {
        await moveLeadStatus(lead, stage.id, -Date.now(), profile.id, profile.name, extra, target)
      } else {
        await moveLeadToPipeline(lead, target, profile.id, profile.name, stage.id, extra)
      }
      toast.success(`Lead movido para ${target.name}, etapa ${stage.label}`)
      if (stage.kind === 'won' && !lead.convertedClientId) onWon()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao mover o lead')
    } finally {
      setSaving(false)
    }
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Mover para</legend>
      <div className="flex flex-wrap items-center gap-2">
        {pipelines.length > 1 && (
          <select
            value={target.id}
            onChange={(e) => choosePipeline(e.target.value)}
            aria-label="Pipeline de destino"
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-brand-600 focus:outline-none"
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <select
          value={stage.id}
          onChange={(e) => setStageId(e.target.value)}
          aria-label="Etapa de destino"
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-brand-600 focus:outline-none"
        >
          {target.stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
              {target.id === current.pipelineId && s.id === current.stageId ? ' (atual)' : ''}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={handleMove} loading={saving} disabled={unchanged}>
          Mover
        </Button>
      </div>
      {isLost && !unchanged && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Motivo da perda">
            <Select value={lostReason} onChange={(e) => setLostReason(e.target.value as LeadLostReason)}>
              {(Object.entries(LEAD_LOST_REASON_LABEL) as [LeadLostReason, string][]).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Observação (opcional)">
            <Input value={lostNote} onChange={(e) => setLostNote(e.target.value)} />
          </Field>
        </div>
      )}
    </fieldset>
  )
}

function InfoTab({ lead }: { lead: Lead }) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const { data: products } = useProducts()
  const { pipelines } = useLeadPipelines()
  const { isPrivacyMode } = usePrivacy()
  const { data: leadForms } = useLeadForms()
  const sourceForm = lead.sourceFormId ? leadForms.find((f) => f.id === lead.sourceFormId) : undefined
  const [form, setForm] = useState<LeadFormState>(() => leadToFormState(lead))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!profile) return
    const invalid = contactError('phone', form.whatsapp) ?? contactError('email', form.email)
    if (invalid) {
      toast.error(invalid)
      return
    }
    setSaving(true)
    try {
      await updateLead(lead.id, formStateToLeadFields(form, products, lead.contractedProductIds ?? []), profile.id, profile.name)
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
      {lead.formAnswers && lead.formAnswers.length > 0 && (
        <section aria-labelledby={`form-answers-${lead.id}`} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 id={`form-answers-${lead.id}`} className="text-sm font-semibold text-slate-800">
              Respostas do formulário{sourceForm ? `: ${sourceForm.name}` : ''}
            </h3>
            {lead.origin && (
              <p className="text-xs text-slate-500">
                Veio de {[lead.origin.source, lead.origin.campaign, lead.origin.adset, lead.origin.ad].filter(Boolean).join(', ')}, pelo {lead.origin.device === 'mobile' ? 'celular' : 'computador'}
              </p>
            )}
          </div>
          <FormAnswersList answers={lead.formAnswers} questions={sourceForm?.questions} hidden={isPrivacyMode} />
        </section>
      )}
      <LeadForm value={form} onChange={setForm} users={users} originalProductIds={lead.contractedProductIds ?? []} pipelineFields={locateLead(pipelines, lead).pipeline.fields} />
      <Button onClick={handleSave} loading={saving} className="self-start">
        Salvar alterações
      </Button>
    </div>
  )
}

export function LeadDrawer({
  lead,
  onClose,
  initialChamadaId,
}: {
  lead: Lead | null
  onClose: () => void
  /** Chamada do Copiloto de Vendas pra abrir direto na aba "Chamadas" — vem
   *  do link do toast "Transcrição salva no lead" (ver CopilotoPage). */
  initialChamadaId?: string | null
}) {
  const { profile } = useAuth()
  const { isPrivacyMode } = usePrivacy()
  const navigate = useNavigate()
  const [converting, setConverting] = useState(false)
  const [activeTab, setActiveTab] = useState<number | null>(null)
  // Veio do link de uma chamada do Copiloto: abre nos dados; senão, na conversa.
  const [mobilePane, setMobilePane] = useState<'feed' | 'data'>(initialChamadaId ? 'data' : 'feed')
  const { pipelines } = useLeadPipelines()
  const { data: clients } = useClients()
  const { data: allLeads } = useLeads()

  if (!lead || !profile) return null
  const { pipeline: leadPipeline, stage: leadStage } = locateLead(pipelines, lead)
  const clientMatch = lead.convertedClientId ? null : findClientMatch(lead, clients)
  const duplicateLeads = findDuplicateLeads(lead, allLeads)
  const canSeeCopiloto = temAcessoAoCopiloto(profile.email)

  const leadTabs = [
    { label: 'Informações', content: <InfoTab lead={lead} /> },
    { label: 'Reunião', content: <LeadMeetingTab lead={lead} /> },
    { label: 'Qualificação (BANT)', content: <LeadBantTab lead={lead} /> },
    ...(canSeeCopiloto ? [{ label: 'Chamadas', content: <LeadChamadasTab lead={lead} initialChamadaId={initialChamadaId} /> }] : []),
    { label: 'Comentários', content: <CommentsPanel entityType="lead" entityId={lead.id} /> },
  ]
  // Link do toast do Copiloto ("Transcrição salva no lead") já abre direto na
  // aba Chamadas — sem isso, cairia sempre em Informações.
  const chamadasTabIndex = leadTabs.findIndex((t) => t.label === 'Chamadas')
  const defaultTab = initialChamadaId && chamadasTabIndex !== -1 ? chamadasTabIndex : 0

  const handleDelete = async () => {
    if (!(await askConfirm({ title: `Excluir o lead "${lead.contactName}"?`, message: 'O histórico de contato e as respostas do formulário somem junto.', confirmLabel: 'Excluir', danger: true }))) return
    await deleteLead(lead, profile.id, profile.name)
    onClose()
  }

  const handleConvert = () => setConverting(true)

  return (
    <>
      <Drawer
        open={!!lead}
        onClose={onClose}
        width="w-full max-w-xl lg:max-w-[1180px]"
        bodyClassName="flex min-h-0 flex-1 flex-col"
        title={
          <div className="flex items-center gap-2">
            <span>{isPrivacyMode ? 'Lead ••••••' : lead.contactName}</span>
            {lead.companyName && (
              <span className="text-sm font-normal text-slate-400">— {isPrivacyMode ? 'Empresa ••••••' : lead.companyName}</span>
            )}
          </div>
        }
      >
        {/* Celular: uma coluna por vez. Computador: dados à esquerda, conversa à direita (estilo Kommo). */}
        <div className="flex shrink-0 gap-1 border-b border-slate-100 p-2 lg:hidden" role="group" aria-label="O que ver">
          {([
            ['feed', 'Conversa e histórico'],
            ['data', 'Dados do lead'],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={mobilePane === v}
              onClick={() => setMobilePane(v)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${mobilePane === v ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex min-h-0 flex-1">
        <div className={`min-h-0 w-full flex-col overflow-y-auto lg:flex lg:w-[440px] lg:shrink-0 lg:border-r lg:border-slate-100 ${mobilePane === 'data' ? 'flex' : 'hidden'}`}>
        {canSeeCopiloto && (
          <div className="border-b border-brand-100 bg-brand-50 px-5 py-3 dark:border-brand-900 dark:bg-brand-950/40">
            <button
              onClick={() => navigate(`/copiloto/${lead.id}`)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 active:bg-brand-800"
            >
              <Mic size={15} />
              Abrir Copiloto de Vendas
            </button>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              {isQuestionnaireLead(lead) ? (
                <Badge className="bg-brand-50 text-brand-700">Questionário: {LEAD_FORM_STAGE_LABEL[leadFormStage(lead)]}</Badge>
              ) : (
                <Badge style={{ backgroundColor: `${leadStage.color}1A`, color: leadStage.color }}>{leadStage.label}</Badge>
              )}
            </div>
            {isQuestionnaireLead(lead) && (
              <p className="text-xs text-slate-500">Ainda não está no pipeline de vendas. Ao mover abaixo, ele sai da aba Questionários.</p>
            )}
            {leadStage.kind === 'lost' && lead.lostReason && (
              <p className="text-xs text-slate-400">
                Motivo: {LEAD_LOST_REASON_LABEL[lead.lostReason]}
                {lead.lostReasonNote ? ` — ${lead.lostReasonNote}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {leadStage.kind === 'won' &&
              (lead.convertedClientId ? (
                <Button size="sm" variant="secondary" onClick={() => navigate(`/clientes/${lead.convertedClientId}`)}>
                  Ver cliente
                </Button>
              ) : (
                <Button
                  size="sm"
                  icon={<ArrowRightCircle size={14} />}
                  onClick={handleConvert}
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

        <div className="border-b border-slate-100 px-5 py-3">
          <LeadMoveControl
            key={`${leadPipeline.id}-${leadStage.id}`}
            lead={lead}
            pipelines={pipelines}
            current={{ pipelineId: leadPipeline.id, stageId: leadStage.id }}
            onWon={handleConvert}
          />
        </div>

        {(clientMatch || duplicateLeads.length > 0) && (
          <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-3">
            {clientMatch && (
              <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-800">
                <TriangleAlert size={15} className="shrink-0" />
                <p className="min-w-0 flex-1">
                  Esse contato já é cliente: <span className="font-semibold">{isPrivacyMode ? '••••••' : clientMatch.client.companyName}</span> (
                  {MATCH_REASON_LABEL[clientMatch.reason]}).
                </p>
                <Button size="sm" variant="secondary" onClick={() => navigate(`/clientes/${clientMatch.client.id}`)}>
                  Ver cliente
                </Button>
                <Button size="sm" onClick={handleConvert}>
                  Vincular
                </Button>
              </div>
            )}
            {duplicateLeads.length > 0 && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-800">
                <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                <p className="min-w-0 flex-1">
                  {duplicateLeads.length === 1 ? 'Outro lead tem' : `Outros ${duplicateLeads.length} leads têm`} o mesmo WhatsApp ou e-mail:{' '}
                  {duplicateLeads
                    .map((d) => {
                      const where = locateLead(pipelines, d)
                      const label = isPrivacyMode ? 'Lead ••••••' : d.companyName?.trim() ? `${d.contactName} (${d.companyName.trim()})` : d.contactName
                      return `${label} — ${where.pipeline.name} / ${where.stage.label}`
                    })
                    .join('; ')}
                  . Se for a mesma pessoa, mantenha um e exclua o outro.
                </p>
              </div>
            )}
          </div>
        )}

        <Tabs tabs={leadTabs} active={activeTab ?? defaultTab} onChange={setActiveTab} />
        </div>
        <div className={`min-h-0 min-w-0 flex-1 flex-col lg:flex ${mobilePane === 'feed' ? 'flex' : 'hidden'}`}>
          <LeadFeed lead={lead} />
        </div>
        </div>
      </Drawer>

      <ConvertLeadModal
        lead={converting ? lead : null}
        onClose={() => setConverting(false)}
        onDone={(clientId) => {
          setConverting(false)
          onClose()
          navigate(`/clientes/${clientId}`)
        }}
      />
    </>
  )
}
