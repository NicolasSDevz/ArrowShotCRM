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
} from '../types'
import { metaTotals, googleTotals, linesToList, type PlanningTotals } from './campaignPlanningStats'

type RGB = [number, number, number]

/* Identidade visual Quiver. */
const BLUE: RGB = [37, 99, 235] // #2563EB — primário
const DARK_BLUE: RGB = [30, 64, 175] // #1E40AF — headers de bloco (B2C)
const DARK: RGB = [15, 23, 42] // #0F172A — capa e texto principal
const SLATE_700: RGB = [55, 65, 81] // #374151 — texto de linhas de tabela
const MUTED: RGB = [100, 116, 139] // #64748B — texto secundário
const SLATE_600: RGB = [71, 85, 105] // #475569 — rodapé da capa
const SLATE_400: RGB = [148, 163, 184] // #94A3B8 — rodapé das páginas internas
const LIGHT_BG: RGB = [241, 245, 249] // #F1F5F9 — fundos alternativos
const ZEBRA: RGB = [248, 250, 252] // #F8FAFC — linhas alternadas de tabela, cards e notas
const BORDER: RGB = [226, 232, 240] // #E2E8F0 — bordas e divisórias
const GREEN: RGB = [16, 185, 129] // #10B981 — configurado/ok
const RED: RGB = [239, 68, 68] // #EF4444 — pendente/atenção
const GOOGLE_RED: RGB = [220, 38, 38] // #DC2626 — destaque Google Ads
const LIGHT_BLUE_TEXT: RGB = [147, 197, 253] // #93C5FD — subtítulos da capa
const WHITE: RGB = [255, 255, 255]
const GREEN_BG: RGB = [209, 250, 229] // cidades desejadas
const BLUE_BG: RGB = [219, 234, 254] // header B2C
const VIOLET_BG: RGB = [237, 233, 254] // header B2B
const VIOLET_TEXT: RGB = [109, 40, 217]
const AMBER_BG: RGB = [254, 249, 195] // dor do cliente
const AMBER_TEXT: RGB = [133, 77, 14]
const ORANGE_BG: RGB = [255, 237, 213] // objeção comum
const ORANGE_TEXT: RGB = [154, 52, 18]

/* Apresentação em slides — A4 paisagem, um assunto por página. */
const PAGE_W = 297
const PAGE_H = 210
const MARGIN = 18
const CONTENT_W = PAGE_W - MARGIN * 2
const BAND_H = 15
const BOTTOM_LIMIT = PAGE_H - 22

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

/* Fontes padrão do jsPDF (Helvetica) só suportam Windows-1252. Texto colado
 * de fora (emoji, símbolos, CJK) vira lixo tipo "Ø=Ý5" quando renderizado —
 * removemos qualquer ponto de código fora da tabela cp1252 antes de usar o
 * texto em qualquer doc.text/autoTable. Iterar com Array.from (não por
 * índice) trata pares substitutos corretamente. */
const CP1252_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018,
  0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
])
function sanitize(s?: string | null): string {
  if (!s) return ''
  return Array.from(s)
    .filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0
      return cp <= 0xff || CP1252_EXTRA.has(cp)
    })
    .join('')
}

