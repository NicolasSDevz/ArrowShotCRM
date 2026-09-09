import type { LeadServiceInterest, LeadSource } from '../types'
import { parseCsv, downloadCsv } from './csv'

/** Importação em massa de leads via CSV (botão "Importar leads" na página de
 *  Leads). Colunas lidas por posição, nesta ordem — ver modelo de download. */
export const LEAD_IMPORT_CSV_HEADERS = [
  'nome',
  'empresa',
  'whatsapp',
  'email',
  'cidade',
  'servico_interesse',
  'plataforma',
  'origem',
  'valor_estimado',
  'observacoes',
] as const

const LEAD_IMPORT_TEMPLATE_ROWS: string[][] = [
  [...LEAD_IMPORT_CSV_HEADERS],
  [
    'Maria Oliveira',
    'Padaria Pão Quente',
    '(11) 98888-1111',
    'maria@paoquente.com.br',
    'São Paulo - SP',
    'Ambos',
    'Meta Ads',
    'Instagram orgânico',
    '1500',
    'Indicada pela Padaria Central',
  ],
  [
    'João Santos',
    'Auto Peças Santos',
    '(21) 97777-2222',
    'joao@autopecassantos.com',
    'Rio de Janeiro - RJ',
    'Tráfego Pago',
    'Ambos',
    'Google anúncio',
    '2500',
    'Quer começar no próximo mês',
  ],
  [
    'Ana Costa',
    '',
    '(31) 96666-3333',
    '',
    'Belo Horizonte - MG',
    'Social Mídia',
    '',
    'Indicação',
    '900',
    '',
  ],
]

export function downloadLeadImportTemplate() {
  downloadCsv('modelo_leads.csv', LEAD_IMPORT_TEMPLATE_ROWS)
}

export interface ParsedLeadRow {
  /** Linha 1-based como aparece na planilha (cabeçalho = linha 1). */
  line: number
  contactName: string
  companyName?: string
  whatsapp?: string
  email?: string
  cityRegion?: string
  services: LeadServiceInterest
  source: LeadSource
  estimatedValue?: number
  notes?: string
}

export interface LeadImportRowError {
  line: number
  message: string
}

export interface ParseLeadImportResult {
  valid: ParsedLeadRow[]
  errors: LeadImportRowError[]
}

// Tabela explícita em vez de regex de marcas combinantes Unicode — mantém o
// arquivo em ASCII puro (mesmo motivo do editorialCalendarImport).
const ACCENTED_CHARS: Record<string, string> = {
  á: 'a', à: 'a', â: 'a', ã: 'a', ä: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o', õ: 'o', ö: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ç: 'c',
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .split('')
    .map((ch) => ACCENTED_CHARS[ch] ?? ch)
    .join('')
    .replace(/\s+/g, ' ')
}

const SERVICE_MAP: Record<string, { paidTraffic: boolean; socialMedia: boolean }> = {
  'trafego pago': { paidTraffic: true, socialMedia: false },
  trafego: { paidTraffic: true, socialMedia: false },
  'social midia': { paidTraffic: false, socialMedia: true },
  'social media': { paidTraffic: false, socialMedia: true },
  ambos: { paidTraffic: true, socialMedia: true },
  'ambos os servicos': { paidTraffic: true, socialMedia: true },
}

const PLATFORM_MAP: Record<string, { metaAds: boolean; googleAds: boolean }> = {
  'meta ads': { metaAds: true, googleAds: false },
  meta: { metaAds: true, googleAds: false },
  facebook: { metaAds: true, googleAds: false },
  'google ads': { metaAds: false, googleAds: true },
  google: { metaAds: false, googleAds: true },
  ambos: { metaAds: true, googleAds: true },
  ambas: { metaAds: true, googleAds: true },
}

const SOURCE_MAP: Record<string, LeadSource> = {
  'instagram organico': 'instagram_organic',
  'instagram (organico)': 'instagram_organic',
  organico: 'instagram_organic',
  'instagram anuncio': 'instagram_ad',
  'instagram (anuncio)': 'instagram_ad',
  'anuncio instagram': 'instagram_ad',
  'google anuncio': 'google_ad',
  'google (anuncio)': 'google_ad',
  'anuncio google': 'google_ad',
  indicacao: 'referral',
  'whatsapp direto': 'whatsapp',
  whatsapp: 'whatsapp',
  site: 'website',
  website: 'website',
  outro: 'other',
}

