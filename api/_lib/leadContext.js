// Formata os dados de um lead pro prompt da IA — usado tanto pelas
// sugestões ao vivo (copilotoSugestao.js) quanto pelo resumo pós-chamada
// (copilotoResumo.js) do Copiloto de Vendas. Fonte única pra não divergir.

const SEGMENT_LABEL = { cleaning_services: 'Serviços de limpeza', cleaning_products: 'Produtos de limpeza' }

function bantLine(bant) {
  if (!bant) return null
  const notas = ['budget', 'authority', 'need', 'timing']
    .map((k) => (typeof bant[k] === 'number' ? `${k} ${bant[k]}` : null))
    .filter(Boolean)
  return notas.length > 0 ? `BANT: ${notas.join(', ')}` : null
}

export function leadContextBlock(lead) {
  if (!lead) return '(lead não encontrado no CRM)'
  const lines = [`Empresa: ${lead.companyName || '—'}`, `Contato: ${lead.contactName || '—'}`]
  if (lead.segment) lines.push(`Segmento: ${SEGMENT_LABEL[lead.segment] || lead.segment}`)
  if (lead.cityRegion) lines.push(`Cidade/região: ${lead.cityRegion}`)
  const bant = bantLine(lead.bant)
  if (bant) lines.push(bant)
  if (lead.notes) lines.push(`Observações: ${lead.notes}`)
  return lines.join('\n')
}