function ensureSpace(doc: jsPDF, clientName: string, y: number, needed: number): number {
  if (y + needed > BOTTOM_LIMIT) {
    doc.addPage()
    return pageHeader(doc, clientName)
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

function centerText(doc: jsPDF, text: string, y: number, size: number, style: 'normal' | 'bold', color: RGB): void {
  doc.setFont('helvetica', style)
  doc.setFontSize(size)
  doc.setTextColor(color[0], color[1], color[2])
  doc.text(text, PAGE_W / 2, y, { align: 'center' })
}

/** Faixa azul fixa no topo de toda página interna: nome do cliente à
 *  esquerda, nome do documento à direita. A página em si fica branca — só os
 *  elementos de destaque (linhas zebradas de tabela, cards de campanha,
 *  notas) usam o cinza #F8FAFC, porque um fundo de página inteiro nessa cor
 *  faria esses elementos "sumirem" por terem exatamente a mesma cor.
 *  Reaplicada em toda página que o autoTable criar sozinho (overflow de
 *  tabela), pra nunca ter página sem identidade visual. */
function pageHeader(doc: jsPDF, clientName: string): number {
  doc.setFillColor(BLUE[0], BLUE[1], BLUE[2])
  doc.rect(0, 0, PAGE_W, BAND_H, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2])
  doc.text(sanitize(clientName), MARGIN, BAND_H / 2 + 3.2)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.text('Planejamento de Campanhas', PAGE_W - MARGIN, BAND_H / 2 + 3.2, { align: 'right' })
  return BAND_H + 14
}

/** Título de seção — igual ao nome da página no documento, com uma "tag" de
 *  plataforma pequena e opcional acima (pra distinguir páginas repetidas
 *  entre Meta e Google, ex. duas páginas "Estrutura de campanhas") e um
 *  subtítulo opcional abaixo. */
function sectionTitle(doc: jsPDF, y: number, title: string, accent: RGB = BLUE, kicker?: string, subtitle?: string): number {
  let ty = y
  if (kicker) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(accent[0], accent[1], accent[2])
    doc.text(kicker.toUpperCase(), MARGIN, ty)
    ty += 7
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.setTextColor(DARK[0], DARK[1], DARK[2])
  doc.text(title.toUpperCase(), MARGIN, ty)
  doc.setFillColor(accent[0], accent[1], accent[2])
  doc.rect(MARGIN, ty + 2.6, 26, 1.3, 'F')
  ty += 15
  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10.5)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text(subtitle, MARGIN, ty - 3)
    ty += 4
  }
  return ty
}

/** Nova página com faixa azul + título de seção já prontos. */
function newSlide(doc: jsPDF, clientName: string, title: string, accent: RGB = BLUE, kicker?: string, subtitle?: string): number {
  doc.addPage()
  const y = pageHeader(doc, clientName)
  return sectionTitle(doc, y, title, accent, kicker, subtitle)
}

/** Cartões de KPI lado a lado — fundo branco, borda cinza fina ao redor,
 *  faixa colorida no topo, valor grande na cor de destaque. */
function kpiCards(
  doc: jsPDF,
  y: number,
  cards: { label: string; value: string; accent?: RGB }[],
  compact = false,
): number {
  const gap = 7
  const w = (CONTENT_W - gap * (cards.length - 1)) / cards.length
  const h = compact ? 19 : 26
  const topBarH = 1.4
  const radius = 1.6
  cards.forEach((c, i) => {
    const x = MARGIN + i * (w + gap)
    const color = c.accent ?? BLUE
    doc.setFillColor(WHITE[0], WHITE[1], WHITE[2])
    doc.roundedRect(x, y, w, h, radius, radius, 'F')
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2])
    doc.setLineWidth(0.3)
    doc.roundedRect(x, y, w, h, radius, radius, 'S')
    // Faixa colorida no topo do card — só a parte abaixo do raio do
    // arredondamento, pra não "estourar" a curva do canto com um retângulo reto.
    doc.setFillColor(color[0], color[1], color[2])
    doc.rect(x, y + radius, w, topBarH, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(compact ? 14 : 17)
    doc.setTextColor(color[0], color[1], color[2])
    doc.text(c.value, x + w / 2, y + h / 2 + (compact ? 1.5 : 2.5), { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text(c.label.toUpperCase(), x + w / 2, y + h - 4.5, { align: 'center' })
  })
  return y + h + 10
}

/** Duas caixas coloridas lado a lado, cada uma com título + lista de itens
 *  com marcador — usada por segmentação geográfica e palavras-chave. */
function twoColumnBoxes(
  doc: jsPDF,
  y: number,
  left: { title: string; items: string[]; empty: string; bg: RGB; accent: RGB },
  right: { title: string; items: string[]; empty: string; bg: RGB; accent: RGB },
): number {
  const colGap = 12
  const colW = (CONTENT_W - colGap) / 2
  const innerW = colW - 20

  const measure = (col: { items: string[] }) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    if (!col.items.length) return 30
    let h = 18
    for (const item of col.items) {
      const lines = doc.splitTextToSize(sanitize(item), innerW) as string[]
      h += lines.length * 5.6
    }
    return h + 8
  }
  const boxH = Math.max(measure(left), measure(right), 30)

  const draw = (x: number, col: typeof left) => {
    doc.setFillColor(col.bg[0], col.bg[1], col.bg[2])
    doc.roundedRect(x, y, colW, boxH, 2.5, 2.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(col.accent[0], col.accent[1], col.accent[2])
    doc.text(col.title, x + 8, y + 11)
    let cy = y + 19
    if (!col.items.length) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
      doc.text(col.empty, x + 8, cy)
      return
    }
    for (const item of col.items) {
      doc.setFillColor(col.accent[0], col.accent[1], col.accent[2])
      doc.circle(x + 9.5, cy - 1.4, 0.9, 'F')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(DARK[0], DARK[1], DARK[2])
      const lines = doc.splitTextToSize(sanitize(item), innerW) as string[]
      doc.text(lines, x + 13, cy)
      cy += lines.length * 5.6
    }
  }
  draw(MARGIN, left)
  draw(MARGIN + colW + colGap, right)
  return y + boxH + 10
}

