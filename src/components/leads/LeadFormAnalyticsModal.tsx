import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  Eraser,
  Filter,
  Megaphone,
  MessageCircle,
  MousePointerClick,
  Radio,
  RefreshCw,
  Smartphone,
  TrendingDown,
  Users,
  X,
} from 'lucide-react'
import { db } from '../../firebase/config'
import { Select } from '../ui/Field'
import { Spinner } from '../ui/FullPageSpinner'
import { FORM_VIZ_STYLE, FormTrendChart, AnswerBars, type AnswerBreakdown } from './FormMetricsCharts'
import { visibleOptions, isChoiceType } from './leadFormMeta'
import type { LeadForm, LeadFormVisit } from '../../types/leadForm'
import type { Lead } from '../../types/lead'
import { FormAnswersList } from './FormAnswerValue'
import type { LeadFormDailyPoint } from '../../services/leadFormAnalyticsService'

/** Registro detalhado das visitas começou aqui (antes só havia contagem). */
const TRACKING_SINCE = '27/10/2026'
const TRACKING_SINCE_MS = new Date(2026, 9, 27).getTime()

const STEPS = [
  { key: 1, label: 'Abriram o link', lost: 'Abriram e saíram sem começar' },
  { key: 2, label: 'Começaram a responder', lost: 'Começaram e saíram antes de deixar o contato' },
  { key: 3, label: 'Deixaram o contato', lost: 'Deixaram o contato e não enviaram' },
  { key: 4, label: 'Enviaram', lost: '' },
]

const SOURCE_LABEL: Record<string, string> = { facebook: 'Facebook', fb: 'Facebook', ig: 'Instagram', instagram: 'Instagram', google: 'Google', direto: 'Direto (sem origem)' }
const sourceLabel = (s?: string | null) => (s ? SOURCE_LABEL[s.toLowerCase()] || s : 'Direto (sem origem)')

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function minutes(sec: number) {
  if (!sec) return '–'
  if (sec < 60) return `${sec} s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m} min ${s} s` : `${m} min`
}

function median(list: number[]) {
  const xs = list.filter((x) => x > 0).sort((a, b) => a - b)
  return xs.length ? xs[Math.floor(xs.length / 2)] : 0
}

const dayKey = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function when(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86_400_000)
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return `Hoje, ${hm}`
  if (d.toDateString() === yesterday.toDateString()) return `Ontem, ${hm}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${hm}`
}

const waLink = (phone?: string) => {
  let d = String(phone || '').replace(/\D/g, '')
  if (!d) return null
  if (d.length <= 11) d = `55${d}`
  return `https://wa.me/${d}`
}

