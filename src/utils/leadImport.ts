import type { LeadServiceInterest, LeadSource } from '../types'
import { parseCsv, downloadCsv } from './csv'

/** Importação em massa de leads via CSV (botão "Importar leads" na página de
 *  Leads). O arquivo pode ter qualquer cabeçalho/ordem de colunas — o usuário
 *  faz o de-para na etapa de mapeamento. O modelo abaixo já vem com nomes que
 *  o mapeamento automático reconhece. */
const LEAD_IMPORT_TEMPLATE_ROWS: string[][] = [
  ['nome', 'empresa', 'whatsapp', 'email', 'cidade', 'servico_interesse', 'origem', 'valor_estimado', 'observacoes'],
  [
    'Maria Oliveira',
    'Padaria Pão Quente',
    '(11) 98888-1111',
    'maria@paoquente.com.br',
    'São Paulo - SP',
    'Ambos',
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
    'Google anúncio',
    '2500',
    'Quer começar no próximo mês',
  ],
  ['Ana Costa', '', '(31) 96666-3333', '', 'Belo Horizonte - MG', 'Social Mídia', 'Indicação', '900', ''],
]

export function downloadLeadImportTemplate() {
  downloadCsv('modelo_leads.csv', LEAD_IMPORT_TEMPLATE_ROWS)
}

// ---------------------------------------------------------------------------
// Campos da plataforma que podem receber uma coluna do CSV
// ---------------------------------------------------------------------------

export type LeadFieldKey =
  | 'contactName'
  | 'companyName'
  | 'whatsapp'
  | 'email'
  | 'cityRegion'
  | 'service'
  | 'source'
  | 'estimatedValue'
  | 'notes'

export interface LeadImportField {
  key: LeadFieldKey
  label: string
  required?: boolean
  /** Dica exibida abaixo do dropdown quando o campo tem vocabulário fixo. */
  hint?: string
}

export const LEAD_IMPORT_FIELDS: LeadImportField[] = [
  { key: 'contactName', label: 'Nome', required: true },
  { key: 'companyName', label: 'Empresa' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'E-mail' },
  { key: 'cityRegion', label: 'Cidade' },
  { key: 'service', label: 'Serviço de interesse', hint: 'Tráfego Pago, Social Mídia ou Ambos' },
  {
    key: 'source',
    label: 'Origem',
    hint: 'Instagram orgânico, Instagram anúncio, Google anúncio, Indicação, WhatsApp direto, Site ou Outro',
  },
  { key: 'estimatedValue', label: 'Valor estimado', hint: 'Número em R$ (ex.: 1.500,00 ou 1500)' },
  { key: 'notes', label: 'Observações' },
]

/** De-para escolhido pelo usuário: campo da plataforma -> índice da coluna no
 *  CSV. Campo ausente do objeto = "Ignorar este campo". */
export type ColumnMapping = Partial<Record<LeadFieldKey, number>>

// ---------------------------------------------------------------------------
// Leitura do arquivo
// ---------------------------------------------------------------------------

export interface LeadCsvFile {
  headers: string[]
  /** Linhas de dados (sem o cabeçalho), já sem linhas totalmente vazias. */
  rows: string[][]
}

export function readLeadCsv(text: string): LeadCsvFile {
  const all = parseCsv(text)
  const headers = (all[0] ?? []).map((h) => h.trim())
  const rows = all.slice(1).filter((cols) => !cols.every((c) => c.trim() === ''))
  return { headers, rows }
}

// ---------------------------------------------------------------------------
// Normalização + vocabulários
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Mapeamento automático (chute inicial a partir do cabeçalho)
// ---------------------------------------------------------------------------

const HEADER_HINTS: Record<LeadFieldKey, string[]> = {
  contactName: ['nome', 'name', 'contato', 'responsavel', 'lead', 'cliente'],
  companyName: ['empresa', 'company', 'negocio', 'razao', 'estabelecimento'],
  whatsapp: ['whatsapp', 'whats', 'telefone', 'phone', 'celular', 'fone', 'tel'],
  email: ['email', 'e-mail', 'mail'],
  cityRegion: ['cidade', 'city', 'regiao', 'municipio', 'localidade', 'uf', 'estado'],
  service: ['servico', 'service', 'interesse', 'produto'],
  source: ['origem', 'source', 'fonte', 'canal', 'utm', 'como conheceu'],
  estimatedValue: ['valor', 'value', 'ticket', 'orcamento', 'investimento', 'budget', 'preco'],
  notes: ['observ', 'obs', 'nota', 'note', 'comentario', 'descricao', 'detalhe'],
}