/** Card de texto livre (observações, dor do cliente, objeção) — fundo claro
 *  com borda esquerda colorida. */
function noteCard(doc: jsPDF, x: number, y: number, w: number, label: string, text: string, bg: RGB, accent: RGB): number {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  const lines = doc.splitTextToSize(sanitize(text), w - 16) as string[]
  const h = 16 + lines.length * 5.6
  doc.setFillColor(bg[0], bg[1], bg[2])
  doc.rect(x, y, w, h, 'F')
  doc.setFillColor(accent[0], accent[1], accent[2])
  doc.rect(x, y, 1.3, h, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(accent[0], accent[1], accent[2])
  doc.text(label.toUpperCase(), x + 8, y + 9)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(DARK[0], DARK[1], DARK[2])
  doc.text(lines, x + 8, y + 17)
  return y + h
}

/** Bloco de perfil (B2C/B2B) — header colorido + pares label/valor. */
function profileBlock(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  title: string,
  headerBg: RGB,
  headerText: RGB,
  fields: [string, string][],
): number {
  const headerH = 11
  const rowH = 8.6
  const bodyH = fields.length * rowH + 6
  doc.setFillColor(headerBg[0], headerBg[1], headerBg[2])
  doc.rect(x, y, w, headerH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(headerText[0], headerText[1], headerText[2])
  doc.text(title, x + 6, y + headerH / 2 + 1.6)

  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2])
  doc.setLineWidth(0.35)
  doc.rect(x, y, w, headerH + bodyH, 'S')

  const labelW = w * 0.36
  let cy = y + headerH + 8
  for (const [label, value] of fields) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text(label, x + 6, cy)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(DARK[0], DARK[1], DARK[2])
    const lines = doc.splitTextToSize(sanitize(value) || '—', w - labelW - 10) as string[]
    doc.text(lines, x + labelW, cy)
    cy += Math.max(rowH, lines.length * 5)
  }
  return y + headerH + bodyH
}

/** Bolinha preenchida — verde (configurado) ou vermelha (pendente). */
function drawStatusDot(doc: jsPDF, x: number, y: number, ok: boolean): void {
  const color = ok ? GREEN : RED
  doc.setFillColor(color[0], color[1], color[2])
  doc.circle(x, y, 1.6, 'F')
}

/** Um card por campanha — fundo #F8FAFC, borda esquerda colorida, nome em
 *  bold e o resto dos dados num grid horizontal de label/valor. Desenhado
 *  campanha a campanha (não como tabela) pra caber o layout de bloco pedido;
 *  cada chamada já garante espaço suficiente antes de desenhar, então nunca
 *  corta um card no meio entre duas páginas. */
