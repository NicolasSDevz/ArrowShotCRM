import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { differenceInCalendarDays, endOfMonth, format, isValid, parseISO, startOfMonth, subDays, subMonths } from 'date-fns'
import { CalendarRange, FileDown, Loader2 } from 'lucide-react'
import { getPublicReportLink } from '../services/reportLinkService'
import { fetchMetaReportSnapshot, previousPeriod } from '../utils/metaReportData'
import { fetchGoogleReportSnapshot } from '../utils/googleReportData'
import { FullPageSpinner } from '../components/ui/FullPageSpinner'
import {
  Card,
  fmtDate,
  OverviewSection,
  FunnelSection,
  EvolutionSection,
  CampaignsSection,
  AdsSection,
  PlatformSection,
  GoogleOverviewSection,
  GoogleEvolutionSection,
  GoogleCampaignsSection,
  ExecutiveSummary,
  Section,
  type ReportGoogleSnapshotReady,
} from '../components/reports/ReportSections'
import type { ReportMetaSnapshot } from '../types'
import type { ReportLink } from '../types/reportLink'

type PresetId = '7d' | '30d' | 'month' | 'last_month' | 'custom'

const PRESETS: { id: Exclude<PresetId, 'custom'>; label: string }[] = [
  { id: '7d', label: 'Últimos 7 dias' },
  { id: '30d', label: 'Últimos 30 dias' },
  { id: 'month', label: 'Este mês' },
  { id: 'last_month', label: 'Mês passado' },
]

/** Maior período que o cliente pode pedir de uma vez — acima disso a API do
 *  Meta fica lenta demais pra uma página aberta sem login. */
const MAX_DAYS = 366

const toStr = (d: Date) => format(d, 'yyyy-MM-dd')

function presetRange(id: Exclude<PresetId, 'custom'>): { from: string; to: string } {
  const today = new Date()
  const yesterday = subDays(today, 1)
  switch (id) {
    case '7d':
      return { from: toStr(subDays(yesterday, 6)), to: toStr(yesterday) }
    case '30d':
      return { from: toStr(subDays(yesterday, 29)), to: toStr(yesterday) }
    case 'month':
      return { from: toStr(startOfMonth(today)), to: toStr(today) }
    case 'last_month': {
      const m = subMonths(today, 1)
      return { from: toStr(startOfMonth(m)), to: toStr(endOfMonth(m)) }
    }
  }
}

function parseDay(s: string | null): Date | null {
  if (!s) return null
  const d = parseISO(s)
  return isValid(d) ? d : null
}

/** null = período válido; senão, a mensagem do problema. */
function rangeProblem(from: string, to: string): string | null {
  const a = parseDay(from)
  const b = parseDay(to)
  if (!a || !b) return 'Escolha as duas datas.'
  if (a > b) return 'A data inicial precisa ser antes da final.'
  if (b > new Date()) return 'A data final não pode ser no futuro.'
  if (differenceInCalendarDays(b, a) + 1 > MAX_DAYS) return 'Escolha um período de até 1 ano.'
  return null
}

interface LoadedData {
  meta: ReportMetaSnapshot | null
  google: ReportGoogleSnapshotReady | null
  failed: string[]
}

/** Relatório público (/relatorio/:token): o cliente abre sem login, escolhe o
 *  período e vê os números ao vivo do Meta Ads e do Google Ads. O link é
 *  criado no relatório mensal ("Link pro cliente") e pode ser desativado. */