export function guessColumnMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map(normalize)
  const used = new Set<number>()
  const mapping: ColumnMapping = {}

  for (const field of LEAD_IMPORT_FIELDS) {
    const hints = HEADER_HINTS[field.key]
    const exact = normalized.findIndex((h, i) => !used.has(i) && hints.some((hint) => h === hint))
    const partial =
      exact === -1 ? normalized.findIndex((h, i) => !used.has(i) && hints.some((hint) => h.includes(hint))) : exact
    if (partial !== -1) {
      mapping[field.key] = partial
      used.add(partial)
    }
  }

  return mapping
}

// ---------------------------------------------------------------------------
// Aplicação do mapeamento + validação
// ---------------------------------------------------------------------------

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

function cell(cols: string[], mapping: ColumnMapping, key: LeadFieldKey): string {
  const idx = mapping[key]
  return idx == null ? '' : (cols[idx] ?? '').trim()
}

/** Converte uma linha do CSV num lead, aplicando o de-para. Devolve `lead` OU
 *  `error` (nunca os dois). */
export function mapRowToLead(cols: string[], mapping: ColumnMapping, line: number): {
  lead: ParsedLeadRow | null
  error: LeadImportRowError | null
} {
  const issues: string[] = []

  const contactName = cell(cols, mapping, 'contactName')
  if (!contactName) issues.push('campo "Nome" vazio (obrigatório)')

  let service = { paidTraffic: false, socialMedia: false }
  const serviceRaw = cell(cols, mapping, 'service')
  if (serviceRaw) {
    const match = SERVICE_MAP[normalize(serviceRaw)]
    if (!match) issues.push(`serviço "${serviceRaw}" inválido — use Tráfego Pago, Social Mídia ou Ambos`)
    else service = match
  }

  let source: LeadSource = 'other'
  const sourceRaw = cell(cols, mapping, 'source')
  if (sourceRaw) {
    const match = SOURCE_MAP[normalize(sourceRaw)]
    if (!match) issues.push(`origem "${sourceRaw}" inválida`)
    else source = match
  }

  const valueRaw = cell(cols, mapping, 'estimatedValue')
  const money = parseMoney(valueRaw)
  if (money === null) issues.push(`valor estimado "${valueRaw}" não é um número válido`)

  if (issues.length > 0) {
    return { lead: null, error: { line, message: issues.join('; ') } }
  }

  const services: LeadServiceInterest = {
    paidTraffic: service.paidTraffic || undefined,
    socialMedia: service.socialMedia || undefined,
    socialMediaPackage: service.socialMedia ? 'monthly' : undefined,
  }

  return {
    lead: {
      line,
      contactName,
      companyName: cell(cols, mapping, 'companyName') || undefined,
      whatsapp: cell(cols, mapping, 'whatsapp') || undefined,
      email: cell(cols, mapping, 'email') || undefined,
      cityRegion: cell(cols, mapping, 'cityRegion') || undefined,
      services,
      source,
      estimatedValue: money ?? undefined,
      notes: cell(cols, mapping, 'notes') || undefined,
    },
    error: null,
  }
}

/** Aplica o mapeamento a todas as linhas do arquivo. Linha 1 = cabeçalho, a
 *  primeira linha de dados é a linha 2. */
export function mapRowsToLeads(rows: string[][], mapping: ColumnMapping): ParseLeadImportResult {
  const valid: ParsedLeadRow[] = []
  const errors: LeadImportRowError[] = []

  rows.forEach((cols, idx) => {
    const { lead, error } = mapRowToLead(cols, mapping, idx + 2)
    if (lead) valid.push(lead)
    if (error) errors.push(error)
  })

  return { valid, errors }
}
