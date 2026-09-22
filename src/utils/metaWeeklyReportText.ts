import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ReportGoogleSnapshot, ReportMetaSnapshot } from '../types'

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
    lines.push(
      '',
      'Campanhas no Meta Ads',
      `Período: ${periodLabel}`,
      `Impressões: ${fmtInt(c.impressions)}`,
      `Cliques: ${fmtInt(c.clicks)}`,
      `CTR: ${fmtPct(c.ctr)}%`,
      `Alcance: ${fmtInt(c.reach)}`,
      `Conversas iniciadas: ${fmtInt(c.conversations)}`,
      `Valor investido: R$ ${fmtBRL(c.spend)}`,
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
