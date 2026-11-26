import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ReportGoogleSnapshot, ReportMetaSnapshot } from '../types'
import { taxPart } from '../config/adTax'

function fmtInt(v?: number): string {
  if (v == null) return '—'
  return Math.round(v).toLocaleString('pt-BR')
}

function fmtPct(v?: number): string {
  if (v == null) return '—'
  return v.toFixed(2).replace('.', ',')
}

function fmtBRL(v?: number): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: Date): string {
  return format(d, 'dd/MM/yyyy', { locale: ptBR })
}

/** Texto pronto para WhatsApp, no formato fixo do relatório semanal — ver
 *  spec do módulo de Relatórios. Devolvido como texto simples e editável;
 *  o gestor pode ajustar antes de copiar. */
export function buildWeeklyReportText(params: {
  clientName: string
  periodStart: Date
  periodEnd: Date
  meta?: ReportMetaSnapshot | null
  google?: ReportGoogleSnapshot | null
}): string {
  const { clientName, periodStart, periodEnd, meta, google } = params
  const periodLabel = `${fmtDate(periodStart)} até ${fmtDate(periodEnd)}`

  const lines: string[] = [
    `Bom dia, ${clientName}!`,
    'Passando para te desejar uma excelente segunda-feira. 😀',
    'Nova semana começando e cheia de oportunidades para gerar mais demanda e fechar novos contratos 📝.',
  ]

  if (meta) {
    const c = meta.metrics.current
    const tax = taxPart(c.spend, meta.taxRate)
    const cpl = c.spend && c.conversations ? c.spend / c.conversations : undefined
    const cplTax = taxPart(cpl, meta.taxRate)
    const withTax = (v: number | undefined, t: number | undefined) => `R$ ${fmtBRL(v)}${t != null ? ` (R$ ${fmtBRL(t)} de imposto)` : ''}`
    lines.push(
      '',
      'Campanhas no Meta Ads',
      `Período: ${periodLabel}`,
      `Impressões: ${fmtInt(c.impressions)}`,
      `Cliques: ${fmtInt(c.clicks)}`,
      `CTR: ${fmtPct(c.ctr)}%`,
      `Alcance: ${fmtInt(c.reach)}`,
      `${c.resultKind === 'leads' ? 'Leads (formulário)' : 'Conversas iniciadas'}: ${fmtInt(c.conversations)}`,
      `Valor investido: ${withTax(c.spend, tax)}`,
      `${c.resultKind === 'leads' ? 'Custo por lead' : 'Custo por conversa'}: ${cpl != null ? withTax(cpl, cplTax) : '—'}`,
      `Saldo Atual: R$ ${fmtBRL(meta.balance)}`
    )
  }

  if (google?.available) {
    const c = google.metrics.current
    lines.push(
      '',
      'Campanhas no Google Ads',
      `Período: ${periodLabel}`,
      `Impressões: ${fmtInt(c.impressions)}`,
      `Cliques: ${fmtInt(c.clicks)}`,
      `CTR: ${fmtPct(c.ctr)}%`,
      `Conversões: ${fmtInt(c.conversions)}`,
      `Valor investido: R$ ${fmtBRL(c.cost)}`
    )
  } else if (google) {
    lines.push(
      '',
      'Campanhas no Google Ads',
      `Período: ${periodLabel}`,
      'Integração com Google Ads ainda não disponível — dados não incluídos.'
    )
  }

  return lines.join('\n')
}