export function PublicReportPage() {
  const { token } = useParams<{ token: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [link, setLink] = useState<ReportLink | null | undefined>(undefined)

  const initial = useMemo(() => {
    const from = searchParams.get('de') ?? ''
    const to = searchParams.get('ate') ?? ''
    return rangeProblem(from, to) ? { ...presetRange('30d'), preset: '30d' as PresetId } : { from, to, preset: 'custom' as PresetId }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [preset, setPreset] = useState<PresetId>(initial.preset)
  const [range, setRange] = useState({ from: initial.from, to: initial.to })
  const [draft, setDraft] = useState({ from: initial.from, to: initial.to })
  const [draftError, setDraftError] = useState<string | null>(null)
  const [data, setData] = useState<LoadedData | null>(null)
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)

  useEffect(() => {
    let cancelled = false
    getPublicReportLink(token ?? '').then((l) => {
      if (!cancelled) setLink(l)
    })
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (link?.clientName) document.title = `Relatório — ${link.clientName}`
  }, [link])

  // Busca ao vivo sempre que o período muda. `requestId` descarta a resposta
  // de um período antigo que chegue depois da do período novo.
  useEffect(() => {
    if (!link) return
    const id = ++requestId.current
    const start = parseISO(range.from)
    const end = parseISO(range.to)
    setLoading(true)
    const wantsMeta = link.platforms.includes('meta') && !!link.metaAccountId
    const wantsGoogle = link.platforms.includes('google') && !!link.googleAccountId
    Promise.allSettled([
      wantsMeta ? fetchMetaReportSnapshot(link.metaAccountId!, start, end, link.clientId) : Promise.resolve(null),
      wantsGoogle ? fetchGoogleReportSnapshot(link.googleAccountId!, start, end) : Promise.resolve(null),
    ]).then(([m, g]) => {
      if (id !== requestId.current) return
      const failed: string[] = []
      if (m.status === 'rejected') failed.push('Meta Ads')
      if (g.status === 'rejected') failed.push('Google Ads')
      const google = g.status === 'fulfilled' && g.value && g.value.available ? g.value : null
      setData({ meta: m.status === 'fulfilled' ? m.value : null, google, failed })
      setLoading(false)
    })
    setSearchParams({ de: range.from, ate: range.to }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link, range])

  const choosePreset = (id: Exclude<PresetId, 'custom'>) => {
    const r = presetRange(id)
    setPreset(id)
    setDraft(r)
    setDraftError(null)
    setRange(r)
  }

  const applyCustom = () => {
    const problem = rangeProblem(draft.from, draft.to)
    setDraftError(problem)
    if (problem) return
    setPreset('custom')
    setRange({ ...draft })
  }

  if (link === undefined) return <FullPageSpinner label="Abrindo relatório…" />
  if (link === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#F1F5F9] p-6 text-center">
        <img src="/favicon.png" alt="" className="mb-2 h-10 w-10 rounded-lg" />
        <p className="text-lg font-semibold text-slate-800">Link indisponível</p>
        <p className="max-w-sm text-sm text-slate-500">Este link de relatório foi desativado ou não existe. Peça um novo link para a sua agência.</p>
      </div>
    )
  }

  const start = parseISO(range.from)
  const end = parseISO(range.to)
  const prev = previousPeriod(start, end)
  const meta = data?.meta ?? null
  const google = data?.google ?? null
  const nothing = data && !loading && !meta && !google

  return (
    <div className="report-print min-h-screen bg-[#F1F5F9]">
      <div className="flex flex-wrap items-center gap-4 bg-[#0F172A] px-6 py-5 text-white">
        {link.logoUrl ? (
          <img src={link.logoUrl} alt="" className="h-10 w-10 rounded-lg bg-white object-cover" />
        ) : (
          <img src="/favicon.png" alt="" className="h-9 w-9 rounded-lg" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[24px] font-bold leading-tight">{link.clientName}</p>
          <p className="text-xs text-slate-300">
            {fmtDate(start)} — {fmtDate(end)}
            <span className="ml-2 text-slate-500">
              vs {fmtDate(prev.start)} — {fmtDate(prev.end)}
            </span>
          </p>
        </div>
        <button
          onClick={() => window.print()}
          disabled={loading || !data}
          className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-40 print:hidden"
        >
          <FileDown size={14} /> Baixar PDF
        </button>
      </div>

      <div className="border-b border-[#E2E8F0] bg-white px-4 py-3 sm:px-6 print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          <CalendarRange size={16} className="text-slate-400" />
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => choosePreset(p.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                preset === p.id ? 'bg-[#0F172A] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
          <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
            <input
              type="date"
              value={draft.from}
              max={toStr(new Date())}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
              aria-label="Data inicial"
              className="h-9 rounded-lg border border-slate-200 px-2 text-sm"
            />
            <span className="text-sm text-slate-400">até</span>
            <input
              type="date"
              value={draft.to}
              max={toStr(new Date())}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              aria-label="Data final"
              className="h-9 rounded-lg border border-slate-200 px-2 text-sm"
            />
            <button
              type="button"
              onClick={applyCustom}
              className={`h-9 rounded-lg px-3 text-sm font-medium ${
                preset === 'custom' ? 'bg-[#0F172A] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Ver período
            </button>
          </div>
        </div>
        {draftError && <p className="mx-auto mt-1.5 max-w-6xl text-right text-xs text-red-600">{draftError}</p>}
      </div>

      <div className="relative px-4 py-8 sm:px-8">
        {loading && (
          <div className="mx-auto mb-4 flex max-w-6xl items-center gap-2 text-sm text-slate-500 print:hidden">
            <Loader2 size={16} className="animate-spin" /> Buscando os números do período…
          </div>
        )}
        {!data ? null : (
          <div className={`mx-auto flex max-w-6xl flex-col gap-8 transition-opacity ${loading ? 'opacity-50' : ''}`}>
            {data.failed.length > 0 && (
              <Card>
                <p className="text-sm text-amber-700">
                  Não foi possível carregar {data.failed.join(' e ')} agora. Tente de novo em alguns minutos.
                </p>
              </Card>
            )}
            {nothing && data.failed.length === 0 && (
              <Card>
                <p className="text-sm text-slate-500">Sem dados de anúncios nesse período.</p>
              </Card>
            )}
            {meta && (
              <>
                <OverviewSection meta={meta} />
                <FunnelSection meta={meta} />
                <EvolutionSection meta={meta} periodStart={start} periodEnd={end} />
                <CampaignsSection campaigns={meta.topCampaigns} />
                <AdsSection ads={meta.topAds} />
                <PlatformSection meta={meta} />
              </>
            )}
            {google && (
              <>
                <GoogleOverviewSection google={google} />
                <GoogleEvolutionSection google={google} periodStart={start} periodEnd={end} />
                <GoogleCampaignsSection campaigns={google.topCampaigns} />
              </>
            )}
            {(meta || google) && (
              <Section title="Resumo do período">
                <ExecutiveSummary meta={meta} google={google} start={start} end={end} />
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
