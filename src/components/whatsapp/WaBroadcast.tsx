import { useEffect, useMemo, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, Bot, CheckCircle2, Megaphone, Plus, Search, Send, Trash2, UserRound, XCircle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { useLeads } from '../../hooks/useLeads'
import { useLeadPipelines } from '../../hooks/useLeadPipelines'
import { cancelBroadcast, checkBroadcast, createBroadcast, listenBroadcasts, resumeBroadcast, retryBroadcast } from '../../services/whatsappService'
import { leadPipelineId, isQuestionnaireLead, stageOfLead } from '../../types'
import type { PipelineStage, ResolvedPipeline } from '../../types/leadPipeline'
import type { WaBroadcast, WaDeliveryReason, WaTemplate, WaTemplateExtras } from '../../types/whatsapp'
import { TemplateBubble, TemplateExtraFields, TemplatePickerField, prettyTemplateName, templateNeeds, tplKey } from './WaTemplatePicker'
import { waPhoneKey } from '../../utils/phoneKey'

const phoneKey = (d: string) => waPhoneKey(d) || d

/* Disparo em massa: um modelo aprovado pra várias pessoas de uma vez, escolhidas
 * no funil de Leads (por etapa, uma a uma) ou coladas numa lista. O servidor manda
 * em lotes (api/_lib/whatsapp.js, createBroadcast/runBroadcast). */

interface Person {
  key: string
  to: string
  name: string
  company: string
  city: string
  leadId?: string
  stage?: string
}

type VarSource = 'first' | 'full' | 'company' | 'city' | 'fixed'
interface VarMap {
  source: VarSource
  /** Texto fixo, ou o que usar quando a pessoa não tem o dado. */
  text: string
}

const SOURCE_LABEL: Record<VarSource, string> = {
  first: 'Primeiro nome',
  full: 'Nome completo',
  company: 'Empresa',
  city: 'Cidade',
  fixed: 'Texto fixo (igual pra todos)',
}

const onlyDigits = (v: string) => v.replace(/\D/g, '')

function resolve(m: VarMap, p: Person) {
  if (m.source === 'fixed') return m.text.trim()
  const v = m.source === 'first' ? p.name.trim().split(/\s+/)[0] || '' : m.source === 'full' ? p.name : m.source === 'company' ? p.company : p.city
  return (v || '').trim() || m.text.trim()
}

/** "11 99999-9999, Maria, Limpeza X" → pessoa. Uma por linha. */
function parsePasted(text: string): Person[] {
  const out: Person[] = []
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(/[;,\t]/).map((x) => x.trim()).filter(Boolean)
    const phoneIdx = parts.findIndex((x) => onlyDigits(x).length >= 10)
    if (phoneIdx < 0) continue
    const to = onlyDigits(parts[phoneIdx])
    const rest = parts.filter((_, i) => i !== phoneIdx)
    out.push({ key: `p:${phoneKey(to)}`, to, name: rest[0] || '', company: rest[1] || '', city: rest[2] || '' })
  }
  return out
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/* ------------------------------ histórico ------------------------------ */

const LEVEL_LABEL: Record<WaDeliveryReason['level'], { label: string; tone: string }> = {
  account: { label: 'Problema da conta', tone: 'bg-red-500/15 text-red-300' },
  temp: { label: 'Passageiro', tone: 'bg-sky-500/15 text-sky-300' },
  person: { label: 'Só desse número', tone: 'bg-slate-500/15 text-slate-300' },
}
const LEVEL_ORDER = { account: 0, temp: 1, person: 2 } as const

/** Erros do disparo agrupados por motivo, com o que quer dizer e o que fazer. */
function DeliveryProblems({ bc }: { bc: WaBroadcast }) {
  const [busy, setBusy] = useState<'check' | 'retry' | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [confirmRetry, setConfirmRetry] = useState(false)
  const d = bc.delivery
  const reasons = Object.entries(d?.reasons || {})
    .filter(([, r]) => r && r.count > 0)
    .sort(([, a], [, b]) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.count - a.count)
  const retryCount = reasons.reduce((n, [, r]) => n + (r.retry ? r.people?.length || 0 : 0), 0)

  const check = async () => {
    setBusy('check')
    try {
      await checkBroadcast(bc.id)
      toast.success('Entrega conferida.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  // Abre conferindo sozinho se nunca conferiu ou se faz mais de 10 min.
  useEffect(() => {
    const old = !d?.checkedAt || Date.now() - new Date(d.checkedAt).getTime() > 10 * 60_000
    if (old && bc.status !== 'sending') void check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bc.id])

  const retry = async () => {
    setBusy('retry')
    try {
      const out = await retryBroadcast(bc.id)
      toast.success(`Reenvio criado para ${out.total} pessoa${out.total === 1 ? '' : 's'}. Ele aparece no topo do histórico.`)
      setConfirmRetry(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-label={`Entrega do disparo ${bc.name}`} className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-800">Entrega e erros</h4>
        <Button size="sm" variant="secondary" onClick={check} loading={busy === 'check'}>
          Conferir entrega
        </Button>
      </div>
      {d?.checkedAt ? (
        <p className="mt-1 text-xs text-slate-500">
          Conferido às {fmtDate(d.checkedAt)}: <strong className="text-slate-800">{d.read || 0}</strong> lidas, <strong className="text-slate-800">{d.delivered || 0}</strong> entregues sem ler, <strong className="text-slate-800">{d.waiting || 0}</strong> sem confirmação ainda e{' '}
          <strong className="text-red-400">{d.failed || 0}</strong> não receberam.
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">{busy === 'check' ? 'Conferindo pessoa por pessoa...' : 'Ainda não conferido.'}</p>
      )}

      {reasons.length === 0 ? (
        d?.checkedAt && <p className="mt-2 text-xs text-emerald-400">Nenhum erro de entrega.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2" aria-label="Motivos dos erros">
          {reasons.map(([key, r]) => {
            const lvl = LEVEL_LABEL[r.level] || LEVEL_LABEL.person
            const open = openKey === key
            return (
              <li key={key} className="rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle size={14} className={r.level === 'account' ? 'text-red-400' : 'text-amber-400'} aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-800">
                    {r.title}: {r.count} pessoa{r.count === 1 ? '' : 's'}
                  </p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${lvl.tone}`}>{lvl.label}</span>
                </div>
                {r.why && <p className="mt-1 text-xs text-slate-500">{r.why}</p>}
                {r.fix && (
                  <p className="mt-1 text-xs text-slate-700">
                    <strong>O que fazer:</strong> {r.fix}
                  </p>
                )}
                {!!r.people?.length && (
                  <>
                    <button type="button" onClick={() => setOpenKey(open ? null : key)} aria-expanded={open} className="mt-1 text-xs font-semibold text-brand-500 hover:underline">
                      {open ? 'Esconder pessoas' : `Ver pessoas (${r.people.length})`}
                    </button>
                    {open && (
                      <ul className="mt-1 max-h-40 overflow-y-auto rounded bg-slate-50 p-2 text-xs" aria-label={`Pessoas com ${r.title}`}>
                        {r.people.map((p) => (
                          <li key={p.to} className="py-0.5">
                            <span className="font-semibold text-slate-700">{p.name || p.to}</span> <span className="text-slate-400">({p.to})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {retryCount > 0 && bc.status !== 'sending' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!confirmRetry ? (
            <Button size="sm" onClick={() => setConfirmRetry(true)}>
              Reenviar para quem não recebeu ({retryCount})
            </Button>
          ) : (
            <>
              <p className="text-xs text-slate-600" role="status">
                Vai criar um disparo novo para {retryCount} pessoa{retryCount === 1 ? '' : 's'}, com o mesmo modelo. Resolva o problema da conta antes, senão falha de novo.
              </p>
              <Button size="sm" onClick={retry} loading={busy === 'retry'}>
                Confirmar reenvio
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirmRetry(false)}>
                Voltar
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  )
}

function BroadcastCard({ bc }: { bc: WaBroadcast }) {
  const [open, setOpen] = useState(bc.status === 'paused')
  const [busy, setBusy] = useState(false)
  const done = bc.sent + bc.failed
  const pct = bc.total ? Math.round((done / bc.total) * 100) : 0
  const liveFailed = bc.delivery?.failed || 0
  const problems = bc.failed + liveFailed
  const status =
    bc.status === 'sending'
      ? { label: 'Enviando', tone: 'bg-sky-500/15 text-sky-300' }
      : bc.status === 'sequence'
        ? { label: 'Em sequência', tone: 'bg-violet-500/15 text-violet-300' }
        : bc.status === 'paused'
        ? { label: 'Pausado', tone: 'bg-amber-500/15 text-amber-300' }
        : bc.status === 'canceled'
          ? { label: 'Cancelado', tone: 'bg-slate-500/15 text-slate-300' }
          : { label: 'Concluído', tone: 'bg-emerald-500/15 text-emerald-300' }
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      toast.success(ok)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{bc.name}</p>
          <p className="text-xs text-slate-400">
            {prettyTemplateName(bc.template.name)} · {fmtDate(bc.createdAt)}
            {bc.createdByName ? ` · ${bc.createdByName}` : ''} · {bc.aiMode === 'auto' ? 'IA responde' : 'equipe responde'}
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.tone}`}>{status.label}</span>
      </div>
      {bc.status === 'paused' && (
        <p className="mt-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-300" role="status">
          Pausado sozinho{bc.pausedReason ? `: ${bc.pausedReason}` : ''}. O resto falharia igual. Resolva o problema (veja abaixo) e clique em Retomar.
        </p>
      )}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${pct}% enviado`}>
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>
          <strong className="text-slate-800">{bc.sent}</strong> enviadas
        </span>
        {problems > 0 && (
          <span className="text-red-400">
            <strong>{problems}</strong> com erro
          </span>
        )}
        <span>
          de <strong className="text-slate-800">{bc.total}</strong>
        </span>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="font-semibold text-brand-500 hover:underline">
            {open ? 'Esconder entrega' : problems > 0 ? 'Ver erros e o que fazer' : 'Ver entrega'}
          </button>
          {bc.status === 'paused' && (
            <Button size="sm" onClick={() => run(() => resumeBroadcast(bc.id), 'Disparo retomado.')} loading={busy}>
              Retomar
            </Button>
          )}
          {(bc.status === 'sending' || bc.status === 'paused' || bc.status === 'sequence') && (
            <Button size="sm" variant="danger" onClick={() => run(() => cancelBroadcast(bc.id), 'Disparo cancelado. O que já saiu não volta.')} loading={busy}>
              Cancelar
            </Button>
          )}
        </span>
      </div>
      <SequenceSummary bc={bc} />
      {open && <DeliveryProblems bc={bc} />}
    </li>
  )
}

function BroadcastHistory({ rows }: { rows: WaBroadcast[] }) {
  if (!rows.length) return <p className="py-10 text-center text-sm text-slate-400">Nenhum disparo feito ainda.</p>
  return (
    <ul className="flex flex-col gap-2" aria-label="Disparos feitos">
      {rows.map((bc) => (
        <BroadcastCard key={bc.id} bc={bc} />
      ))}
    </ul>
  )
}

/* ------------------------------ novo disparo ------------------------------ */

function Step({ n, title, children, hint }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby={`bc-step-${n}`}>
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white" aria-hidden="true">
          {n}
        </span>
        <div>
          <h3 id={`bc-step-${n}`} className="text-[15px] font-semibold text-slate-800">
            {title}
          </h3>
          {hint && <p className="text-xs text-slate-400">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

/* ------------------------------ sequência + funil ------------------------------ */

interface SeqStep {
  key: string
  afterHours: number
}
interface FlowDraft {
  pipelineId: string
  stepStages: string[]
  noReplyStage: string
  noReplyAfterHours: number
  errorStage: string
  repliedPipelineId: string
  repliedStage: string
}
const EMPTY_FLOW: FlowDraft = { pipelineId: '', stepStages: [], noReplyStage: '', noReplyAfterHours: 48, errorStage: '', repliedPipelineId: '', repliedStage: '' }

/** "reativ_1_v8i941" -> { base: 'reativ_', n: 1 }; "d1_0p82kp" -> { base: 'd', n: 1 }. */
function seriesOf(name: string): { base: string; n: number } | null {
  const m = /^(.*?)(\d+)_[a-z0-9]{6}$/i.exec(name)
  return m ? { base: m[1], n: Number(m[2]) } : null
}

/** Próximos modelos da mesma série (reativ_2, reativ_3...), na ordem. */
function nextInSeries(tpl: WaTemplate | undefined, templates: WaTemplate[]): WaTemplate[] {
  const s = tpl && seriesOf(tpl.name)
  if (!s) return []
  const out: WaTemplate[] = []
  for (let n = s.n + 1; n < s.n + 13; n++) {
    const t = templates.find((x) => x.status === 'APPROVED' && x.language === tpl!.language && seriesOf(x.name)?.base === s.base && seriesOf(x.name)?.n === n)
    if (!t) break
    out.push(t)
  }
  return out
}

const norm = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** Etapa do funil para o passo n (1 = primeiro modelo): pelo número no nome ("Disparo 2", "Reativ 2", "Fup 2") ou pela ordem. */
function stageForStep(stages: PipelineStage[], n: number): string {
  const byNum = stages.find((st) => new RegExp(`(^|\\D)${n}$`).test(norm(st.label).trim()) && !/nao respondeu|erro/.test(norm(st.label)))
  if (byNum) return byNum.id
  const open = stages.filter((st) => st.kind === 'open' && !/lista|nao respondeu|erro/.test(norm(st.label)))
  return open[n - 1]?.id || ''
}
const stageLike = (stages: PipelineStage[], re: RegExp) => stages.find((st) => re.test(norm(st.label)))?.id || ''

function SequenceAndFlow({
  tpl,
  templates,
  steps,
  onSteps,
  flow,
  onFlow,
  pipelines,
  usesLeads,
  people,
}: {
  tpl: WaTemplate | undefined
  templates: WaTemplate[]
  steps: SeqStep[]
  onSteps: (s: SeqStep[]) => void
  flow: FlowDraft
  onFlow: (f: FlowDraft) => void
  pipelines: ResolvedPipeline[]
  usesLeads: boolean
  people: number
}) {
  const series = nextInSeries(tpl, templates)
  const pipe = pipelines.find((p) => p.id === flow.pipelineId)
  const repliedPipe = pipelines.find((p) => p.id === (flow.repliedPipelineId || flow.pipelineId))
  const total = 1 + steps.length
  const stepTpl = (k: string) => templates.find((t) => tplKey(t) === k)
  const badVars = steps.filter((st) => {
    const t = stepTpl(st.key)
    return t && t.vars && tpl && t.vars !== tpl.vars
  }).length

  const pickPipeline = (id: string) => {
    const p = pipelines.find((x) => x.id === id)
    if (!p) return onFlow({ ...EMPTY_FLOW })
    const sales = pipelines.find((x) => x.isDefault) || pipelines[0]
    onFlow({
      ...flow,
      pipelineId: p.id,
      stepStages: Array.from({ length: total }, (_, i) => stageForStep(p.stages, i + 1)),
      noReplyStage: stageLike(p.stages, /nao respondeu/),
      errorStage: stageLike(p.stages, /erro/),
      repliedPipelineId: flow.repliedPipelineId || sales?.id || '',
      repliedStage: flow.repliedStage || (sales ? stageLike(sales.stages, /em contato|respondeu/) || sales.stages[1]?.id || '' : ''),
    })
  }
  // Mudou o número de passos: completa as etapas que faltam.
  useEffect(() => {
    if (!pipe || flow.stepStages.length === total) return
    onFlow({ ...flow, stepStages: Array.from({ length: total }, (_, i) => flow.stepStages[i] ?? stageForStep(pipe.stages, i + 1)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, pipe?.id])

  const stageSelect = (value: string, onChange: (v: string) => void, label: string, p = pipe) => (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">Não mover</option>
      {p?.stages.map((st) => (
        <option key={st.id} value={st.id}>
          {st.label}
        </option>
      ))}
    </Select>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-slate-600">Quem não responder recebe a próxima mensagem sozinho, no tempo que você escolher. Quem responder sai da sequência e vai para a IA ou para a equipe. Só envia de segunda a sábado, das 8h às 20h.</p>
        {series.length > 0 && steps.length === 0 && (
          <Button size="sm" variant="secondary" onClick={() => onSteps(series.map((t) => ({ key: tplKey(t), afterHours: 24 })))}>
            Montar a sequência com {series.map((t) => prettyTemplateName(t.name)).join(', ')} (1 a cada 24h)
          </Button>
        )}
        {steps.length > 0 && (
          <ol className="flex flex-col gap-2" aria-label="Passos da sequência">
            {steps.map((st, i) => {
              const t = stepTpl(st.key)
              const wrong = Boolean(t && t.vars && tpl && t.vars !== tpl.vars)
              return (
                <li key={i} className="rounded-xl border border-slate-200 p-2.5">
                  <div className="flex flex-wrap items-end gap-2">
                    <span className="pb-2 text-sm font-semibold text-slate-800">Passo {i + 2}</span>
                    <label className="flex items-center gap-1.5 pb-1.5 text-xs text-slate-500">
                      depois de
                      <input
                        type="number"
                        min={1}
                        max={720}
                        value={st.afterHours}
                        onChange={(e) => onSteps(steps.map((x, j) => (j === i ? { ...x, afterHours: Math.max(1, Number(e.target.value) || 24) } : x)))}
                        className="h-8 w-16 rounded-lg border border-slate-200 bg-white px-2 text-center text-sm font-semibold text-slate-800"
                        aria-label={`Horas sem resposta antes do passo ${i + 2}`}
                      />
                      horas sem resposta
                    </label>
                    <button type="button" onClick={() => onSteps(steps.filter((_, j) => j !== i))} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-400" aria-label={`Tirar o passo ${i + 2}`}>
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                  <TemplatePickerField label={`Modelo do passo ${i + 2}`} templates={templates} value={st.key} onChange={(nt) => onSteps(steps.map((x, j) => (j === i ? { ...x, key: nt ? tplKey(nt) : '' } : x)))} />
                  {wrong && <p className="mt-1 text-xs text-amber-400">Esse modelo tem partes para preencher diferentes do primeiro. Use um sem partes ou com as mesmas.</p>}
                </li>
              )
            })}
          </ol>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<Plus size={14} aria-hidden="true" />} disabled={steps.length >= 11} onClick={() => onSteps([...steps, { key: '', afterHours: 24 }])}>
            Adicionar passo
          </Button>
          {steps.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => onSteps([])}>
              Sem sequência
            </Button>
          )}
        </div>
        {badVars > 0 && <p className="text-xs text-amber-400">Corrija o modelo de {badVars} passo{badVars === 1 ? '' : 's'}.</p>}
      </div>

      <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3">
        <span className="text-sm font-semibold text-slate-800">Mover no funil (opcional)</span>
        {!usesLeads ? (
          <p className="text-xs text-slate-500">Só para quem vem de "Leads do funil". Números colados não têm ficha para mover.</p>
        ) : (
          <>
            <Field label="Funil do disparo" hint='Ex.: um funil "Reativação" com as etapas Lista, Reativ 1, Reativ 2... Não respondeu, Erro de envio. Crie o funil em Leads, se ainda não tiver.'>
              <Select value={flow.pipelineId} onChange={(e) => pickPipeline(e.target.value)}>
                <option value="">Não mover os leads</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            {pipe && (
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: total }, (_, i) => (
                  <Field key={i} label={`Recebeu o passo ${i + 1}, vai para`}>
                    {stageSelect(flow.stepStages[i] || '', (v) => onFlow({ ...flow, stepStages: Array.from({ length: total }, (_, j) => (j === i ? v : flow.stepStages[j] || '')) }), `Etapa depois do passo ${i + 1}`)}
                  </Field>
                ))}
                <Field label="Não respondeu nenhum, vai para">{stageSelect(flow.noReplyStage, (v) => onFlow({ ...flow, noReplyStage: v }), 'Etapa de quem não respondeu')}</Field>
                {flow.noReplyStage && (
                  <label className="flex items-center gap-1.5 self-end pb-2 text-xs text-slate-500">
                    depois de
                    <input
                      type="number"
                      min={1}
                      max={720}
                      value={flow.noReplyAfterHours}
                      onChange={(e) => onFlow({ ...flow, noReplyAfterHours: Math.max(1, Number(e.target.value) || 48) })}
                      className="h-8 w-16 rounded-lg border border-slate-200 bg-white px-2 text-center text-sm font-semibold text-slate-800"
                      aria-label="Horas depois do último passo para marcar como não respondeu"
                    />
                    horas do último passo
                  </label>
                )}
                <Field label="Deu erro no envio, vai para">{stageSelect(flow.errorStage, (v) => onFlow({ ...flow, errorStage: v }), 'Etapa de erro de envio')}</Field>
              </div>
            )}
            {pipe && (
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Quando responder, levar para o funil">
                  <Select value={flow.repliedPipelineId || flow.pipelineId} onChange={(e) => onFlow({ ...flow, repliedPipelineId: e.target.value, repliedStage: '' })}>
                    {pipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Na etapa">{stageSelect(flow.repliedStage, (v) => onFlow({ ...flow, repliedStage: v }), 'Etapa de quem respondeu', repliedPipe)}</Field>
              </div>
            )}
            {pipe && <p className="text-xs text-slate-500">Lead que já é cliente (etapa de ganho) não sai do lugar.</p>}
          </>
        )}
      </div>
      {steps.length > 0 && tpl?.category === 'MARKETING' && people > 0 && (
        <p className="text-xs text-amber-300">Se ninguém responder, a sequência inteira custa perto de R$ {(people * total * 0.35).toFixed(2).replace('.', ',')} ({total} mensagens por pessoa).</p>
      )}
    </div>
  )
}

/** Resumo da sequência no cartão do histórico. */
function SequenceSummary({ bc }: { bc: WaBroadcast }) {
  const seq = bc.sequence || []
  if (!seq.length && !bc.flow?.noReplyStage) return null
  const rs = (bc.recipients || []).filter((r) => r.status === 'sent')
  const going = rs.filter((r) => !r.seqDone && r.nextAt).length
  const replied = rs.filter((r) => r.seqDone === 'respondeu').length
  const noReply = rs.filter((r) => r.seqDone === 'não respondeu' || r.seqDone === 'terminou').length
  const out = rs.filter((r) => r.seqDone && !['respondeu', 'não respondeu', 'terminou'].includes(r.seqDone)).length
  const perStep = Array.from({ length: seq.length + 1 }, (_, i) => rs.filter((r) => !r.seqDone && Number(r.step || 0) === i).length)
  const next = rs
    .filter((r) => !r.seqDone && r.nextAt)
    .map((r) => r.nextAt as string)
    .sort()[0]
  return (
    <div className="mt-2 rounded-lg bg-violet-500/10 p-2.5 text-xs text-slate-600">
      <p>
        <strong className="text-slate-800">Sequência de {seq.length + 1} passos:</strong> {going} ainda recebendo · <span className="text-emerald-400">{replied} responderam</span> · {noReply} não responderam
        {out > 0 ? ` · ${out} saíram (outro disparo, lead fechado ou erro)` : ''}
      </p>
      {going > 0 && (
        <p className="mt-0.5 text-slate-500">
          Esperando: {perStep.map((n, i) => (n ? `${n} no passo ${i + 1}` : '')).filter(Boolean).join(', ')}
          {next ? `. Próximo envio a partir de ${fmtDate(next)}` : ''}
        </p>
      )}
    </div>
  )
}

function NewBroadcast({ templates, initialPipelineId, onDone }: { templates: WaTemplate[]; initialPipelineId?: string; onDone: () => void }) {
  const { data: leads } = useLeads()
  const { pipelines } = useLeadPipelines()
  const [mode, setMode] = useState<'leads' | 'paste'>('leads')
  const [pipelineId, setPipelineId] = useState(initialPipelineId || '')
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0]
  const [stages, setStages] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [pasted, setPasted] = useState('')

  const [key, setKey] = useState('')
  const tpl = templates.find((t) => tplKey(t) === key && t.status === 'APPROVED')
  const [vars, setVars] = useState<VarMap[]>([])
  const [extras, setExtras] = useState<WaTemplateExtras>({})
  const [name, setName] = useState('')
  const [aiMode, setAiMode] = useState<'auto' | 'off'>('auto')
  const [confirm, setConfirm] = useState(false)
  const [sending, setSending] = useState(false)
  const [seqSteps, setSeqSteps] = useState<SeqStep[]>([])
  const [flow, setFlow] = useState<FlowDraft>(EMPTY_FLOW)

  useEffect(() => {
    if (!pipelineId && pipelines[0]) setPipelineId(pipelines[0].id)
  }, [pipelineId, pipelines])

  // Pessoas do funil escolhido (com WhatsApp), sem repetir número.
  const pipelinePeople = useMemo(() => {
    if (!pipeline) return { all: [] as Person[], noPhone: 0 }
    const seen = new Set<string>()
    const all: Person[] = []
    let noPhone = 0
    for (const l of leads) {
      if (isQuestionnaireLead(l) || leadPipelineId(l) !== pipeline.id) continue
      const st = stageOfLead(pipeline, l.status)
      if (!stages.has(st.id)) continue
      const d = onlyDigits(l.whatsapp || '')
      if (d.length < 10) {
        noPhone++
        continue
      }
      const k = phoneKey(d)
      if (seen.has(k)) continue
      seen.add(k)
      all.push({ key: `l:${l.id}`, to: d, name: l.contactName || '', company: l.companyName || '', city: l.cityRegion || '', leadId: l.id, stage: st.label })
    }
    return { all, noPhone }
  }, [leads, pipeline, stages])

  const stageCount = (id: string) => (pipeline ? leads.filter((l) => !isQuestionnaireLead(l) && leadPipelineId(l) === pipeline.id && stageOfLead(pipeline, l.status).id === id).length : 0)

  const needle = q.trim().toLowerCase()
  const visible = mode === 'leads' ? pipelinePeople.all.filter((p) => !needle || `${p.name} ${p.company} ${p.city} ${p.to}`.toLowerCase().includes(needle)) : []
  const pastedPeople = useMemo(() => {
    const seen = new Set<string>()
    return parsePasted(pasted).filter((p) => (seen.has(p.key) ? false : (seen.add(p.key), true)))
  }, [pasted])
  const recipients = mode === 'leads' ? pipelinePeople.all.filter((p) => !excluded.has(p.key)) : pastedPeople

  const pickTemplate = (t: WaTemplate | null) => {
    setKey(t ? tplKey(t) : '')
    setExtras({})
    setVars(t ? Array.from({ length: t.vars }, (_, i) => (i === 0 ? { source: 'first' as VarSource, text: '' } : { source: 'fixed' as VarSource, text: '' })) : [])
    if (t && !name) setName(`${prettyTemplateName(t.name)} ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`)
  }

  const missing = tpl ? recipients.filter((p) => vars.some((m) => !resolve(m, p))).length : 0
  const need = templateNeeds(tpl)
  const extrasMissing = Boolean(tpl && (need.headerVar && !extras.headerText?.trim())) || need.urlButtons.some((b) => !extras.buttonParams?.[b.index]?.trim())
  const sample = recipients[0]
  const cat = tpl?.category
  const seqOk = seqSteps.every((st) => {
    const t = templates.find((x) => tplKey(x) === st.key)
    return t && (!t.vars || t.vars === tpl?.vars)
  })
  const ready = Boolean(tpl && recipients.length && !missing && !extrasMissing && seqOk && confirm)

  const toggleStage = (id: string) => {
    setStages((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleOne = (k: string) => {
    setExcluded((cur) => {
      const next = new Set(cur)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }
  const allVisibleOn = visible.length > 0 && visible.every((p) => !excluded.has(p.key))
  const toggleAllVisible = () =>
    setExcluded((cur) => {
      const next = new Set(cur)
      for (const p of visible) {
        if (allVisibleOn) next.add(p.key)
        else next.delete(p.key)
      }
      return next
    })

  const send = async () => {
    if (!tpl || !ready) return
    setSending(true)
    try {
      const out = await createBroadcast({
        name: name.trim() || prettyTemplateName(tpl.name),
        template: { name: tpl.name, lang: tpl.language },
        headerMedia: extras.headerMedia || '',
        aiMode,
        recipients: recipients.map((p) => ({
          to: p.to,
          name: p.name,
          leadId: p.leadId,
          params: vars.map((m) => resolve(m, p)),
          headerText: extras.headerText || '',
          buttonParams: extras.buttonParams || {},
        })),
        sequence: seqSteps.map((st) => {
          const t = templates.find((x) => tplKey(x) === st.key)!
          return { template: { name: t.name, lang: t.language }, afterHours: st.afterHours }
        }),
        flow: mode === 'leads' && (flow.pipelineId || flow.repliedStage) ? flow : null,
      })
      toast.success(`Disparo começou: ${out.total} pessoa${out.total === 1 ? '' : 's'}. Acompanhe no histórico.`)
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const chip = (on: boolean) => `rounded-lg border px-3 py-1.5 text-sm font-medium transition ${on ? 'border-brand-500 bg-brand-500/15 text-brand-300' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`

  return (
    <div className="flex flex-col gap-3">
      <Step n={1} title="Quem recebe" hint="Escolha as etapas do funil e tire quem não deve receber, ou cole uma lista de números.">
        <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="De onde vêm as pessoas">
          {(
            [
              ['leads', 'Leads do funil'],
              ['paste', 'Colar números'],
            ] as const
          ).map(([m, label]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              {label}
            </button>
          ))}
        </div>

        {mode === 'leads' ? (
          <div className="flex flex-col gap-3">
            {pipelines.length > 1 && (
              <Field label="Funil">
                <Select
                  value={pipeline?.id || ''}
                  onChange={(e) => {
                    setPipelineId(e.target.value)
                    setStages(new Set())
                  }}
                >
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <div>
              <span className="mb-1.5 block text-xs font-medium text-slate-500">Etapas (pode marcar várias)</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Etapas do funil">
                {pipeline?.stages.map((s) => (
                  <button key={s.id} type="button" aria-pressed={stages.has(s.id)} onClick={() => toggleStage(s.id)} className={chip(stages.has(s.id))}>
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: s.color }} aria-hidden="true" />
                    {s.label} <span className="text-xs opacity-70">({stageCount(s.id)})</span>
                  </button>
                ))}
              </div>
            </div>

            {stages.size > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[180px] flex-1">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Buscar nessa lista"
                      aria-label="Buscar pessoa na lista do disparo"
                      className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                    <input type="checkbox" checked={allVisibleOn} onChange={toggleAllVisible} className="h-4 w-4 accent-emerald-500" />
                    Marcar todos{needle ? ' da busca' : ''}
                  </label>
                </div>
                <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200" aria-label="Pessoas do disparo">
                  {visible.length === 0 && <li className="p-4 text-center text-sm text-slate-400">Ninguém com WhatsApp nessas etapas.</li>}
                  {visible.map((p) => {
                    const on = !excluded.has(p.key)
                    return (
                      <li key={p.key}>
                        <label className={`flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50 ${on ? '' : 'opacity-50'}`}>
                          <input type="checkbox" checked={on} onChange={() => toggleOne(p.key)} className="h-4 w-4 shrink-0 accent-emerald-500" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-800">{p.name || 'Sem nome'}</span>
                            <span className="block truncate text-xs text-slate-400">
                              {[p.company, p.stage, p.to].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
                {pipelinePeople.noPhone > 0 && (
                  <p className="text-xs text-slate-400">
                    {pipelinePeople.noPhone} lead{pipelinePeople.noPhone === 1 ? '' : 's'} sem WhatsApp cadastrado fica{pipelinePeople.noPhone === 1 ? '' : 'm'} de fora.
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          <Field label="Um por linha: número, nome, empresa (nome e empresa são opcionais)">
            <Textarea rows={7} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'11 99999-1234, Maria, Limpeza Brilho\n21 98888-4321, João'} className="text-[14px] leading-6" />
          </Field>
        )}
        <p className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300" aria-live="polite">
          <UserRound size={14} className="mr-1.5 inline align-[-2px]" aria-hidden="true" />
          {recipients.length} pessoa{recipients.length === 1 ? '' : 's'} vão receber
        </p>
      </Step>

      <Step n={2} title="Mensagem" hint="Só modelos aprovados no Meta podem ser disparados.">
        <div className="flex flex-col gap-3">
          <TemplatePickerField label="Modelo" templates={templates} value={key} onChange={pickTemplate} />
          {tpl && vars.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-slate-500">O que entra em cada parte amarela</span>
              {vars.map((m, i) => (
                <div key={i} className="grid items-end gap-2 rounded-xl bg-slate-50 p-2.5 sm:grid-cols-[90px_1fr_1fr]">
                  <span className="text-sm font-semibold text-amber-300">{`{{${tpl.varNames?.[i] || i + 1}}}`}</span>
                  <Field label="Usar">
                    <Select value={m.source} onChange={(e) => setVars((cur) => cur.map((x, j) => (j === i ? { ...x, source: e.target.value as VarSource } : x)))}>
                      {(Object.keys(SOURCE_LABEL) as VarSource[]).map((s) => (
                        <option key={s} value={s}>
                          {SOURCE_LABEL[s]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={m.source === 'fixed' ? 'Texto' : 'Se a pessoa não tiver, usar'}>
                    <Input value={m.text} onChange={(e) => setVars((cur) => cur.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} placeholder={m.source === 'fixed' ? '' : m.source === 'company' ? 'sua empresa' : 'tudo bem'} />
                  </Field>
                </div>
              ))}
              {missing > 0 && (
                <p className="flex items-center gap-1.5 text-sm text-amber-400">
                  <AlertTriangle size={14} aria-hidden="true" />
                  {missing} pessoa{missing === 1 ? '' : 's'} sem esse dado. Preencha "Se a pessoa não tiver, usar".
                </p>
              )}
            </div>
          )}
          {tpl && <TemplateExtraFields tpl={tpl} extras={extras} onChange={setExtras} />}
        </div>
      </Step>

      <Step n={3} title="Se não responder" hint="Opcional: próximas mensagens automáticas e etapas do funil, igual aos funis de disparo do Kommo.">
        <SequenceAndFlow tpl={tpl} templates={templates} steps={seqSteps} onSteps={setSeqSteps} flow={flow} onFlow={setFlow} pipelines={pipelines} usesLeads={mode === 'leads'} people={recipients.length} />
      </Step>

      <Step n={4} title="Revisar e disparar">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-3">
            <Field label="Nome do disparo (só pra vocês)">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Reativação outubro" maxLength={80} />
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-slate-500">Quando a pessoa responder</legend>
              <div className="flex flex-col gap-1.5">
                {(
                  [
                    ['auto', 'A IA responde (SDR)', 'Ela vê a mensagem do disparo e continua a conversa.'],
                    ['off', 'A equipe responde', 'A IA fica desligada nessas conversas.'],
                  ] as const
                ).map(([v, label, hint]) => (
                  <label key={v} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 ${aiMode === v ? 'border-brand-500 bg-brand-500/10' : 'border-slate-200'}`}>
                    <input type="radio" name="bc-ai" checked={aiMode === v} onChange={() => setAiMode(v)} className="mt-1 accent-emerald-500" />
                    <span>
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                        {v === 'auto' && <Bot size={14} aria-hidden="true" />}
                        {label}
                      </span>
                      <span className="block text-xs text-slate-400">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
              <p>
                {cat === 'MARKETING'
                  ? 'Modelo de Marketing: o Meta cobra cada mensagem entregue (no Brasil, uns R$ 0,35 cada).'
                  : cat === 'UTILITY'
                    ? 'Modelo de Utilidade: o Meta cobra cada mensagem entregue (bem mais barato que Marketing).'
                    : 'O Meta cobra cada mensagem de modelo entregue.'}
                {recipients.length > 0 && cat === 'MARKETING' && <> Esse disparo: perto de R$ {(recipients.length * 0.35).toFixed(2).replace('.', ',')}.</>}
              </p>
              <p className="mt-1">Número novo no Meta tem limite de pessoas por dia (começa em 250). Quem passar do limite fica com erro no histórico.</p>
            </div>
            <label className="flex items-start gap-2.5 text-sm text-slate-700">
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-500" />
              Conferi a mensagem e quero mandar para {recipients.length} pessoa{recipients.length === 1 ? '' : 's'}.
            </label>
          </div>
          <div className="wa-wall flex flex-col gap-2 rounded-2xl p-4">
            <span className="text-xs font-semibold text-slate-400">{sample ? `Como chega para ${sample.name || sample.to}` : 'Prévia'}</span>
            {tpl ? <TemplateBubble tpl={tpl} params={sample ? vars.map((m) => resolve(m, sample)) : []} extras={extras} /> : <p className="m-auto py-8 text-center text-sm text-slate-400">Escolha o modelo para ver a prévia.</p>}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {!ready && (
            <span className="text-xs text-slate-400">
              {!recipients.length ? 'Escolha quem recebe.' : !tpl ? 'Escolha o modelo.' : missing || extrasMissing ? 'Complete as partes do modelo.' : !seqOk ? 'Escolha o modelo de cada passo da sequência.' : 'Marque a confirmação.'}
            </span>
          )}
          <Button onClick={send} loading={sending} disabled={!ready} icon={<Send size={15} aria-hidden="true" />}>
            Disparar para {recipients.length} pessoa{recipients.length === 1 ? '' : 's'}
          </Button>
        </div>
      </Step>
    </div>
  )
}

/* ------------------------------ janela ------------------------------ */

export function BroadcastModal({ open, onClose, templates, initialPipelineId }: { open: boolean; onClose: () => void; templates: WaTemplate[]; initialPipelineId?: string }) {
  const [tab, setTab] = useState<'new' | 'history'>('new')
  const [rows, setRows] = useState<WaBroadcast[]>([])
  const [formKey, setFormKey] = useState(0)
  useEffect(() => {
    if (!open) return
    return listenBroadcasts(setRows, () => setRows([]))
  }, [open])
  // Disparo pausado por problema na conta: abre direto no histórico pra mostrar o motivo.
  const [autoTab, setAutoTab] = useState(true)
  useEffect(() => {
    if (autoTab && rows.some((r) => r.status === 'paused')) {
      setTab('history')
      setAutoTab(false)
    }
  }, [rows, autoTab])
  const running = rows.filter((r) => r.status === 'sending' || r.status === 'sequence').length
  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-4xl"
      title={
        <span className="flex items-center gap-2">
          <Megaphone size={18} className="text-emerald-400" aria-hidden="true" />
          Disparo de WhatsApp
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Disparo">
          {(
            [
              ['new', 'Novo disparo'],
              ['history', `Histórico${rows.length ? ` (${rows.length})` : ''}`],
            ] as const
          ).map(([t, label]) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => {
                setTab(t)
                setAutoTab(false)
              }} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              {label}
              {t === 'history' && running > 0 && <span className="rounded-full bg-sky-500 px-1.5 text-[11px] font-bold text-white">{running} enviando</span>}
            </button>
          ))}
        </div>
        {tab === 'new' ? (
          <NewBroadcast
            key={formKey}
            templates={templates}
            initialPipelineId={initialPipelineId}
            onDone={() => {
              setFormKey((k) => k + 1)
              setTab('history')
            }}
          />
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <CheckCircle2 size={13} aria-hidden="true" /> Sai em lotes: umas 200 na primeira leva e o resto a cada 5 minutos.
              <XCircle size={13} className="ml-2" aria-hidden="true" /> Cancelar para o que ainda não saiu.
            </p>
            <BroadcastHistory rows={rows} />
          </>
        )}
      </div>
    </Modal>
  )
}

