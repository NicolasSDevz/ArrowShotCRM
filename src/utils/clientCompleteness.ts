import type { Client } from '../types/client'

/** Observação curta demais não conta: tem que dizer o que foi vendido e combinado. */
export const MIN_NOTES_LENGTH = 40

/** Roteiro que o botão "Usar roteiro" coloca nas observações do cliente. */
export const NOTES_TEMPLATE = [
  'O que foi vendido: ',
  'Onde roda o anúncio (Meta / Google): ',
  'Verba de anúncio por mês: ',
  'Prazos e promessas: ',
  'Condições (desconto, forma de pagamento, fidelidade): ',
  'Público / região que o cliente quer: ',
  'Outras informações: ',
].join('\n')

/** Texto das observações sem as linhas do roteiro que ficaram em branco. */
export function notesContent(notes: string | undefined): string {
  if (!notes) return ''
  const templateLines = new Set(NOTES_TEMPLATE.split('\n').map((l) => l.trim()))
  return notes
    .split('\n')
    .filter((l) => !templateLines.has(l.trim()))
    .join('\n')
    .trim()
}

type CompletenessInput = {
  companyName?: string
  whatsapp?: string
  segment?: string
  city?: string
  notes?: string
  monthlyValue?: number | null
  hasStartDate: boolean
  ownerCount: number
  paidTraffic: boolean
  socialMedia: boolean
  landingPage: boolean
  metaAds: boolean
  googleAds: boolean
}

/** Lista do que falta no cadastro de um cliente — mesma regra no formulário
 *  (bloqueia "Cadastrar") e na ficha (aviso "Cadastro incompleto"). */
export function missingClientFields(c: CompletenessInput): string[] {
  const missing: string[] = []
  if (!c.companyName?.trim()) missing.push('Nome da empresa')
  if (!c.whatsapp?.trim()) missing.push('WhatsApp')
  if (!c.segment?.trim()) missing.push('Segmento')
  if (!c.city?.trim()) missing.push('Cidade/região')
  if (!c.paidTraffic && !c.socialMedia && !c.landingPage) missing.push('Serviços contratados')
  if (c.paidTraffic && !c.metaAds && !c.googleAds) missing.push('Plataforma do tráfego (Meta ou Google)')
  if (!c.monthlyValue || c.monthlyValue <= 0) missing.push('Valor mensal')
  if (!c.hasStartDate) missing.push('Data de início')
  if (c.ownerCount === 0) missing.push('Responsável')
  if (notesContent(c.notes).length < MIN_NOTES_LENGTH) missing.push('Observações completas')
  return missing
}

export function missingFieldsOfClient(client: Client): string[] {
  const m = client.modules
  return missingClientFields({
    companyName: client.companyName,
    whatsapp: client.whatsapp,
    segment: client.segment,
    city: client.city,
    notes: client.notes,
    monthlyValue: client.monthlyValue,
    hasStartDate: !!client.contractStartDate,
    ownerCount: (client.ownerIds?.length ?? 0) + (client.ownerIds?.length ? 0 : client.ownerId ? 1 : 0),
    paidTraffic: !!m?.paidTraffic,
    socialMedia: !!m?.socialMedia,
    landingPage: !!m?.landingPage,
    metaAds: !!m?.metaAds,
    googleAds: !!m?.googleAds,
  })
}