function campaignBlock(doc: jsPDF, name: string, fields: [string, string][], y: number, accent: RGB): number {
  const h = 24
  doc.setFillColor(ZEBRA[0], ZEBRA[1], ZEBRA[2])
  doc.rect(MARGIN, y, CONTENT_W, h, 'F')
  doc.setFillColor(accent[0], accent[1], accent[2])
  doc.rect(MARGIN, y, 1.4, h, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(DARK[0], DARK[1], DARK[2])
  doc.text(truncate(name, 70), MARGIN + 8, y + 9)

  const colW = CONTENT_W / fields.length
  fields.forEach(([label, value], i) => {
    const x = MARGIN + 8 + i * colW
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text(label.toUpperCase(), x, y + 16.5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(DARK[0], DARK[1], DARK[2])
    doc.text(truncate(value, 22), x, y + 21.5)
  })
  return y + h + 5
}

function table(doc: jsPDF, clientName: string, opts: UserOptions): void {
  autoTable(doc, {
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 9.5, textColor: SLATE_700, cellPadding: 3, overflow: 'linebreak', lineColor: BORDER, lineWidth: 0.15 },
    headStyles: { fillColor: BLUE, textColor: WHITE, fontStyle: 'bold', fontSize: 10, halign: 'left' },
    alternateRowStyles: { fillColor: ZEBRA },
    margin: { left: MARGIN, right: MARGIN, top: BAND_H + 8, bottom: 24 },
    rowPageBreak: 'avoid',
    didDrawPage: () => {
      pageHeader(doc, clientName)
    },
    ...opts,
    head: (opts.head as string[][] | undefined)?.map((row) => row.map((cell) => String(cell).toUpperCase())),
  })
}

function addFooters(doc: jsPDF, clientName: string): void {
  const total = doc.getNumberOfPages()
  const name = truncate(sanitize(clientName), 50)
  for (let i = 2; i <= total; i++) {
    doc.setPage(i)
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2])
    doc.setLineWidth(0.3)
    doc.line(MARGIN, PAGE_H - 13, PAGE_W - MARGIN, PAGE_H - 13)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(SLATE_400[0], SLATE_400[1], SLATE_400[2])
    doc.text(`Quiver — Marketing Digital  |  ${name}  |  Página ${i - 1} de ${total - 1}`, PAGE_W / 2, PAGE_H - 8, {
      align: 'center',
    })
  }
}

function totalsKpiCards(totals: PlanningTotals, conjuntoLabel: string, accent: RGB) {
  return [
    { label: totals.campanhas === 1 ? 'Campanha' : 'Campanhas', value: String(totals.campanhas), accent },
    { label: `${conjuntoLabel}${totals.conjuntos === 1 ? '' : 's'}`, value: String(totals.conjuntos), accent },
    { label: totals.anuncios === 1 ? 'Anúncio' : 'Anúncios', value: String(totals.anuncios), accent },
  ]
}

interface FunnelRow {
  label: string
  percent: number
  verba: string
}

interface CampaignBlockData {
  name: string
  fields: [string, string][]
}

interface PlatformSlideData {
  platformName: string
  accent: RGB
  verbaMensal?: number
  diasDoMes?: number
  totals: PlanningTotals
  conjuntoLabel: string
  campaigns: CampaignBlockData[]
  funnelRows?: FunnelRow[]
  cidadesDesejadas: string[]
  cidadesExcluidas: string[]
  palavrasPositivas: string[]
  palavrasNegativas: string[]
}

/** Páginas de investimento + estrutura + segmentação + palavras-chave de uma
 *  plataforma (Meta ou Google). Compartilhado pelas duas pra manter os dois
 *  blocos sempre com a mesma estrutura visual — só muda a cor de destaque. */
