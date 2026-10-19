import { useState } from 'react'
import toast from 'react-hot-toast'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Search, Send, Eye, Archive, RotateCcw, FileText, MessageCircle, ClipboardList } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { usePrivacy } from '../../context/PrivacyContext'
import { sendLeadToSales, setLeadFormStage } from '../../services/leadService'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Field, Select } from '../ui/Field'
import { FormAnswerValue } from './FormAnswerValue'
import { leadFormColor } from './leadFormColors'
import { LEAD_FORM_STAGE_LABEL, leadFormStage, locateLead, type Lead, type LeadFormStage, type ResolvedPipeline } from '../../types'
import type { LeadForm } from '../../types/leadForm'

const STAGE_ORDER: LeadFormStage[] = ['new', 'reviewing', 'discarded', 'sent']

const STAGE_TAB_LABEL: Record<LeadFormStage, string> = {
  new: 'Novas',
  reviewing: 'Em análise',
  discarded: 'Descartadas',
  sent: 'Enviadas para vendas',
}

const STAGE_BADGE: Record<LeadFormStage, string> = {
  new: 'bg-brand-50 text-brand-700',
  reviewing: 'bg-amber-50 text-amber-700',
  discarded: 'bg-slate-100 text-slate-500',
  sent: 'bg-emerald-50 text-emerald-700',
}

/** Quantas respostas aparecem antes do "Ver todas". */
const PREVIEW_ANSWERS = 4

function receivedLabel(lead: Lead): string {
  const d = lead.createdAt?.toDate?.()
  if (!d) return 'Recebida agora'
  return `Recebida em ${format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} (${formatDistanceToNow(d, { locale: ptBR, addSuffix: true })})`
}

/** Aba "Questionários" da página de Leads: as respostas dos formulários de
 *  captura chegam aqui, separadas do pipeline de vendas. O time lê, marca em
 *  análise ou descarta, e só manda para vendas quem vale a pena. */
