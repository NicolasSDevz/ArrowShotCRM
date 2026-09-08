import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { UserOptions } from 'jspdf-autotable'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  META_FUNNEL_STAGE_LABEL,
  META_OBJECTIVE_LABEL,
  GOOGLE_ADS_NETWORK_LABEL,
  GOOGLE_BID_TYPE_LABEL,
  type Client,
  type CampaignPlanning,
  type MetaAdsPlanning,
  type GoogleAdsPlanning,
  type PaidTrafficBriefing,
} from '../types'
import { metaTotals, googleTotals, linesToList, type PlanningTotals } from './campaignPlanningStats'

/* Paleta — azul (Google) e violeta (Meta) como cores de plataforma, textos
 * #0F172A, fundo branco. Cada plataforma tem sua cor de destaque nos slides,
 * pra ficar claro pra quem tá vendo qual seção é qual. */
const BLUE: [number, number, number] = [37, 99, 235]
const VIOLET: [number, number, number] = [124, 58, 237]
const DARK: [number, number, number] = [15, 23, 42]
const MUTED: [number, number, number] = [100, 116, 139]
const ZEBRA: [number, number, number] = [241, 245, 249]
const LINE: [number, number, number] = [203, 213, 225]
const GREEN: [number, number, number] = [22, 163, 74]
const AMBER: [number, number, number] = [217, 119, 6]

/* Apresentação em slides — A4 paisagem, um assunto por página. */
const PAGE_W = 297
const PAGE_H = 210
const MARGIN = 18
const CONTENT_W = PAGE_W - MARGIN * 2
const BOTTOM_LIMIT = PAGE_H - 20

function brl(v?: number | null): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Remove acentos e caracteres inválidos para nome de arquivo. */
function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/** Y onde a última tabela terminou (jspdf-autotable expõe em doc.lastAutoTable). */
function lastTableY(doc: jsPDF): number {
  const t = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
  return t?.finalY ?? MARGIN
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > BOTTOM_LIMIT) {
    doc.addPage()
    return MARGIN
  }
  return y
}