function renderPlatformSlides(doc: jsPDF, clientName: string, data: PlatformSlideData): void {
  const {
    platformName,
    accent,
    verbaMensal,
    diasDoMes,
    totals,
    conjuntoLabel,
    campaigns,
    funnelRows,
    cidadesDesejadas,
    cidadesExcluidas,
    palavrasPositivas,
    palavrasNegativas,
  } = data
  const dias = diasDoMes || 30
  const diaria = verbaMensal ? verbaMensal / dias : undefined

  // ---------- Investimento ----------
  let y = newSlide(doc, clientName, platformName, accent)
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
    const barColW = 46
    table(doc, clientName, {
      startY: y,
      head: [['Etapa do funil', '% do orçamento', 'Verba mensal', '']],
      body: funnelRows.map((f) => [f.label, `${f.percent}%`, f.verba, '']),
      columnStyles: { 3: { cellWidth: barColW } },
      didDrawCell: (cell) => {
        if (cell.section !== 'body' || cell.column.index !== 3) return
        const row = funnelRows[cell.row.index]
        if (!row) return
        const padX = 2
        const barW = cell.cell.width - padX * 2
        const barH = 3.2
        const barY = cell.cell.y + cell.cell.height / 2 - barH / 2
        doc.setFillColor(BORDER[0], BORDER[1], BORDER[2])
        doc.rect(cell.cell.x + padX, barY, barW, barH, 'F')
        doc.setFillColor(accent[0], accent[1], accent[2])
        doc.rect(cell.cell.x + padX, barY, (barW * Math.min(row.percent, 100)) / 100, barH, 'F')
      },
    })
  }

  // ---------- Estrutura de campanhas (um bloco por campanha) ----------
  if (campaigns.length) {
    y = newSlide(doc, clientName, 'Estrutura de campanhas', accent, platformName)
    y = kpiCards(doc, y, totalsKpiCards(totals, conjuntoLabel, accent), true)
    for (const campaign of campaigns) {
      y = ensureSpace(doc, clientName, y, 29)
      y = campaignBlock(doc, campaign.name, campaign.fields, y, accent)
    }
  }

  // ---------- Segmentação geográfica ----------
  if (cidadesDesejadas.length || cidadesExcluidas.length) {
    newSlide(doc, clientName, 'Segmentação geográfica', accent, platformName)
    twoColumnBoxes(
      doc,
      MARGIN + 60,
      { title: 'Cidades desejadas', items: cidadesDesejadas, empty: 'Nenhuma cidade informada.', bg: GREEN_BG, accent: GREEN },
      { title: 'Cidades excluídas', items: cidadesExcluidas, empty: 'Nenhuma cidade excluída.', bg: LIGHT_BG, accent: MUTED },
    )
  }

  // ---------- Palavras-chave ----------
  if (palavrasPositivas.length || palavrasNegativas.length) {
    newSlide(doc, clientName, 'Palavras-chave', accent, platformName)
    twoColumnBoxes(
      doc,
      MARGIN + 60,
      { title: 'Positivas', items: palavrasPositivas, empty: 'Nenhuma palavra-chave informada.', bg: GREEN_BG, accent: GREEN },
      { title: 'Negativas', items: palavrasNegativas, empty: 'Nenhuma palavra-chave negativa informada.', bg: LIGHT_BG, accent: RED },
    )
  }
}

function buildGoogleSlideData(google: GoogleAdsPlanning): PlatformSlideData {
  return {
    platformName: 'Google Ads',
    accent: GOOGLE_RED,
    verbaMensal: google.verbaMensal,
    diasDoMes: google.diasDoMes,
    totals: googleTotals(google),
    conjuntoLabel: 'Grupo de anúncios',
    campaigns: (google.campanhas ?? []).map((c) => ({
      name: sanitize(c.nomeCampanha) || 'Campanha sem nome',
      fields: [
        ['Rede', c.rede ? GOOGLE_ADS_NETWORK_LABEL[c.rede] : '—'],
        ['Grupo de anúncios', sanitize(c.gruposAnuncios) || '—'],
        ['Qtd. anúncios', String(c.qtdAnuncios && c.qtdAnuncios > 0 ? c.qtdAnuncios : 1)],
        ['Lance', c.tipoLance ? GOOGLE_BID_TYPE_LABEL[c.tipoLance] : '—'],
        ['Verba diária', brl(c.verbaDiaria)],
      ],
    })),
    cidadesDesejadas: linesToList(google.cidadesDesejadas),
    cidadesExcluidas: linesToList(google.cidadesExcluidas),
    palavrasPositivas: linesToList(google.palavrasChavePositivas),
    palavrasNegativas: linesToList(google.palavrasChaveNegativas),
  }
}

type MetaFunnelStageKey = 'topo' | 'meio' | 'fundo'

