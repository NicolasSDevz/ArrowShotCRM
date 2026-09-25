import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ArrowLeft, Maximize2, X, ChevronLeft, ChevronRight, Link2, FileDown } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getOrCreateReportLink, reportLinkUrl } from '../services/reportLinkService'
import { showError } from '../utils/notifyError'
import { ReportWorkDoneSection } from '../components/reports/ReportWorkDoneSection'
import { NextStepsEditor } from '../components/reports/NextStepsEditor'
import { useReports } from '../hooks/useReports'
import { useClients } from '../hooks/useClients'
import { FullPageSpinner } from '../components/ui/FullPageSpinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { ReportFunnelSection } from '../components/reports/ReportFunnelSection'
import { previousPeriod } from '../utils/metaReportData'
import { usePrivacy } from '../context/PrivacyContext'
import {
  Section,
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
  LandingPageSection,
  ExecutiveSummary,
  type ReportGoogleSnapshotReady,
} from '../components/reports/ReportSections'

/* ---------- Page ---------- */
function toValidDate(ts: unknown): Date {
  try {
    const d = ts && typeof (ts as { toDate?: () => Date }).toDate === 'function' ? (ts as { toDate: () => Date }).toDate() : new Date(NaN)
    return Number.isNaN(d.getTime()) ? new Date() : d
  } catch {
    return new Date()
  }
}