async function loadPngDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function composeIcpB2C(b: PaidTrafficBriefing): string {
  return [
    b.b2cGenero && `Gênero: ${b.b2cGenero}`,
    b.b2cEstadoCivilFilhos && `Estado civil/filhos: ${b.b2cEstadoCivilFilhos}`,
    b.b2cFaixaEtaria && `Faixa etária: ${b.b2cFaixaEtaria}`,
    b.b2cEscolaridadeProfissao && `Escolaridade/profissão: ${b.b2cEscolaridadeProfissao}`,
    b.b2cRegiao && `Região: ${b.b2cRegiao}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

function composeIcpB2B(b: PaidTrafficBriefing): string {
  return [
    b.b2bSetor && `Setor: ${b.b2bSetor}`,
    b.b2bFaturamentoMinimo != null && `Faturamento mínimo: ${brl(b.b2bFaturamentoMinimo)}`,
    b.b2bQuantidadeFuncionarios && `Nº de funcionários: ${b.b2bQuantidadeFuncionarios}`,
    b.b2bCargoDecisor && `Cargo do decisor: ${b.b2bCargoDecisor}`,
    b.b2bLocalizacao && `Localização: ${b.b2bLocalizacao}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

function centerText(
  doc: jsPDF,
  text: string,
  y: number,
  size: number,
  style: 'normal' | 'bold',
  color: [number, number, number],
): void {
  doc.setFont('helvetica', style)
  doc.setFontSize(size)
  doc.setTextColor(color[0], color[1], color[2])
  doc.text(text, PAGE_W / 2, y, { align: 'center' })
}

/** Cabeçalho de slide: barra de cor no topo, "kicker" (plataforma/seção) e
 *  título grande. Retorna o Y onde o conteúdo do slide deve começar. */
function slideHeader(doc: jsPDF, kicker: string, title: string, accent: [number, number, number]): number {
  doc.setFillColor(accent[0], accent[1], accent[2])
  doc.rect(0, 0, PAGE_W, 3, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(accent[0], accent[1], accent[2])
  doc.text(kicker.toUpperCase(), MARGIN, 19)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(21)
  doc.setTextColor(DARK[0], DARK[1], DARK[2])
  doc.text(title, MARGIN, 31)

  doc.setDrawColor(LINE[0], LINE[1], LINE[2])
  doc.setLineWidth(0.4)
  doc.line(MARGIN, 37, PAGE_W - MARGIN, 37)

  return 50
}

/** Novo slide (nova página) já com cabeçalho — usar para todo slide exceto a capa. */
function newSlide(doc: jsPDF, kicker: string, title: string, accent: [number, number, number]): number {
  doc.addPage()
  return slideHeader(doc, kicker, title, accent)
}

/** Cartões de KPI lado a lado — usados pra investimento e contagem de estrutura. */
function kpiCards(doc: jsPDF, y: number, cards: { label: string; value: string; accent?: [number, number, number] }[]): number {
  const gap = 7
  const w = (CONTENT_W - gap * (cards.length - 1)) / cards.length
  const h = 28
  cards.forEach((c, i) => {
    const x = MARGIN + i * (w + gap)
    const color = c.accent ?? DARK
    doc.setFillColor(250, 250, 252)
    doc.setDrawColor(LINE[0], LINE[1], LINE[2])
    doc.setLineWidth(0.35)
    doc.roundedRect(x, y, w, h, 2.5, 2.5, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(17)
    doc.setTextColor(color[0], color[1], color[2])
    doc.text(c.value, x + w / 2, y + 15, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text(c.label.toUpperCase(), x + w / 2, y + 22, { align: 'center' })
  })
  return y + h + 12
}

/** Lista de itens ("• item") dentro de uma coluna — usada por cidades e palavras-chave. */
function columnList(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  title: string,
  items: string[],
  emptyText: string,
  accent: [number, number, number],
): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(accent[0], accent[1], accent[2])
  doc.text(title, x, y)
  let cy = y + 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  if (!items.length) {
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text(emptyText, x, cy)
    return cy + 6
  }
  doc.setTextColor(DARK[0], DARK[1], DARK[2])
  for (const item of items) {
    const lines = doc.splitTextToSize(`•  ${item}`, w) as string[]
    doc.text(lines, x, cy)
    cy += lines.length * 5.4
  }
  return cy
}

/** Duas colunas lado a lado (cidades desejadas/excluídas, palavras positivas/negativas). */
function twoColumns(
  doc: jsPDF,
  y: number,
  left: { title: string; items: string[]; empty: string },
  right: { title: string; items: string[]; empty: string },
  accentLeft: [number, number, number] = GREEN,
  accentRight: [number, number, number] = [220, 38, 38],
): number {
  const colGap = 18
  const colW = (CONTENT_W - colGap) / 2
  const leftEnd = columnList(doc, MARGIN, y, colW, left.title, left.items, left.empty, accentLeft)
  const rightEnd = columnList(doc, MARGIN + colW + colGap, y, colW, right.title, right.items, right.empty, accentRight)
  return Math.max(leftEnd, rightEnd)
}

function paragraph(doc: jsPDF, text: string, y: number, color: [number, number, number]): number {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(color[0], color[1], color[2])
  const lines = doc.splitTextToSize(text, CONTENT_W) as string[]
  const startY = ensureSpace(doc, y, lines.length * 6 + 6)
  doc.text(lines, MARGIN, startY)
  return startY + lines.length * 6 + 4
}

/** Círculo verde com "check" (configurado) ou âmbar com "relógio" (pendente). */
function drawStatusIcon(doc: jsPDF, x: number, y: number, ok: boolean): void {
  const r = 1.8
  const fill = ok ? GREEN : AMBER
  doc.setFillColor(fill[0], fill[1], fill[2])
  doc.circle(x, y, r, 'F')
  doc.setDrawColor(255, 255, 255)
  doc.setLineWidth(0.45)
  if (ok) {
    doc.line(x - 0.85, y + 0.05, x - 0.2, y + 0.75)
    doc.line(x - 0.2, y + 0.75, x + 0.95, y - 0.75)
  } else {
    doc.line(x, y + 0.15, x, y - 0.95)
    doc.line(x, y + 0.15, x + 0.8, y + 0.45)
  }
}

function table(doc: jsPDF, opts: UserOptions): void {
  autoTable(doc, {
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 9.5, textColor: DARK, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9.5 },
    alternateRowStyles: { fillColor: ZEBRA },
    margin: { left: MARGIN, right: MARGIN },
    ...opts,
  })
}

function addFooters(doc: jsPDF, clientName: string): void {
  const total = doc.getNumberOfPages()
  const centerName = truncate(clientName, 60)
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setDrawColor(LINE[0], LINE[1], LINE[2])
    doc.setLineWidth(0.3)
    doc.line(MARGIN, PAGE_H - 13, PAGE_W - MARGIN, PAGE_H - 13)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text('Arrow Shot — Marketing Digital', MARGIN, PAGE_H - 8)
    doc.text(centerName, PAGE_W / 2, PAGE_H - 8, { align: 'center' })
    doc.text(`${i}/${total}`, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' })
  }
}

function totalsKpiCards(totals: PlanningTotals, conjuntoLabel: string, accent: [number, number, number]) {
  return [
    { label: totals.campanhas === 1 ? 'Campanha' : 'Campanhas', value: String(totals.campanhas), accent },
    { label: `${conjuntoLabel}${totals.conjuntos === 1 ? '' : 's'}`, value: String(totals.conjuntos), accent },
    { label: totals.anuncios === 1 ? 'Anúncio' : 'Anúncios', value: String(totals.anuncios), accent },
  ]
}

/** Slides de investimento + estrutura + segmentação + palavras-chave de uma
 *  plataforma (Google ou Meta). Compartilhado pelas duas pra manter os dois
 *  blocos sempre com a mesma estrutura visual. */
function renderPlatformSlides(
  doc: jsPDF,
  opts: {
    platformName: string
    accent: [number, number, number]
    verbaMensal?: number
    diasDoMes?: number
    totals: PlanningTotals
    conjuntoLabel: string
    campaignHead: string[]
    campaignRows: string[][]
    funnelRows?: [string, string, string][]
    cidadesDesejadas: string[]
    cidadesExcluidas: string[]
    palavrasPositivas: string[]
    palavrasNegativas: string[]
  },
): void {
  const {
    platformName,
    accent,
    verbaMensal,
    diasDoMes,
    totals,
    conjuntoLabel,
    campaignHead,
    campaignRows,
    funnelRows,
    cidadesDesejadas,
    cidadesExcluidas,
    palavrasPositivas,
    palavrasNegativas,
  } = opts
  const dias = diasDoMes || 30
  const diaria = verbaMensal ? verbaMensal / dias : undefined

  // ---------- Slide: Investimento ----------
  let y = newSlide(doc, platformName, 'Investimento', accent)
  y = kpiCards(doc, y, [
    { label: 'Verba diária', value: brl(diaria), accent },
    { label: 'Verba mensal', value: brl(verbaMensal), accent },
    { label: 'Dias considerados', value: String(dias), accent },
  ])
  if (funnelRows?.length) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(DARK[0], DARK[1], DARK[2])
    doc.text('Distribuição por funil', MARGIN, y)
    y += 4
    table(doc, {
      startY: y,
      head: [['Etapa do funil', '% do orçamento', 'Verba mensal']],
      body: funnelRows,
    })
  }

  // ---------- Slide: Estrutura de campanhas ----------
  if (campaignRows.length) {
    y = newSlide(doc, platformName, 'Estrutura de campanhas', accent)
    y = kpiCards(doc, y, totalsKpiCards(totals, conjuntoLabel, accent))
    table(doc, {
      startY: y,
      head: [campaignHead],
      body: campaignRows,
      columnStyles: { [campaignHead.length - 1]: { cellWidth: 30, halign: 'right' } },
    })
  }

  // ---------- Slide: Segmentação geográfica ----------
  if (cidadesDesejadas.length || cidadesExcluidas.length) {
    y = newSlide(doc, platformName, 'Segmentação geográfica', accent)
    twoColumns(
      doc,
      y,
      { title: 'Cidades desejadas', items: cidadesDesejadas, empty: 'Nenhuma cidade informada.' },
      { title: 'Cidades excluídas', items: cidadesExcluidas, empty: 'Nenhuma cidade excluída.' },
      GREEN,
      [220, 38, 38],
    )
  }

  // ---------- Slide: Palavras-chave ----------
  if (palavrasPositivas.length || palavrasNegativas.length) {
    y = newSlide(doc, platformName, 'Palavras-chave', accent)
    twoColumns(
      doc,
      y,
      { title: 'Positivas', items: palavrasPositivas, empty: 'Nenhuma palavra-chave informada.' },
      { title: 'Negativas', items: palavrasNegativas, empty: 'Nenhuma palavra-chave negativa informada.' },
      GREEN,
      [220, 38, 38],
    )
  }
}

function buildGoogleSlideData(google: GoogleAdsPlanning) {
  return {
    platformName: 'Google Ads',
    accent: BLUE,
    verbaMensal: google.verbaMensal,
    diasDoMes: google.diasDoMes,
    totals: googleTotals(google),
    conjuntoLabel: 'Grupo de anúncios',
    campaignHead: ['Rede', 'Campanha', 'Grupo de anúncios', 'Qtd. anúncios', 'Lance', 'Verba diária'],
    campaignRows: (google.campanhas ?? []).map((c) => [
      c.rede ? GOOGLE_ADS_NETWORK_LABEL[c.rede] : '—',
      c.nomeCampanha || '—',
      c.gruposAnuncios || '—',
      String(c.qtdAnuncios && c.qtdAnuncios > 0 ? c.qtdAnuncios : 1),
      c.tipoLance ? GOOGLE_BID_TYPE_LABEL[c.tipoLance] : '—',
      brl(c.verbaDiaria),
    ]),
    cidadesDesejadas: linesToList(google.cidadesDesejadas),
    cidadesExcluidas: linesToList(google.cidadesExcluidas),
    palavrasPositivas: linesToList(google.palavrasChavePositivas),
    palavrasNegativas: linesToList(google.palavrasChaveNegativas),
  }
}

function buildMetaSlideData(meta: MetaAdsPlanning) {
  const funnel: [MetaFunnelStageKey, number | undefined][] = [
    ['topo', meta.distribuicaoTopoPercent],
    ['meio', meta.distribuicaoMeioPercent],
    ['fundo', meta.distribuicaoFundoPercent],
  ]
  const funnelRows: [string, string, string][] = funnel
    .filter(([, p]) => p != null)
    .map(([stage, p]) => [
      META_FUNNEL_STAGE_LABEL[stage],
      `${p}%`,
      meta.verbaMensal != null ? brl((meta.verbaMensal * (p ?? 0)) / 100) : '—',
    ])

  return {
    platformName: 'Meta Ads',
    accent: VIOLET,
    verbaMensal: meta.verbaMensal,
    diasDoMes: meta.diasDoMes,
    totals: metaTotals(meta),
    conjuntoLabel: 'Conjunto de anúncios',
    campaignHead: ['Etapa', 'Campanha', 'Conjunto', 'Qtd. anúncios', 'Objetivo', 'Verba diária'],
    campaignRows: (meta.campanhas ?? []).map((c) => [
      c.etapaFunil ? META_FUNNEL_STAGE_LABEL[c.etapaFunil] : '—',
      c.nomeCampanha || c.descricao || '—',
      c.nomeConjunto || '—',
      String(c.qtdAnuncios && c.qtdAnuncios > 0 ? c.qtdAnuncios : 1),
      c.objetivo ? META_OBJECTIVE_LABEL[c.objetivo] : '—',
      brl(c.verbaDiaria),
    ]),
    funnelRows,
    cidadesDesejadas: linesToList(meta.cidadesDesejadas),
    cidadesExcluidas: linesToList(meta.cidadesExcluidas),
    palavrasPositivas: linesToList(meta.palavrasChavePositivas),
    palavrasNegativas: linesToList(meta.palavrasChaveNegativas),
  }
}

type MetaFunnelStageKey = 'topo' | 'meio' | 'fundo'

/**
 * Gera e baixa um PDF de apresentação (em formato de slides, A4 paisagem)
 * com o planejamento de campanha do cliente. `planning` é o estado atual do
 * formulário (pode conter edições ainda não salvas); o briefing de
 * público-alvo vem de `client`. Google Ads aparece antes de Meta Ads, e cada
 * plataforma segue sempre a mesma sequência: investimento → estrutura de
 * campanhas → segmentação geográfica → palavras-chave.
 */
export async function generateCampaignPlanningPdf(client: Client, planning: CampaignPlanning): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const now = new Date()
  const monthName = capitalize(format(now, 'MMMM', { locale: ptBR }))
  const year = format(now, 'yyyy')

  const acessos = planning.acessos ?? {}
  const meta = planning.metaAds
  const google = planning.googleAds
  const briefing = client.paidTrafficBriefing

  // ---------- CAPA ----------
  const baseUrl = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
  const logo = await loadPngDataUrl(`${baseUrl}favicon.png`)
  if (logo) doc.addImage(logo, 'PNG', (PAGE_W - 22) / 2, 44, 22, 22)
  centerText(doc, 'ARROW SHOT', 80, 18, 'bold', BLUE)
  doc.setDrawColor(BLUE[0], BLUE[1], BLUE[2])
  doc.setLineWidth(0.6)
  doc.line(PAGE_W / 2 - 22, 86, PAGE_W / 2 + 22, 86)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(DARK[0], DARK[1], DARK[2])
  const nameLines = doc.splitTextToSize(client.companyName, CONTENT_W) as string[]
  let cy = 122
  for (const line of nameLines) {
    doc.text(line, PAGE_W / 2, cy, { align: 'center' })
    cy += 13
  }
  centerText(doc, 'Planejamento de Campanhas', cy + 4, 15, 'normal', BLUE)
  centerText(doc, `${monthName} de ${year}`, cy + 15, 11, 'normal', MUTED)

  // ---------- SLIDE — ACESSOS CONFIGURADOS ----------
  let y = newSlide(doc, 'Visão geral', 'Acessos configurados', DARK)

  const gtmOk = !!(acessos.gtmContainerCriado && acessos.gtmInstaladoNoSite && acessos.gtmRastreamentoCompleto)
  const accessRows: { label: string; ok: boolean; sub?: boolean }[] = [
    { label: 'Site', ok: !!acessos.siteUrl },
    { label: 'Instagram', ok: !!acessos.instagramLink },
    { label: 'Google Ads', ok: !!(google?.verbaMensal || google?.campanhas?.length) },
    { label: 'Google Tag Manager (GTM)', ok: gtmOk },
    { label: 'Container GTM criado', ok: !!acessos.gtmContainerCriado, sub: true },
    { label: 'GTM instalado no site', ok: !!acessos.gtmInstaladoNoSite, sub: true },
    { label: 'Rastreamento completo configurado', ok: !!acessos.gtmRastreamentoCompleto, sub: true },
    { label: 'Google Meu Negócio', ok: !!acessos.gmbConfigurado },
    { label: 'WhatsApp para campanhas', ok: !!acessos.whatsappNumero },
  ]

  table(doc, {
    startY: y,
    head: [['Acesso', 'Status']],
    body: accessRows.map((r) => [r.label, r.ok ? 'Configurado' : 'Pendente']),
    tableWidth: CONTENT_W / 2,
    columnStyles: {
      1: { cellWidth: 44, cellPadding: { top: 2, right: 2, bottom: 2, left: 8 } },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const r = accessRows[data.row.index]
      if (!r) return
      if (data.column.index === 1) {
        data.cell.styles.textColor = r.ok ? GREEN : AMBER
        data.cell.styles.fontStyle = 'bold'
      } else if (r.sub) {
        data.cell.styles.textColor = MUTED
        data.cell.styles.cellPadding = { top: 2, right: 2, bottom: 2, left: 6 }
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 1) return
      const r = accessRows[data.row.index]
      if (!r) return
      drawStatusIcon(doc, data.cell.x + 4.5, data.cell.y + data.cell.height / 2, r.ok)
    },
  })

  // ---------- BLOCO GOOGLE ADS (sempre primeiro) ----------
  const googleFilled = !!(
    google?.verbaMensal ||
    google?.campanhas?.length ||
    google?.palavrasChavePositivas ||
    google?.palavrasChaveNegativas ||
    google?.cidadesDesejadas ||
    google?.cidadesExcluidas
  )
  if (googleFilled) renderPlatformSlides(doc, buildGoogleSlideData(google))

  // ---------- BLOCO META ADS ----------
  const metaFilled = !!(
    meta?.verbaMensal ||
    meta?.campanhas?.length ||
    meta?.distribuicaoTopoPercent != null ||
    meta?.distribuicaoMeioPercent != null ||
    meta?.distribuicaoFundoPercent != null ||
    meta?.palavrasChavePositivas ||
    meta?.palavrasChaveNegativas ||
    meta?.cidadesDesejadas ||
    meta?.cidadesExcluidas
  )
  if (metaFilled) renderPlatformSlides(doc, buildMetaSlideData(meta))

  // ---------- SLIDE — PÚBLICO-ALVO ----------
  y = newSlide(doc, 'Visão geral', 'Público-alvo', DARK)
  if (!briefing?.filledAt) {
    paragraph(doc, 'Briefing de Tráfego Pago ainda não preenchido.', y, MUTED)
  } else {
    table(doc, {
      startY: y,
      head: [['Campo', 'Detalhe']],
      body: [
        ['Perfil do cliente ideal (B2C)', composeIcpB2C(briefing) || '—'],
        ['Perfil do cliente ideal (B2B)', composeIcpB2B(briefing) || '—'],
        ['Principal dor do cliente', briefing.b2cDorPrincipal || '—'],
        ['Objeção mais comum', briefing.objecaoComum || '—'],
      ],
      columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' } },
    })
    y = lastTableY(doc) + 12
  }

  // ---------- SLIDE — OBSERVAÇÕES GERAIS ----------
  y = newSlide(doc, 'Visão geral', 'Observações gerais', DARK)
  const obs = planning.observacoesGerais?.trim()
  paragraph(doc, obs || 'Nenhuma observação registrada.', y, obs ? DARK : MUTED)

  // ---------- RODAPÉ EM TODAS AS PÁGINAS ----------
  addFooters(doc, client.companyName)

  doc.save(`Planejamento_${slug(client.companyName) || 'Cliente'}_${slug(monthName)}_${year}.pdf`)
}