export function QuestionnairePanel({
  leads,
  forms,
  pipelines,
  onOpenLead,
}: {
  leads: Lead[]
  forms: LeadForm[]
  pipelines: ResolvedPipeline[]
  onOpenLead: (id: string) => void
}) {
  const { profile } = useAuth()
  const { isPrivacyMode } = usePrivacy()
  const [stageFilter, setStageFilter] = useState<LeadFormStage>('new')
  const [formFilter, setFormFilter] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [sending, setSending] = useState<Lead | null>(null)
  const [targetPipeline, setTargetPipeline] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  // Aviso falado pro leitor de tela quando uma resposta muda de lugar.
  const [announcement, setAnnouncement] = useState('')

  const formById = Object.fromEntries(forms.map((f) => [f.id, f]))
  const fromForms = leads.filter((l) => l.sourceFormId)
  const byForm = fromForms.filter((l) => !formFilter || l.sourceFormId === formFilter)
  const countByStage = (s: LeadFormStage) => byForm.filter((l) => leadFormStage(l) === s).length

  const needle = search.trim().toLowerCase()
  const digits = needle.replace(/\D/g, '')
  const matchesSearch = (l: Lead) =>
    !needle ||
    [l.contactName, l.companyName, l.email].some((v) => v?.toLowerCase().includes(needle)) ||
    (l.formAnswers ?? []).some((a) => a.value.toLowerCase().includes(needle)) ||
    (digits.length >= 4 && (l.whatsapp ?? '').replace(/\D/g, '').includes(digits))

  const visible = byForm
    .filter((l) => leadFormStage(l) === stageFilter && matchesSearch(l))
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? Date.now()) - (a.createdAt?.toMillis?.() ?? Date.now()))

  const nameOf = (l: Lead) => (isPrivacyMode ? 'Lead oculto' : l.companyName?.trim() ? `${l.contactName}, ${l.companyName.trim()}` : l.contactName)

  const changeStage = async (lead: Lead, stage: Exclude<LeadFormStage, 'sent'>) => {
    if (!profile) return
    setBusyId(lead.id)
    try {
      await setLeadFormStage(lead, stage, profile.id, profile.name)
      const msg = `${nameOf(lead)} movido para ${STAGE_TAB_LABEL[stage]}`
      setAnnouncement(msg)
      toast.success(msg)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao atualizar a resposta')
    } finally {
      setBusyId(null)
    }
  }

  const openSend = (lead: Lead) => {
    setTargetPipeline(pipelines[0]?.id ?? '')
    setSending(lead)
  }

  const confirmSend = async () => {
    if (!profile || !sending) return
    const target = pipelines.find((p) => p.id === targetPipeline) ?? pipelines[0]
    setBusyId(sending.id)
    try {
      await sendLeadToSales(sending, target, profile.id, profile.name)
      const msg = `${nameOf(sending)} enviado para o pipeline ${target.name}, etapa ${target.stages[0].label}`
      setAnnouncement(msg)
      toast.success(msg)
      setSending(null)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao enviar para vendas')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <p className="text-sm text-slate-500">
        Respostas dos formulários de captura. Elas não entram direto no pipeline: leia, qualifique e envie para vendas só quem vale a pena.
      </p>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div role="group" aria-label="Filtrar respostas por situação" className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 sm:w-fit">
        {STAGE_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={stageFilter === s}
            onClick={() => setStageFilter(s)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              stageFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {STAGE_TAB_LABEL[s]}
            <span className={`rounded-full px-1.5 text-xs font-semibold ${stageFilter === s ? 'bg-brand-50 text-brand-700' : 'bg-slate-200 text-slate-500'}`}>{countByStage(s)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome, WhatsApp ou resposta..."
            aria-label="Buscar respostas por nome, WhatsApp ou conteúdo da resposta"
            className="h-9 w-72 max-w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-500">
          Formulário
          <select
            value={formFilter}
            onChange={(e) => setFormFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-brand-600"
          >
            <option value="">Todos ({fromForms.length})</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({fromForms.filter((l) => l.sourceFormId === f.id).length})
              </option>
            ))}
          </select>
        </label>
      </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
          {needle ? 'Nenhuma resposta encontrada nessa busca.' : `Nenhuma resposta em ${STAGE_TAB_LABEL[stageFilter]}.`}
        </p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={`${STAGE_TAB_LABEL[stageFilter]}: ${visible.length} resposta${visible.length === 1 ? '' : 's'}`}>
          {visible.map((lead) => {
            const form = lead.sourceFormId ? formById[lead.sourceFormId] : undefined
            const color = form ? leadFormColor(form) : '#64748B'
            const stage = leadFormStage(lead)
            const answers = lead.formAnswers ?? []
            const open = !!expanded[lead.id]
            const shown = open ? answers : answers.slice(0, PREVIEW_ANSWERS)
            const busy = busyId === lead.id
            const where = stage === 'sent' ? locateLead(pipelines, lead) : null
            const waDigits = (lead.whatsapp ?? '').replace(/\D/g, '')
            const headingId = `q-${lead.id}`
            return (
              <li key={lead.id}>
                <article aria-labelledby={headingId} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]" style={{ borderLeft: `4px solid ${color}` }}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 id={headingId} className="text-base font-semibold text-slate-800">
                        {nameOf(lead)}
                      </h3>
                      <p className="text-xs text-slate-400">{receivedLabel(lead)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold" style={{ background: `${color}1F`, color }}>
                        <ClipboardList size={12} aria-hidden="true" />
                        Formulário: {form?.name ?? 'excluído'}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STAGE_BADGE[stage]}`}>Situação: {LEAD_FORM_STAGE_LABEL[stage]}</span>
                    </div>
                  </div>

                  {!isPrivacyMode && (lead.whatsapp || lead.email) && (
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      {lead.whatsapp && (
                        <a
                          href={waDigits ? `https://wa.me/${waDigits.length <= 11 ? `55${waDigits}` : waDigits}` : undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline"
                          aria-label={`Abrir WhatsApp de ${lead.contactName}: ${lead.whatsapp}`}
                        >
                          <MessageCircle size={14} aria-hidden="true" /> {lead.whatsapp}
                        </a>
                      )}
                      {lead.email && <span className="text-slate-500">{lead.email}</span>}
                    </div>
                  )}

                  {answers.length > 0 && (
                    <div>
                      <h4 className="sr-only">Respostas</h4>
                      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                        {shown.map((a) => (
                          <div key={a.questionId} className="min-w-0">
                            <dt className="text-xs text-slate-400">{a.label}</dt>
                            <dd>{isPrivacyMode ? <p className="text-sm text-slate-400">••••••</p> : <FormAnswerValue value={a.value} />}</dd>
                          </div>
                        ))}
                      </dl>
                      {answers.length > PREVIEW_ANSWERS && (
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setExpanded((e) => ({ ...e, [lead.id]: !open }))}
                          className="mt-2 text-sm font-medium text-brand-600 hover:underline"
                        >
                          {open ? 'Mostrar menos respostas' : `Ver todas as ${answers.length} respostas`}
                        </button>
                      )}
                    </div>
                  )}

                  {where && (
                    <p className="text-sm text-slate-500">
                      Está no pipeline {where.pipeline.name}, etapa {where.stage.label}.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    {(stage === 'new' || stage === 'reviewing') && (
                      <Button size="sm" icon={<Send size={14} />} onClick={() => openSend(lead)} disabled={busy} aria-label={`Enviar ${nameOf(lead)} para vendas`}>
                        Enviar para vendas
                      </Button>
                    )}
                    {stage === 'new' && (
                      <Button size="sm" variant="secondary" icon={<Eye size={14} />} onClick={() => changeStage(lead, 'reviewing')} disabled={busy} aria-label={`Marcar ${nameOf(lead)} como em análise`}>
                        Marcar em análise
                      </Button>
                    )}
                    {(stage === 'new' || stage === 'reviewing') && (
                      <Button size="sm" variant="secondary" icon={<Archive size={14} />} onClick={() => changeStage(lead, 'discarded')} disabled={busy} aria-label={`Descartar ${nameOf(lead)}`}>
                        Descartar
                      </Button>
                    )}
                    {(stage === 'reviewing' || stage === 'discarded') && (
                      <Button size="sm" variant="secondary" icon={<RotateCcw size={14} />} onClick={() => changeStage(lead, 'new')} disabled={busy} aria-label={`Voltar ${nameOf(lead)} para novas`}>
                        Voltar para novas
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" icon={<FileText size={14} />} onClick={() => onOpenLead(lead.id)} aria-label={`Abrir ficha de ${nameOf(lead)}`}>
                      Abrir ficha
                    </Button>
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      )}

      <Modal open={!!sending} onClose={() => setSending(null)} title="Enviar para vendas">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{sending ? nameOf(sending) : ''}</span> sai de Questionários e entra na primeira etapa do pipeline escolhido.
          </p>
          <Field label="Pipeline">
            <Select value={targetPipeline} onChange={(e) => setTargetPipeline(e.target.value)}>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (entra em {p.stages[0]?.label})
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSending(null)} disabled={!!busyId}>
              Cancelar
            </Button>
            <Button icon={<Send size={14} />} onClick={confirmSend} loading={!!busyId}>
              Enviar para vendas
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
