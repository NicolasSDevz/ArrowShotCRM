import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ReportMetaSnapshot } from '../types'

const fmtInt = (v?: number) => (v == null ? '—' : Math.round(v).toLocaleString('pt-BR'))
const fmtBRL = (v?: number) =>
  v == null || Number.isNaN(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: Date) => (Number.isNaN(d?.getTime?.()) ? '—' : format(d, 'dd/MM/yyyy', { locale: ptBR }))

/** % de variação de `curr` sobre `prev`. `undefined` se não dá para calcular. */
export function pctChange(curr?: number, prev?: number): number | undefined {
  if (curr == null || prev == null || prev === 0) return undefined
  return ((curr - prev) / prev) * 100
}

function costPerConversation(m?: { spend?: number; conversations?: number }): number | undefined {
  if (!m?.spend || !m?.conversations) return undefined
  return m.spend / m.conversations
}

/** Texto do "Resumo Executivo" — gerado a partir do snapshot, linguagem
 *  simples para o momento de falar com o cliente na call. */
export function buildExecutiveSummary(meta: ReportMetaSnapshot, periodStart: Date, periodEnd: Date): string {
  const c = meta.metrics.current
  const p = meta.metrics.previous
  const cpc = costPerConversation(c)

  const lines: string[] = []

  lines.push(
    `No período de ${fmtDate(periodStart)} a ${fmtDate(periodEnd)}, seus anúncios foram exibidos ${fmtInt(
      c.impressions
    )} vezes para ${fmtInt(c.reach)} pessoas diferentes.`
  )

  lines.push(
    `Dessas, ${fmtInt(c.clicks)} clicaram e ${fmtInt(c.conversations)} entraram em contato pelo WhatsApp` +
      (cpc != null ? `, com um custo médio de ${fmtBRL(cpc)} por conversa iniciada.` : '.')
  )

  if (p) {
    const convDelta = pctChange(c.conversations, p.conversations)
    const cpcPrev = costPerConversation(p)
    const cpcDelta = pctChange(cpc, cpcPrev)

    const better = (convDelta ?? 0) >= 0 && (cpcDelta ?? 0) <= 0
    const worse = (convDelta ?? 0) <= 0 && (cpcDelta ?? 0) >= 0
    const verdict = better ? 'melhoraram' : worse ? 'pioraram' : 'tiveram um comportamento misto'

    const parts: string[] = [`Comparado ao período anterior, os resultados ${verdict}`]
    if (convDelta != null) {
      parts.push(
        `as conversas iniciadas ${convDelta >= 0 ? 'aumentaram' : 'diminuíram'} ${Math.abs(convDelta).toFixed(0)}%`
      )
    }
    if (cpcDelta != null) {
      parts.push(`o custo por resultado ${cpcDelta <= 0 ? 'caiu' : 'subiu'} ${Math.abs(cpcDelta).toFixed(0)}%`)
    }
    lines.push(parts.length > 1 ? `${parts[0]} — ${parts.slice(1).join(' e ')}.` : `${parts[0]}.`)
  }

  return lines.join('\n\n')
}

/** "De cada 1.000 pessoas que viram seus anúncios, X clicaram e Y entraram em contato." */
export function buildFunnelSentence(meta: ReportMetaSnapshot): string {
  const c = meta.metrics.current
  if (!c.impressions) return ''
  const per1000 = (v?: number) => (v == null ? '—' : Math.max(0, (v / c.impressions!) * 1000).toFixed(1).replace('.', ','))
  return `De cada 1.000 pessoas que viram seus anúncios, ${per1000(c.clicks)} clicaram e ${per1000(
    c.conversations
  )} entraram em contato.`
}