function Card({ icon, title, children, hint }: { icon: ReactNode; title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold text-slate-800">
        <span className="text-brand-600" aria-hidden="true">{icon}</span> {title}
      </h3>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Bars({ rows, empty, tone = 'bg-amber-400' }: { rows: { label: string; value: number; note?: string }[]; empty: string; tone?: string }) {
  if (!rows.length) return <p className="text-sm text-slate-400">{empty}</p>
  const top = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-slate-700">{r.label}</span>
            <span className="shrink-0 text-slate-500">
              <b className="font-semibold text-slate-800">{r.value}</b>
              {r.note ? ` · ${r.note}` : ''}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(4, Math.round((r.value / top) * 100))}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Lista "visitas · enviaram (%)" por grupo (aparelho, origem, campanha, anúncio). */
function ConvList({ rows, empty }: { rows: { label: string; total: number; sent: number }[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-slate-400">{empty}</p>
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((s) => (
        <li key={s.label} className="flex justify-between gap-3">
          <span className="min-w-0 truncate font-medium text-slate-700" title={s.label}>{s.label}</span>
          <span className="shrink-0 text-slate-500">
            <b className="font-semibold text-slate-800">{s.sent}</b> de {s.total} viraram lead <span className="text-slate-400">({pct(s.sent, s.total)}%)</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

const STATUS: Record<number, { label: string; cls: string }> = {
  1: { label: 'Só abriu', cls: 'bg-slate-100 text-slate-600' },
  2: { label: 'Começou', cls: 'bg-blue-50 text-blue-700' },
  3: { label: 'Deixou contato', cls: 'bg-amber-50 text-amber-700' },
  4: { label: 'Enviou', cls: 'bg-emerald-50 text-emerald-700' },
}

function PersonRow({ v }: { v: LeadFormVisit }) {
  const [open, setOpen] = useState(false)
  const st = STATUS[Math.max(1, Math.min(4, v.step || 1))]
  const c = v.contact || {}
  const wa = waLink(c.whatsapp)
  const total = v.totalQuestions || 0
  const where =
    v.step >= 4
      ? 'Enviou tudo'
      : v.lastQuestionLabel
        ? `Parou em ${typeof v.lastQuestionIndex === 'number' && v.lastQuestionIndex >= 0 ? `${v.lastQuestionIndex + 1}${total ? `/${total}` : ''} · ` : ''}"${v.lastQuestionLabel}"`
        : v.step >= 2
          ? 'Parou na primeira pergunta'
          : 'Saiu na tela de boas-vindas'
  const origin = [sourceLabel(v.source), v.campaign, v.ad].filter(Boolean).join(' · ')
  const hasDetails = (v.answers?.length ?? 0) > 0 || !!v.adset || !!v.referrer
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-slate-800">{c.name || 'Sem nome'}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
            {v.team && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Teste da equipe</span>}
          </p>
          {(c.whatsapp || c.email) && (
            <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
              {c.whatsapp &&
                (wa ? (
                  <a href={wa} target="_blank" rel="noreferrer" className="font-medium text-emerald-600 hover:underline" aria-label={`Abrir WhatsApp de ${c.name || c.whatsapp}`}>
                    {c.whatsapp}
                  </a>
                ) : (
                  <span>{c.whatsapp}</span>
                ))}
              {c.email && <span>{c.email}</span>}
            </p>
          )}
          <p className="mt-0.5 truncate text-xs text-slate-500">{where}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400" title={origin}>
            {v.device === 'mobile' ? 'Celular' : 'Computador'} · {origin} · {minutes(v.seconds || 0)} na página
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs tabular-nums text-slate-400">{when(v.createdAt)}</span>
          {hasDetails && (
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-xs font-medium text-brand-600 hover:underline">
              {open ? 'Esconder respostas' : 'Ver respostas'}
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-2 text-xs">
          {(v.answers ?? []).length > 0 ? (
            <FormAnswersList answers={v.answers!} />
          ) : (
            <p className="text-slate-400">Não respondeu nenhuma pergunta.</p>
          )}
          {(v.adset || v.referrer) && (
            <p className="mt-2 text-slate-400">
              {v.adset && <>Conjunto: {v.adset}. </>}
              {v.referrer && <>Veio de: {v.referrer}</>}
            </p>
          )}
        </div>
      )}
    </li>
  )
}

/** "O que responderam": contagem por opção de cada pergunta de escolha, a
 *  partir das respostas guardadas nos leads que vieram pelo formulário. */
function buildAnswerBreakdowns(form: LeadForm, leads: Lead[]): AnswerBreakdown[] {
  return form.questions
    .filter((q) => isChoiceType(q.type))
    .map((q) => {
      const opts = visibleOptions(q)
      const answers = leads.map((l) => l.formAnswers?.find((a) => a.questionId === q.id)?.value).filter((v): v is string => !!v)
      const options = opts.map((o) => {
        const isOther = o.id === '__other__'
        const count = answers.filter((v) => v.split(', ').some((part) => part === o.label || part === o.id || (isOther && part.startsWith(`${o.label}:`)))).length
        return { label: o.label, count }
      })
      return { questionId: q.id, label: q.label, total: answers.length, options }
    })
    .filter((b) => b.options.length > 0)
}

type Tab = 'funil' | 'pessoas'
type PeopleFilter = 'all' | 'contact' | 'sent' | 'quit'

/** Métricas de UM formulário, no mesmo formato do Funil da Loja: etapas, onde
 *  desistem, origem/campanha/anúncio, aparelho, tempo, Pixel do Meta — e a aba
 *  Pessoas com cada visita (quem viu, até onde foi e o contato que deixou). */
export function LeadFormAnalyticsModal({
  open,
  onClose,
  form,
  leads = [],
  onClearData,
}: {
  open: boolean
  onClose: () => void
  form: LeadForm | null
  leads?: Lead[]
  onClearData?: (form: LeadForm) => void
}) {
  const [days, setDays] = useState(30)
  const [device, setDevice] = useState<'' | 'mobile' | 'desktop'>('')
  const [source, setSource] = useState('')
  const [showTeam, setShowTeam] = useState(false)
  const [tab, setTab] = useState<Tab>('funil')
  const [people, setPeople] = useState<PeopleFilter>('all')
  const [visits, setVisits] = useState<LeadFormVisit[] | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!open || !form) return
    let alive = true
    setError('')
    getDocs(query(collection(db, 'leadFormVisits'), where('formId', '==', form.id)))
      .then((snap) => alive && setVisits(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LeadFormVisit)))
      .catch((err: Error) => alive && setError(err.message || 'Não deu pra carregar as visitas.'))
    return () => {
      alive = false
    }
  }, [open, form, reload])

  useEffect(() => {
    if (!open) {
      setVisits(null)
      setTab('funil')
      setPeople('all')
      setSource('')
      setSearch('')
    }
  }, [open])

  // 0 = desde o início; 1 = últimas 24 h; senão desde o começo do dia (N-1) dias atrás.
  const sinceMs = useMemo(() => {
    if (!days) return 0
    if (days === 1) return Date.now() - 86_400_000
    const d = new Date(Date.now() - (days - 1) * 86_400_000)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }, [days, reload])

  const base = useMemo(
    () =>
      (visits ?? [])
        .filter((v) => showTeam || !v.team)
        .filter((v) => !device || v.device === device)
        .filter((v) => !source || (v.source || 'direto') === source),
    [visits, showTeam, device, source]
  )

  const list = useMemo(
    () => base.filter((v) => new Date(v.createdAt).getTime() >= sinceMs).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [base, sinceMs]
  )

  // Mesmo tamanho de período, logo antes (pra comparar). "Desde o início" não compara.
  const kpis = useMemo(() => {
    const count = (vs: LeadFormVisit[]) => ({
      views: vs.length,
      starts: vs.filter((v) => v.step >= 2).length,
      contacts: vs.filter((v) => v.step >= 3).length,
      sent: vs.filter((v) => v.step >= 4).length,
      warm: vs.filter((v) => v.step === 3).length,
      secs: median(vs.filter((v) => v.step >= 4).map((v) => v.seconds || 0)),
    })
    const now = count(list)
    if (!days) return { now, prev: null }
    const span = days === 1 ? 86_400_000 : days * 86_400_000
    // Período anterior começa antes do registro existir: comparar engana ("+100%").
    if (sinceMs - span < TRACKING_SINCE_MS) return { now, prev: null }
    const prev = count(base.filter((v) => {
      const t = new Date(v.createdAt).getTime()
      return t >= sinceMs - span && t < sinceMs
    }))
    return { now, prev }
  }, [list, base, days, sinceMs])

  const [search, setSearch] = useState('')

  const sources = useMemo(() => [...new Set((visits ?? []).map((v) => v.source || 'direto'))].sort(), [visits])
  const teamCount = useMemo(() => (visits ?? []).filter((v) => v.team && new Date(v.createdAt).getTime() >= sinceMs).length, [visits, sinceMs])

  const stats = useMemo(() => {
    const final = (v: LeadFormVisit) => Math.max(1, Math.min(4, v.step || 1))
    const reached = STEPS.map((s) => list.filter((v) => final(v) >= s.key).length)
    const stoppedAt = STEPS.map((s) => list.filter((v) => final(v) === s.key).length)
    let worst = -1
    for (let i = 0; i < STEPS.length - 1; i++) if (worst < 0 || stoppedAt[i] > stoppedAt[worst]) worst = i

    // Começou e não enviou: em qual pergunta estava.
    const qCount = new Map<string, { label: string; value: number; order: number }>()
    for (const v of list.filter((x) => final(x) >= 2 && final(x) < 4)) {
      const label = v.lastQuestionLabel || '(primeira pergunta)'
      const key = v.lastQuestionId || label
      const prev = qCount.get(key)
      qCount.set(key, { label, value: (prev?.value ?? 0) + 1, order: v.lastQuestionIndex ?? 0 })
    }
    const quitters = list.filter((x) => final(x) >= 2 && final(x) < 4).length
    const questionStop = [...qCount.values()]
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
      .map((q) => ({ label: `${q.order + 1}. ${q.label}`, value: q.value, note: `${pct(q.value, quitters)}%` }))

    const conv = (subset: LeadFormVisit[]) => ({ total: subset.length, sent: subset.filter((v) => final(v) === 4).length })
    const groupBy = (key: (v: LeadFormVisit) => string | null | undefined) => {
      const m = new Map<string, LeadFormVisit[]>()
      for (const v of list) {
        const k = key(v)
        if (!k) continue
        m.set(k, [...(m.get(k) || []), v])
      }
      return [...m.entries()].map(([label, s]) => ({ label, ...conv(s) })).sort((a, b) => b.total - a.total).slice(0, 8)
    }
    const byDevice = (['mobile', 'desktop'] as const).map((d) => ({ label: d === 'mobile' ? 'Celular' : 'Computador', ...conv(list.filter((v) => v.device === d)) })).filter((r) => r.total > 0)
    const bySource = groupBy((v) => sourceLabel(v.source))
    const byCampaign = groupBy((v) => v.campaign)
    const byAd = groupBy((v) => v.ad)

    const timeQuit = median(list.filter((v) => final(v) < 4).map((v) => v.seconds || 0))
    const timeSent = median(list.filter((v) => final(v) === 4).map((v) => v.seconds || 0))

    const sent = list.filter((v) => final(v) === 4)
    const capiOk = sent.filter((v) => v.capi?.ok && !v.capi.test).length
    const capiTest = sent.filter((v) => v.capi?.ok && v.capi.test).length
    const capiNoToken = sent.filter((v) => v.capi?.skipped === 'sem-token').length
    const capiFail = sent.filter((v) => v.capi && !v.capi.ok && !v.capi.skipped)
    const capiErrors = new Map<string, number>()
    for (const v of capiFail) capiErrors.set(v.capi?.error || 'erro desconhecido', (capiErrors.get(v.capi?.error || 'erro desconhecido') || 0) + 1)

    // Série por dia (mesmo gráfico de antes).
    const byDay = new Map<string, LeadFormDailyPoint>()
    const cursor = new Date(sinceMs || (list.length ? Math.min(...list.map((v) => new Date(v.createdAt).getTime())) : Date.now()))
    cursor.setHours(0, 0, 0, 0)
    const end = new Date()
    end.setHours(0, 0, 0, 0)
    while (cursor <= end && byDay.size < 400) {
      const k = dayKey(cursor.getTime())
      byDay.set(k, { date: k, views: 0, starts: 0, submissions: 0 })
      cursor.setDate(cursor.getDate() + 1)
    }
    for (const v of list) {
      const p = byDay.get(dayKey(new Date(v.createdAt).getTime()))
      if (!p) continue
      p.views++
      if (final(v) >= 2) p.starts++
      if (final(v) === 4) p.submissions++
    }

    return {
      total: list.length,
      reached,
      stoppedAt,
      worst,
      questionStop,
      byDevice,
      bySource,
      byCampaign,
      byAd,
      timeQuit,
      timeSent,
      sent: sent.length,
      warm: stoppedAt[2],
      capiOk,
      capiTest,
      capiNoToken,
      capiErrors: [...capiErrors.entries()].map(([label, value]) => ({ label, value })),
      daily: [...byDay.values()],
    }
  }, [list, sinceMs])

  const formLeads = useMemo(() => (form ? leads.filter((l) => l.sourceFormId === form.id && (l.createdAt?.toMillis?.() ?? Date.now()) >= sinceMs) : []), [leads, form, sinceMs])
  const answers = useMemo(() => (form ? buildAnswerBreakdowns(form, formLeads) : []), [form, formLeads])

  const peopleList = useMemo(() => {
    const q = search.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    return list
      .filter((v) =>
        people === 'contact' ? !!(v.contact?.name || v.contact?.whatsapp || v.contact?.email) : people === 'sent' ? v.step >= 4 : people === 'quit' ? v.step >= 2 && v.step < 4 : true
      )
      .filter((v) => {
        if (!q) return true
        const c = v.contact || {}
        const text = [c.name, c.email, v.campaign, v.ad, v.adset, sourceLabel(v.source)].filter(Boolean).join(' ').toLowerCase()
        return text.includes(q) || (digits.length >= 3 && String(c.whatsapp || '').replace(/\D/g, '').includes(digits))
      })
  }, [list, people, search])

  /** Planilha (CSV, abre no Excel/Google Planilhas) das pessoas filtradas. */
  const exportCsv = () => {
    if (!form) return
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = ['Data', 'Situação', 'Nome', 'WhatsApp', 'E-mail', 'Parou em', 'Aparelho', 'Origem', 'Campanha', 'Conjunto', 'Anúncio', 'Tempo (s)', 'Respostas']
    const rows = peopleList.map((v) => [
      new Date(v.createdAt).toLocaleString('pt-BR'),
      STATUS[Math.max(1, Math.min(4, v.step || 1))].label,
      v.contact?.name,
      v.contact?.whatsapp,
      v.contact?.email,
      v.step >= 4 ? '' : v.lastQuestionLabel,
      v.device === 'mobile' ? 'Celular' : 'Computador',
      sourceLabel(v.source),
      v.campaign,
      v.adset,
      v.ad,
      v.seconds || 0,
      (v.answers ?? []).map((a) => `${a.label}: ${a.value}`).join(' | '),
    ])
    const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `visitas-${form.id}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  if (!open || !form) return null
  const hasPixel = !!form.metaPixelId

  const delta = (now: number, prev: number | undefined, isRate = false) => {
    if (prev === undefined || kpis.prev === null) return null
    if (!prev && !now) return null
    const diff = isRate ? now - prev : prev ? Math.round(((now - prev) / prev) * 100) : null
    if (diff === null) return { text: 'novo', up: true }
    if (diff === 0) return { text: 'igual', up: null }
    return { text: `${diff > 0 ? '+' : ''}${diff}${isRate ? (Math.abs(diff) === 1 ? ' ponto' : ' pontos') : '%'}`, up: diff > 0 }
  }
  const prevText = days === 1 ? 'vs. 24 h antes' : `vs. ${days} dias antes`
  const periodLabel = { 0: 'desde o início', 1: 'últimas 24 horas', 7: 'últimos 7 dias', 30: 'últimos 30 dias', 90: 'últimos 90 dias' }[days] ?? `últimos ${days} dias`
  const conversionDelta = delta(pct(kpis.now.sent, kpis.now.views), kpis.prev ? pct(kpis.prev.sent, kpis.prev.views) : undefined, true)

  // Pixel em semáforo: verde = navegador + servidor; amarelo = só navegador; vermelho = sem pixel ou falhando.
  const pixelState = !hasPixel
    ? { dot: 'bg-red-500', box: 'bg-red-50 text-red-800', title: 'Sem pixel', text: 'O Meta não recebe nada deste formulário. Cole o pixel na tela "Pixel do Meta" do construtor.' }
    : stats.capiErrors.length > 0
      ? { dot: 'bg-red-500', box: 'bg-red-50 text-red-800', title: 'Com erro no servidor', text: 'O navegador manda o lead, mas o servidor está falhando. Confira o token na tela "Pixel do Meta".' }
      : stats.sent > 0 && stats.capiOk + stats.capiTest === stats.sent
        ? { dot: 'bg-emerald-500', box: 'bg-emerald-50 text-emerald-800', title: 'Tudo certo', text: 'Cada lead chega no Meta pelo navegador e pelo servidor, e conta uma vez só.' }
        : stats.capiNoToken > 0
          ? { dot: 'bg-amber-400', box: 'bg-amber-50 text-amber-900', title: 'Funcionando pela metade', text: 'Os leads vão só pelo navegador. Quem usa iPhone ou bloqueador pode não contar. Cole o token na tela "Pixel do Meta".' }
          : { dot: 'bg-slate-400', box: 'bg-slate-50 text-slate-700', title: 'Pixel instalado', text: 'Ainda sem envios no período pra conferir.' }

  // Lista de ações em português claro, da mais importante pra menos.
  const todo: { text: string; icon: ReactNode; tone: string; action?: { label: string; onClick: () => void } }[] = []
  if (stats.warm > 0)
    todo.push({
      text: `${plural(stats.warm, 'pessoa deixou', 'pessoas deixaram')} o WhatsApp e não ${stats.warm === 1 ? 'enviou' : 'enviaram'}. Chame no WhatsApp: é lead quente.`,
      icon: <MessageCircle size={18} />,
      tone: 'bg-emerald-50 text-emerald-900',
      action: { label: 'Ver quem são', onClick: () => { setTab('pessoas'); setPeople('quit') } },
    })
  if (stats.questionStop[0] && stats.questionStop[0].value >= 2)
    todo.push({
      text: `Muita gente desiste em "${stats.questionStop[0].label.replace(/^\d+\.\s*/, '')}". Vale simplificar ou deixar opcional.`,
      icon: <TrendingDown size={18} />,
      tone: 'bg-amber-50 text-amber-900',
    })
  if (hasPixel && stats.capiNoToken > 0)
    todo.push({ text: 'Cole o token da API de Conversões na tela "Pixel do Meta" do construtor, pra o Meta não perder leads.', icon: <Radio size={18} />, tone: 'bg-amber-50 text-amber-900' })
  if (!hasPixel) todo.push({ text: 'Este formulário está sem pixel do Meta: a campanha não aprende com os leads.', icon: <AlertTriangle size={18} />, tone: 'bg-red-50 text-red-800' })
  if (stats.total >= 5 && stats.byCampaign.length === 0)
    todo.push({
      text: 'Coloque UTMs no link do anúncio pra ver qual campanha e anúncio trazem lead: utm_source=facebook&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}',
      icon: <Megaphone size={18} />,
      tone: 'bg-slate-50 text-slate-700',
    })

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="fm-title">
      <style>{FORM_VIZ_STYLE}</style>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-50 flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p id="fm-title" className="truncate text-base font-semibold text-slate-800">Métricas — {form.name}</p>
            <p className="text-xs text-slate-400">/captura/{form.id}</p>
          </div>
          <button type="button" onClick={() => setReload((n) => n + 1)} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
            <RefreshCw size={14} aria-hidden="true" /> Atualizar
          </button>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          <div className="flex rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="Visão">
            {(
              [
                ['funil', 'Resumo', <BarChart3 key="i" size={14} aria-hidden="true" />],
                ['pessoas', `Pessoas (${list.length})`, <Users key="i" size={14} aria-hidden="true" />],
              ] as const
            ).map(([k, label, icon]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${tab === k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {icon} {label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select aria-label="Período" className="!w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={1}>Últimas 24 horas</option>
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
              <option value={0}>Desde o início</option>
            </Select>
            <Select aria-label="Origem" className="!w-auto max-w-[180px]" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Todas as origens</option>
              {sources.map((s) => (
                <option key={s} value={s}>{sourceLabel(s)}</option>
              ))}
            </Select>
            <Select aria-label="Aparelho" className="!w-auto" value={device} onChange={(e) => setDevice(e.target.value as typeof device)}>
              <option value="">Celular e computador</option>
              <option value="mobile">Só celular</option>
              <option value="desktop">Só computador</option>
            </Select>
            {teamCount > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={showTeam} onChange={(e) => setShowTeam(e.target.checked)} />
                Mostrar testes da equipe ({teamCount})
              </label>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50/60 p-5">
          {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          {visits === null && !error ? (
            <div className="flex justify-center py-10" aria-live="polite">
              <Spinner className="h-6 w-6" />
            </div>
          ) : stats.total === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <Filter size={24} className="mx-auto text-slate-300" aria-hidden="true" />
              <p className="mt-2 font-medium text-slate-700">Nenhuma visita no período.</p>
              <p className="mt-1 text-sm text-slate-500">O registro de cada visita (origem, aparelho, até onde foi e o contato) começou em {TRACKING_SINCE}. A partir de agora, quem abrir o link aparece aqui.</p>
            </div>
          ) : tab === 'funil' ? (
            <div className="space-y-5">
              {/* 1. Resumo em uma frase */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Resumo · {periodLabel}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-700">
                  <b className="text-slate-900">{plural(kpis.now.views, 'pessoa abriu', 'pessoas abriram')}</b> o formulário,{' '}
                  <b className="text-slate-900">{kpis.now.starts} {kpis.now.starts === 1 ? 'começou' : 'começaram'}</b> a responder e{' '}
                  <b className="text-emerald-700">{kpis.now.sent} {kpis.now.sent === 1 ? 'enviou' : 'enviaram'}</b>. De cada 100 que abrem,{' '}
                  <b className="text-emerald-700">{pct(kpis.now.sent, kpis.now.views)} viram lead</b>
                  {conversionDelta && (
                    <span className={`ml-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${conversionDelta.up === null ? 'bg-slate-100 text-slate-500' : conversionDelta.up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                      {conversionDelta.text} {prevText}
                    </span>
                  )}
                  .{kpis.now.secs > 0 && <> Quem envia leva uns <b className="text-slate-900">{minutes(kpis.now.secs)}</b>.</>}
                </p>
              </section>

              {/* 2. Funil em blocos */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="fm-etapas">
                <h3 id="fm-etapas" className="text-[15px] font-semibold text-slate-800">Caminho das pessoas</h3>
                <p className="mt-0.5 text-xs text-slate-400">Cada bloco é uma etapa. Entre eles, quantas pessoas saíram.</p>
                <ol className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {STEPS.map((s, i) => {
                    const n = stats.reached[i]
                    const left = i < STEPS.length - 1 ? stats.stoppedAt[i] : 0
                    const isWorst = i === stats.worst && left > 0
                    const last = s.key === 4
                    return (
                      <li key={s.key} className={`relative flex flex-col rounded-xl border p-4 ${last ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                        <span className="text-xs font-semibold text-slate-500">
                          {i + 1}. {s.label}
                        </span>
                        <span className={`mt-1 text-3xl font-extrabold tabular-nums ${last ? 'text-emerald-700' : 'text-slate-900'}`}>{n}</span>
                        <span className="text-xs text-slate-500">{pct(n, stats.total)}% de quem abriu</span>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white" aria-hidden="true">
                          <div className={`h-full rounded-full ${last ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${Math.max(n ? 3 : 0, pct(n, stats.total))}%` }} />
                        </div>
                        {left > 0 && (
                          <span className={`mt-2 w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${isWorst ? 'bg-amber-100 text-amber-800' : 'bg-white text-slate-500'}`}>
                            ↓ {plural(left, 'saiu', 'saíram')} aqui{isWorst ? ' (maior perda)' : ''}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </section>

              {/* 3. O que fazer agora */}
              {todo.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="fm-todo">
                  <h3 id="fm-todo" className="text-[15px] font-semibold text-slate-800">O que fazer agora</h3>
                  <ul className="mt-3 space-y-2">
                    {todo.map((t) => (
                      <li key={t.text} className={`flex items-start gap-3 rounded-xl p-3 text-sm ${t.tone}`}>
                        <span className="mt-0.5 shrink-0" aria-hidden="true">{t.icon}</span>
                        <span className="min-w-0 flex-1">{t.text}</span>
                        {t.action && (
                          <button type="button" onClick={t.action.onClick} className="shrink-0 rounded-lg bg-white/70 px-2.5 py-1 text-xs font-semibold hover:bg-white">
                            {t.action.label}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="grid gap-5 lg:grid-cols-2">
                {/* 4. Pixel em semáforo */}
                <Card icon={<Radio size={16} />} title="Pixel do Meta" hint="Se o Meta está recebendo os leads deste formulário.">
                  <div className={`flex items-start gap-3 rounded-xl p-3 ${pixelState.box}`}>
                    <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${pixelState.dot}`} aria-hidden="true" />
                    <div className="text-sm">
                      <p className="font-semibold">{pixelState.title}</p>
                      <p className="mt-0.5 text-xs opacity-90">{pixelState.text}</p>
                    </div>
                  </div>
                  {hasPixel && stats.sent > 0 && (
                    <ul className="mt-3 space-y-1.5 text-sm">
                      <li className="flex justify-between gap-3"><span className="text-slate-600">Leads enviados no formulário</span><b className="text-slate-800">{stats.sent}</b></li>
                      <li className="flex justify-between gap-3"><span className="text-slate-600">Confirmados também pelo servidor</span><b className="text-emerald-700">{stats.capiOk}</b></li>
                      {stats.capiTest > 0 && <li className="flex justify-between gap-3"><span className="text-slate-600">Foram pra Eventos de teste</span><b className="text-slate-800">{stats.capiTest}</b></li>}
                    </ul>
                  )}
                  {stats.capiErrors.map((e) => (
                    <p key={e.label} className="mt-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
                      {plural(e.value, 'falhou', 'falharam')} no servidor: {e.label}
                    </p>
                  ))}
                </Card>

                {/* 5. Onde param */}
                <Card icon={<MousePointerClick size={16} />} title="Em qual pergunta desistem" hint="Última pergunta que viu quem começou e não enviou.">
                  <Bars rows={stats.questionStop} empty="Ninguém desistiu no meio. 👏" />
                </Card>

                {/* 6. De onde vêm */}
                <Card icon={<Megaphone size={16} />} title="De onde vêm" hint="Quantas pessoas cada origem trouxe e quantas viraram lead.">
                  <ConvList rows={stats.bySource} empty="Sem origem registrada." />
                  {stats.byCampaign.length > 0 && (
                    <>
                      <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Por campanha</h4>
                      <div className="mt-2"><ConvList rows={stats.byCampaign} empty="" /></div>
                    </>
                  )}
                  {stats.byAd.length > 0 && (
                    <>
                      <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Por anúncio</h4>
                      <div className="mt-2"><ConvList rows={stats.byAd} empty="" /></div>
                    </>
                  )}
                </Card>

                <Card icon={<Smartphone size={16} />} title="Celular ou computador">
                  <ConvList rows={stats.byDevice} empty="Sem visitas." />
                  <h4 className="mt-5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <Clock size={13} aria-hidden="true" /> Tempo na página
                  </h4>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    <li className="flex justify-between gap-3"><span className="text-slate-600">Quem desistiu ficou</span><b className="text-slate-800">{minutes(stats.timeQuit)}</b></li>
                    <li className="flex justify-between gap-3"><span className="text-slate-600">Quem enviou ficou</span><b className="text-slate-800">{minutes(stats.timeSent)}</b></li>
                  </ul>
                </Card>
              </div>

              {/* 7. Por dia */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-[15px] font-semibold text-slate-800">Dia a dia</h3>
                <p className="mt-0.5 text-xs text-slate-400">Quantos abriram, começaram e enviaram em cada dia. Passe o mouse no gráfico.</p>
                <div className="mt-3">
                  <FormTrendChart daily={stats.daily} />
                </div>
              </section>

              {/* 8. Respostas (recolhido) */}
              {answers.length > 0 && (
                <details className="group rounded-2xl border border-slate-200 bg-white p-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[15px] font-semibold text-slate-800">
                      <CheckCircle2 size={16} className="text-brand-600" aria-hidden="true" /> O que os leads responderam
                    </span>
                    <span className="text-xs font-medium text-brand-600 group-open:hidden">Mostrar</span>
                    <span className="hidden text-xs font-medium text-brand-600 group-open:inline">Esconder</span>
                  </summary>
                  <p className="mt-1 text-xs text-slate-400">Perguntas de escolha, dos {plural(formLeads.length, 'lead recebido', 'leads recebidos')} no período.</p>
                  <div className="mt-4 flex flex-col gap-4">
                    {answers.map((a) => (
                      <AnswerBars key={a.questionId} item={a} />
                    ))}
                  </div>
                </details>
              )}
            </div>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="Pessoas que abriram o formulário">
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ['all', 'Todos'],
                    ['contact', 'Deixaram contato'],
                    ['quit', 'Desistiram no meio'],
                    ['sent', 'Enviaram'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={people === k}
                    onClick={() => setPeople(k)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${people === k ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {label}
                  </button>
                ))}
                <span className="ml-auto text-xs text-slate-400">{plural(peopleList.length, 'visita', 'visitas')}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar nome, WhatsApp, e-mail, campanha ou anúncio"
                  aria-label="Buscar pessoas"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={peopleList.length === 0}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  <Download size={14} aria-hidden="true" /> Exportar planilha
                </button>
              </div>
              {peopleList.length === 0 ? (
                <p className="mt-4 text-sm text-slate-400">Ninguém nesse filtro.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100">
                  {peopleList.slice(0, 300).map((v) => (
                    <PersonRow key={v.id} v={v} />
                  ))}
                </ul>
              )}
              {peopleList.length > 300 && <p className="mt-2 text-xs text-slate-400">Mostrando as 300 mais recentes. Diminua o período pra ver as outras.</p>}
            </section>
          )}
        </div>

        {onClearData && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
            {stats.total > 0 && !hasPixel ? (
              <p className="flex items-center gap-1.5 text-xs text-amber-600">
                <AlertTriangle size={13} aria-hidden="true" /> Sem pixel do Meta neste formulário.
              </p>
            ) : (
              <span />
            )}
            <button type="button" onClick={() => onClearData(form)} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600">
              <Eraser size={13} aria-hidden="true" /> Limpar dados de teste
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