function buildMetaSlideData(meta: MetaAdsPlanning): PlatformSlideData {
  const funnel: [MetaFunnelStageKey, number | undefined][] = [
    ['topo', meta.distribuicaoTopoPercent],
    ['meio', meta.distribuicaoMeioPercent],
    ['fundo', meta.distribuicaoFundoPercent],
  ]
  const funnelRows: FunnelRow[] = funnel
    .filter(([, p]) => p != null)
    .map(([stage, p]) => ({
      label: META_FUNNEL_STAGE_LABEL[stage],
      percent: p ?? 0,
      verba: meta.verbaMensal != null ? brl((meta.verbaMensal * (p ?? 0)) / 100) : '—',
    }))

  return {
    platformName: 'Meta Ads',
    accent: BLUE,
    verbaMensal: meta.verbaMensal,
    diasDoMes: meta.diasDoMes,
    totals: metaTotals(meta),
    conjuntoLabel: 'Conjunto de anúncios',
    campaigns: (meta.campanhas ?? []).map((c) => ({
      name: sanitize(c.nomeCampanha || c.descricao) || 'Campanha sem nome',
      fields: [
        ['Etapa', c.etapaFunil ? META_FUNNEL_STAGE_LABEL[c.etapaFunil] : '—'],
        ['Objetivo', c.objetivo ? META_OBJECTIVE_LABEL[c.objetivo] : '—'],
        ['Verba', brl(c.verbaDiaria)],
        ['Conjunto', sanitize(c.nomeConjunto) || '—'],
        ['Anúncios', String(c.qtdAnuncios && c.qtdAnuncios > 0 ? c.qtdAnuncios : 1)],
      ],
    })),
    funnelRows,
    cidadesDesejadas: linesToList(meta.cidadesDesejadas),
    cidadesExcluidas: linesToList(meta.cidadesExcluidas),
    palavrasPositivas: linesToList(meta.palavrasChavePositivas),
    palavrasNegativas: linesToList(meta.palavrasChaveNegativas),
  }
}

/**
 * Gera e baixa um PDF de apresentação (em formato de slides, A4 paisagem)
 * com o planejamento de campanha do cliente. `planning` é o estado atual do
 * formulário (pode conter edições ainda não salvas); o briefing de
 * público-alvo vem de `client`. Ordem: capa → visão geral (acessos) →
 * Meta Ads (investimento, estrutura, segmentação, palavras-chave) →
 * público-alvo → observações → Google Ads (mesma estrutura, com destaque
 * vermelho nos cards de investimento pra diferenciar de Meta) — páginas
 * sem conteúdo (observações vazias, plataforma não preenchida) são
 * suprimidas.
 */