const SERVICE_HINT = 'Tráfego Pago, Social Mídia ou Ambos'
const PLATFORM_HINT = 'Meta Ads, Google Ads ou Ambos'
const SOURCE_HINT =
  'Instagram orgânico, Instagram anúncio, Google anúncio, Indicação, WhatsApp direto, Site ou Outro'

/** "R$ 1.500,00" / "1.500,50" / "1500" / "1500.00" -> número.
 *  Retorna `null` se o texto não vazio não for um número válido >= 0. */
function parseMoney(raw: string): number | undefined | null {
  let s = raw.trim().replace(/r\$/i, '').replace(/\s/g, '')
  if (!s) return undefined
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

/** Faz o parse + validação do CSV de importação de leads. Colunas lidas por
 *  posição; a primeira linha é sempre tratada como cabeçalho. Só `nome` é
 *  obrigatório — os demais campos, quando preenchidos, precisam bater com o
 *  vocabulário aceito (senão a linha vai para `errors`). */
export function parseLeadImportCsv(text: string): ParseLeadImportResult {
  const rows = parseCsv(text)
  const dataRows = rows.slice(1)

  const valid: ParsedLeadRow[] = []
  const errors: LeadImportRowError[] = []

  dataRows.forEach((cols, idx) => {
    const line = idx + 2 // 1 = cabeçalho
    if (cols.every((c) => c.trim() === '')) return

    const [
      nomeRaw = '',
      empresaRaw = '',
      whatsappRaw = '',
      emailRaw = '',
      cidadeRaw = '',
      servicoRaw = '',
      plataformaRaw = '',
      origemRaw = '',
      valorRaw = '',
      obsRaw = '',
    ] = cols

    const issues: string[] = []

    const contactName = nomeRaw.trim()
    if (!contactName) issues.push('campo "nome" vazio (obrigatório)')

    let service = { paidTraffic: false, socialMedia: false }
    if (servicoRaw.trim()) {
      const match = SERVICE_MAP[normalize(servicoRaw)]
      if (!match) issues.push(`serviço "${servicoRaw.trim()}" inválido — use ${SERVICE_HINT}`)
      else service = match
    }

    let platform = { metaAds: false, googleAds: false }
    if (plataformaRaw.trim()) {
      const match = PLATFORM_MAP[normalize(plataformaRaw)]
      if (!match) issues.push(`plataforma "${plataformaRaw.trim()}" inválida — use ${PLATFORM_HINT}`)
      else platform = match
    }

    let source: LeadSource = 'other'
    if (origemRaw.trim()) {
      const match = SOURCE_MAP[normalize(origemRaw)]
      if (!match) issues.push(`origem "${origemRaw.trim()}" inválida — use ${SOURCE_HINT}`)
      else source = match
    }

    const money = parseMoney(valorRaw)
    if (money === null) issues.push(`valor estimado "${valorRaw.trim()}" não é um número válido`)

    if (issues.length > 0) {
      errors.push({ line, message: issues.join('; ') })
      return
    }

    const services: LeadServiceInterest = {
      paidTraffic: service.paidTraffic || undefined,
      metaAds: service.paidTraffic && platform.metaAds ? true : undefined,
      googleAds: service.paidTraffic && platform.googleAds ? true : undefined,
      socialMedia: service.socialMedia || undefined,
      socialMediaPackage: service.socialMedia ? 'monthly' : undefined,
    }

    valid.push({
      line,
      contactName,
      companyName: empresaRaw.trim() || undefined,
      whatsapp: whatsappRaw.trim() || undefined,
      email: emailRaw.trim() || undefined,
      cityRegion: cidadeRaw.trim() || undefined,
      services,
      source,
      estimatedValue: money ?? undefined,
      notes: obsRaw.trim() || undefined,
    })
  })

  return { valid, errors }
}
