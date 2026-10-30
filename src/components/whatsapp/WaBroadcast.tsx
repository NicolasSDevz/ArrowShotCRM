import { useEffect, useMemo, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, Bot, CheckCircle2, Megaphone, Search, Send, UserRound, XCircle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { useLeads } from '../../hooks/useLeads'
import { useLeadPipelines } from '../../hooks/useLeadPipelines'
import { cancelBroadcast, createBroadcast, listenBroadcasts } from '../../services/whatsappService'
import { leadPipelineId, isQuestionnaireLead, stageOfLead } from '../../types'
import type { WaBroadcast, WaTemplate, WaTemplateExtras } from '../../types/whatsapp'
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

function BroadcastCard({ bc }: { bc: WaBroadcast }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const done = bc.sent + bc.failed
  const pct = bc.total ? Math.round((done / bc.total) * 100) : 0
  const failed = (bc.recipients || []).filter((r) => r.status === 'failed')
  const status =
    bc.status === 'sending'
      ? { label: 'Enviando', tone: 'bg-sky-500/15 text-sky-300' }
      : bc.status === 'canceled'
        ? { label: 'Cancelado', tone: 'bg-slate-500/15 text-slate-300' }
        : { label: 'Concluído', tone: 'bg-emerald-500/15 text-emerald-300' }
  const cancel = async () => {
    setBusy(true)
    try {
      await cancelBroadcast(bc.id)
      toast.success('Disparo cancelado. O que já saiu não volta.')
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
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${pct}% enviado`}>
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>
          <strong className="text-slate-800">{bc.sent}</strong> enviadas
        </span>
        {bc.failed > 0 && (
          <span className="text-red-400">
            <strong>{bc.failed}</strong> com erro
          </span>
        )}
        <span>
          de <strong className="text-slate-800">{bc.total}</strong>
        </span>
        <span className="ml-auto flex gap-2">
          {failed.length > 0 && (
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="font-semibold text-brand-500 hover:underline">
              {open ? 'Esconder erros' : 'Ver erros'}
            </button>
          )}
          {bc.status === 'sending' && (
            <Button size="sm" variant="danger" onClick={cancel} loading={busy}>
              Cancelar
            </Button>
          )}
        </span>
      </div>
      {open && (
        <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg bg-slate-50 p-2 text-xs">
          {failed.map((r) => (
            <li key={r.to} className="py-1">
              <span className="font-semibold text-slate-700">{r.name || r.to}</span> <span className="text-slate-400">({r.to})</span>: <span className="text-red-400">{r.error}</span>
            </li>
          ))}
        </ul>
      )}
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
  const ready = Boolean(tpl && recipients.length && !missing && !extrasMissing && confirm)

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

      <Step n={3} title="Revisar e disparar">
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
              {!recipients.length ? 'Escolha quem recebe.' : !tpl ? 'Escolha o modelo.' : missing || extrasMissing ? 'Complete as partes do modelo.' : 'Marque a confirmação.'}
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
  const running = rows.filter((r) => r.status === 'sending').length
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
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
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