export async function generateCampaignPlanningPdf(client: Client, planning: CampaignPlanning): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const now = new Date()
  const monthName = capitalize(format(now, 'MMMM', { locale: ptBR }))
  const year = format(now, 'yyyy')
  const clientName = sanitize(client.companyName)

  const acessos = planning.acessos ?? {}
  const meta = planning.metaAds
  const google = planning.googleAds
  const briefing = client.paidTrafficBriefing

  // ---------- CAPA ----------
  doc.setFillColor(DARK[0], DARK[1], DARK[2])
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F')

  const baseUrl = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
  const logo = await loadPngDataUrl(`${baseUrl}favicon-dark.png`)
  if (logo) {
    const logoSize = 20
    const logoX = (PAGE_W - logoSize) / 2
    doc.setFillColor(WHITE[0], WHITE[1], WHITE[2])
    doc.roundedRect(logoX - 3, 24, logoSize + 6, logoSize + 6, 3, 3, 'F')
    doc.addImage(logo, 'PNG', logoX, 27, logoSize, logoSize)
  }
  centerText(doc, 'QUIVER', logo ? 66 : 52, 30, 'bold', WHITE)
  centerText(doc, 'Marketing Digital', logo ? 76 : 62, 13, 'normal', BLUE)

  const dividerW = CONTENT_W * 0.4
  doc.setDrawColor(BLUE[0], BLUE[1], BLUE[2])
  doc.setLineWidth(0.7)
  doc.line(PAGE_W / 2 - dividerW / 2, 90, PAGE_W / 2 + dividerW / 2, 90)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2])
  const nameLines = doc.splitTextToSize(clientName, CONTENT_W) as string[]
  let cy = 118
  for (const line of nameLines) {
    doc.text(line, PAGE_W / 2, cy, { align: 'center' })
    cy += 12
  }
  centerText(doc, 'Planejamento de Campanhas', cy + 6, 16, 'normal', LIGHT_BLUE_TEXT)
  centerText(doc, `${monthName} de ${year}`, cy + 19, 13, 'normal', MUTED)

  centerText(doc, 'Documento confidencial — Quiver', PAGE_H - 14, 10, 'normal', SLATE_600)

  // ---------- VISÃO GERAL (ACESSOS) ----------
  let y = newSlide(doc, clientName, 'Visão geral', DARK, undefined, 'Acessos configurados')

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

  table(doc, clientName, {
    startY: y,
    head: [['Acesso', 'Status']],
    body: accessRows.map((r) => [r.label, r.ok ? 'Configurado' : 'Pendente']),
    tableWidth: CONTENT_W / 2,
    columnStyles: {
      1: { cellWidth: 44, cellPadding: { top: 3, right: 3, bottom: 3, left: 9 } },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const r = accessRows[data.row.index]
      if (!r) return
      if (data.column.index === 1) {
        data.cell.styles.textColor = r.ok ? GREEN : RED
        data.cell.styles.fontStyle = 'bold'
      } else if (r.sub) {
        data.cell.styles.textColor = MUTED
        data.cell.styles.cellPadding = { top: 3, right: 3, bottom: 3, left: 7 }
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 1) return
      const r = accessRows[data.row.index]
      if (!r) return
      drawStatusDot(doc, data.cell.x + 5, data.cell.y + data.cell.height / 2, r.ok)
    },
  })

  // ---------- META ADS ----------
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
  if (metaFilled) renderPlatformSlides(doc, clientName, buildMetaSlideData(meta))

  // ---------- PÚBLICO-ALVO ----------
  y = newSlide(doc, clientName, 'Público-alvo', DARK)
  if (!briefing?.filledAt) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text('Briefing de Tráfego Pago ainda não preenchido.', MARGIN, y)
  } else {
    const colGap = 12
    const colW = (CONTENT_W - colGap) / 2
    const b2cEnd = profileBlock(doc, MARGIN, y, colW, 'Perfil B2C (Consumidor Final)', BLUE_BG, DARK_BLUE, [
      ['Gênero', briefing.b2cGenero || '—'],
      ['Estado civil/filhos', briefing.b2cEstadoCivilFilhos || '—'],
      ['Faixa etária', briefing.b2cFaixaEtaria || '—'],
      ['Escolaridade/profissão', briefing.b2cEscolaridadeProfissao || '—'],
      ['Região', briefing.b2cRegiao || '—'],
    ])
    const b2bEnd = profileBlock(doc, MARGIN + colW + colGap, y, colW, 'Perfil B2B (Empresas)', VIOLET_BG, VIOLET_TEXT, [
      ['Setor', briefing.b2bSetor || '—'],
      ['Faturamento mínimo', brl(briefing.b2bFaturamentoMinimo)],
      ['Nº de funcionários', briefing.b2bQuantidadeFuncionarios || '—'],
      ['Cargo do decisor', briefing.b2bCargoDecisor || '—'],
      ['Localização', briefing.b2bLocalizacao || '—'],
    ])
    let noteY = Math.max(b2cEnd, b2bEnd) + 8
    noteY = ensureSpace(doc, clientName, noteY, 30)
    const noteW = (CONTENT_W - colGap) / 2
    noteCard(doc, MARGIN, noteY, noteW, 'Principal dor do cliente', briefing.b2cDorPrincipal || '—', AMBER_BG, AMBER_TEXT)
    noteCard(doc, MARGIN + noteW + colGap, noteY, noteW, 'Objeção mais comum', briefing.objecaoComum || '—', ORANGE_BG, ORANGE_TEXT)
  }

  // ---------- OBSERVAÇÕES GERAIS (suprimida se vazia) ----------
  const obs = sanitize(planning.observacoesGerais).trim()
  if (obs && obs.toLowerCase() !== 'nenhuma observação registrada.') {
    y = newSlide(doc, clientName, 'Observações gerais', DARK)
    noteCard(doc, MARGIN, y, CONTENT_W, 'Observações', obs, ZEBRA, BLUE)
  }

  // ---------- GOOGLE ADS (página final, se houver) ----------
  const googleFilled = !!(
    google?.verbaMensal ||
    google?.campanhas?.length ||
    google?.palavrasChavePositivas ||
    google?.palavrasChaveNegativas ||
    google?.cidadesDesejadas ||
    google?.cidadesExcluidas
  )
  if (googleFilled) renderPlatformSlides(doc, clientName, buildGoogleSlideData(google))

  // ---------- RODAPÉ EM TODAS AS PÁGINAS (exceto a capa) ----------
  addFooters(doc, client.companyName)

  doc.save(`Planejamento_${slug(client.companyName) || 'Cliente'}_${slug(monthName)}_${year}.pdf`)
}