export function MonthlyReportPage() {
  const { id } = useParams<{ id: string }>()
  const { isPrivacyMode } = usePrivacy()
  const navigate = useNavigate()
  const { data: reports, loading } = useReports()
  const { data: clients } = useClients()
  const { profile } = useAuth()
  const [presenting, setPresenting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [slide, setSlide] = useState(0)
  // Um relatório recém-criado pode levar um instante para aparecer no snapshot
  // — dá uma janela de tolerância antes de mostrar "não encontrado".
  const [graceOver, setGraceOver] = useState(false)

  const report = reports.find((r) => r.id === id)
  const client = report ? clients.find((c) => c.id === report.clientId) : undefined
  const clientName = report ? (client?.companyName ?? 'Cliente') : ''

  useEffect(() => {
    const t = setTimeout(() => setGraceOver(true), 2500)
    return () => clearTimeout(t)
  }, [id])

  useEffect(() => {
    if (!presenting) return
    setSlide(0)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresenting(false)
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setSlide((s) => s + 1)
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') setSlide((s) => Math.max(0, s - 1))
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [presenting])

  if (loading || (!report && !graceOver)) return <FullPageSpinner label="Carregando relatório…" />
  if (!report || report.type !== 'monthly') {
    return (
      <EmptyState
        title="Relatório não encontrado"
        description="Ele pode ter sido excluído, ou o link está incorreto."
        action={<Button onClick={() => navigate('/relatorios')}>Voltar para Relatórios</Button>}
      />
    )
  }

  const periodStart = toValidDate(report.periodStart)
  const periodEnd = toValidDate(report.periodEnd)
  const prev = previousPeriod(periodStart, periodEnd)
  const meta = report.meta
  const google: ReportGoogleSnapshotReady | null = report.google?.available ? report.google : null

  // DEBUG — por que os dados não aparecem no painel mensal.
  console.log('[MonthlyReport] relatório carregado:', {
    id: report.id,
    type: report.type,
    clientId: report.clientId,
    temMeta: !!meta,
    accountId: meta?.accountId,
    metricasCurrent: meta?.metrics?.current,
    metricasPrevious: meta?.metrics?.previous,
    qtdCampanhas: meta?.topCampaigns?.length ?? 0,
    qtdAds: meta?.topAds?.length ?? 0,
    qtdPlataformas: meta?.platformBreakdown?.length ?? 0,
    temSerieDiaria: !!meta?.dailySeries?.length,
    temGoogle: !!google,
    googleMetricasCurrent: google?.metrics?.current,
    googleQtdCampanhas: google?.topCampaigns?.length ?? 0,
    meta,
    google: report.google,
  })
  if (meta && (!meta.metrics?.current || Object.keys(meta.metrics.current).length === 0)) {
    console.warn('[MonthlyReport] meta.metrics.current está vazio — a API do Meta não retornou métricas para o período.')
  }
  if (!meta && !google) {
    console.warn('[MonthlyReport] report.meta e report.google ausentes — nenhum snapshot foi salvo na geração do relatório.')
  }

  const hasAds = !!(meta || google)
  const resumoNode = (
    <ExecutiveSummary meta={meta} google={google} start={periodStart} end={periodEnd} nextSteps={report.nextSteps} />
  )
  const workDoneNode = <ReportWorkDoneSection clientId={report.clientId} start={periodStart} end={periodEnd} />

  /** Link pro cliente com o período deste relatório já escolhido — ele pode
   *  trocar as datas depois. */
  const handleShare = async () => {
    if (!client || !profile) return
    setSharing(true)
    try {
      const link = await getOrCreateReportLink(client, profile.id, profile.name)
      const url = reportLinkUrl(link.token, { from: format(periodStart, 'yyyy-MM-dd'), to: format(periodEnd, 'yyyy-MM-dd') })
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado — o cliente abre sem login e pode escolher outras datas')
    } catch (err) {
      showError(err, 'Erro ao criar o link do relatório')
    } finally {
      setSharing(false)
    }
  }

  // Sequência de slides do modo apresentação (uma seção por vez). Landing
  // Page entra mesmo sem dados de anúncios — são seções independentes. Funil
  // Comercial entra sempre que houver QUALQUER plataforma de anúncio (é um
  // formulário manual, não depende de qual plataforma foi contratada).
  const slides: { title: string; node: ReactNode }[] = [
    ...(meta
      ? [
          { title: 'Meta Ads — Visão Geral', node: <OverviewSection meta={meta} /> },
          { title: 'Jornada do Cliente', node: <FunnelSection meta={meta} /> },
          { title: 'Evolução no tempo (Meta Ads)', node: <EvolutionSection meta={meta} periodStart={periodStart} periodEnd={periodEnd} /> },
          { title: 'Campanhas em destaque (Meta Ads)', node: <CampaignsSection campaigns={meta.topCampaigns} /> },
        ]
      : []),
    ...(google
      ? [
          { title: 'Google Ads — Visão Geral', node: <GoogleOverviewSection google={google} /> },
          { title: 'Evolução no tempo (Google Ads)', node: <GoogleEvolutionSection google={google} periodStart={periodStart} periodEnd={periodEnd} /> },
          { title: 'Campanhas em destaque (Google Ads)', node: <GoogleCampaignsSection campaigns={google.topCampaigns} /> },
        ]
      : []),
    ...(hasAds ? [{ title: 'O que fizemos no período', node: workDoneNode }] : []),
    ...(hasAds ? [{ title: 'Funil Comercial', node: <ReportFunnelSection report={report} editable={false} /> }] : []),
    ...(hasAds ? [{ title: 'Resumo Executivo', node: resumoNode }] : []),
    ...(report.landingPage ? [{ title: 'Landing Page', node: <LandingPageSection lp={report.landingPage} /> }] : []),
  ]

  const clampedSlide = Math.min(slide, Math.max(0, slides.length - 1))
  const hasAnyData = slides.length > 0

  const emptyStateNode = (
    <Card><p className="text-sm text-slate-400">Este relatório ainda não tem dados de nenhuma plataforma.</p></Card>
  )

  const body = presenting ? (
    <div className="mx-auto flex min-h-[70vh] max-w-6xl flex-col gap-8 p-6 pb-28">
      {!hasAnyData ? emptyStateNode : <Section title={slides[clampedSlide].title}>{slides[clampedSlide].node}</Section>}
    </div>
  ) : (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      {!hasAnyData ? (
        emptyStateNode
      ) : (
        <>
          {meta && (
            <>
              <OverviewSection meta={meta} />
              <FunnelSection meta={meta} />
              <EvolutionSection meta={meta} periodStart={periodStart} periodEnd={periodEnd} />
              <CampaignsSection campaigns={meta.topCampaigns} />
              <AdsSection ads={meta.topAds} />
              <PlatformSection meta={meta} />
            </>
          )}
          {google && (
            <>
              <GoogleOverviewSection google={google} />
              <GoogleEvolutionSection google={google} periodStart={periodStart} periodEnd={periodEnd} />
              <GoogleCampaignsSection campaigns={google.topCampaigns} />
            </>
          )}
          {hasAds && (
            <Section title="O que fizemos no período" subtitle="Otimizações registradas pela equipe nas campanhas">
              {workDoneNode}
            </Section>
          )}
          {hasAds && (
            <Section title="Funil Comercial" subtitle="Do investimento em anúncios ao contrato assinado">
              <ReportFunnelSection report={report} editable />
            </Section>
          )}
          {hasAds && (
            <Section title="Resumo do período">
              <ExecutiveSummary meta={meta} google={google} start={periodStart} end={periodEnd}>
                <NextStepsEditor key={report.nextSteps ?? ''} report={report} />
              </ExecutiveSummary>
            </Section>
          )}
          {report.landingPage && <LandingPageSection lp={report.landingPage} />}
        </>
      )}
    </div>
  )

  const presentationNav = presenting && hasAnyData && (
    <div className="fixed inset-x-0 bottom-0 z-[110] flex items-center justify-center gap-3 bg-[#0F172A]/95 px-6 py-3 text-white">
      <button
        onClick={() => setSlide((s) => Math.max(0, s - 1))}
        disabled={clampedSlide === 0}
        className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20 disabled:opacity-30"
      >
        <ChevronLeft size={16} /> Anterior
      </button>
      <span className="text-xs text-slate-300">
        {clampedSlide + 1} / {slides.length} · {slides[clampedSlide].title}
      </span>
      <button
        onClick={() => setSlide((s) => Math.min(slides.length - 1, s + 1))}
        disabled={clampedSlide >= slides.length - 1}
        className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20 disabled:opacity-30"
      >
        Próximo <ChevronRight size={16} />
      </button>
    </div>
  )

  const header = (
    <div className="flex flex-wrap items-center gap-4 bg-[#0F172A] px-6 py-5 text-white">
      <img src="/favicon.png" alt="Quiver" className="h-9 w-9 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[24px] font-bold leading-tight">{isPrivacyMode ? '••••••' : clientName}</p>
        <p className="text-xs text-slate-300">
          {fmtDate(periodStart)} — {fmtDate(periodEnd)}
          <span className="ml-2 text-slate-500">vs {fmtDate(prev.start)} — {fmtDate(prev.end)}</span>
        </p>
      </div>
      {presenting ? (
        <button
          onClick={() => setPresenting(false)}
          className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
        >
          <X size={14} /> Sair da apresentação (ESC)
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            onClick={handleShare}
            disabled={sharing || !client}
            title="Copia um link que o cliente abre sem login e escolhe as datas"
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-50"
          >
            <Link2 size={14} /> {sharing ? 'Gerando link…' : 'Link pro cliente'}
          </button>
          <button
            onClick={() => window.print()}
            title="Abre a janela de impressão — escolha Salvar como PDF"
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
          >
            <FileDown size={14} /> Baixar PDF
          </button>
          <button
            onClick={() => setPresenting(true)}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
          >
            <Maximize2 size={14} /> Modo apresentação
          </button>
        </div>
      )}
    </div>
  )

  if (presenting) {
    return (
      <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#F1F5F9]" style={{ zoom: 1.2 }}>
        {header}
        {body}
        {presentationNav}
      </div>
    )
  }

  return (
    <div className="report-print -mx-8 -my-8 flex flex-col bg-[#F1F5F9] print:m-0">
      <div className="px-8 pt-6 print:hidden">
        <button onClick={() => navigate('/relatorios')} className="mb-4 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={14} /> Relatórios
        </button>
      </div>
      {header}
      <div className="px-4 py-8 sm:px-8">{body}</div>
    </div>
  )
}
