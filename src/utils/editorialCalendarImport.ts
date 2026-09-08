import type { ContentPillar, ContentType } from '../types/content'
import { parseCsv, downloadCsv } from './csv'

/** Aba "Conteúdos" da ficha do cliente — importação em massa do calendário
 *  editorial via CSV. Colunas fixas, nessa ordem (ver modelo de download). */
export const EDITORIAL_CALENDAR_CSV_HEADERS = [
  'data',
  'titulo',
  'formato',
  'pilar',
  'responsavel',
  'legenda',
  'observacoes',
] as const

const EDITORIAL_CALENDAR_TEMPLATE_ROWS: string[][] = [
  [...EDITORIAL_CALENDAR_CSV_HEADERS],
  [
    '2026-10-06',
    'Antes e depois de limpeza pós-obra',
    'Post',
    'Prova Social',
    'Nicolas',
    'Transformação incrível nessa obra em [cidade]! 🏗️ Limpeza técnica completa do início ao fim.',
    '',
  ],
  [
    '2026-10-07',
    'Processo de limpeza técnica em ação',
    'Reel',
    'Autoridade',
    'Nicolas',
    'Cada detalhe importa. Veja como nossa equipe trabalha para garantir resultado impecável.',
    '',
  ],
  [
    '2026-10-08',
    'Você sabia que a limpeza pós-obra errada pode danificar o piso?',
    'Post',
    'Educativo',
    'Ciane',
    'Produtos inadequados + técnica errada = retrabalho caro. Saiba como evitar.',
    'Usar imagem de piso danificado como referência',
  ],
]

export function downloadEditorialCalendarTemplate() {
  downloadCsv('modelo_calendario_editorial.csv', EDITORIAL_CALENDAR_TEMPLATE_ROWS)
}

export interface EditorialCalendarRow {
  /** 1-based line number as seen in a spreadsheet app (header = line 1). */
  line: number
  title: string
  type: ContentType
  pillar: ContentPillar
  scheduledDate: Date
  /** Raw "responsavel" text — resolved against real users by the caller
   *  (this module has no access to the users list). */
  responsavelRaw: string
  caption?: string
  notes?: string
}

export interface EditorialCalendarRowError {
  line: number
  message: string
}

export interface ParseEditorialCalendarResult {
  valid: EditorialCalendarRow[]
  errors: EditorialCalendarRowError[]
}

const FORMAT_MAP: Record<string, ContentType> = {
  post: 'post',
  reel: 'reels',
  reels: 'reels',
  story: 'story',
  stories: 'story',
}

/** Aceita qualquer pilar da lista, pelo rótulo, pelo slug ou por variações
 *  comuns. Chaves já normalizadas: minúsculas, sem acento, "/" sem espaços
 *  em volta (ver `normalize` + `parsePillar`). */
const PILLAR_MAP: Record<string, ContentPillar> = {
  'dor/solucao': 'dor_solucao',
  'dor solucao': 'dor_solucao',
  dor_solucao: 'dor_solucao',
  autoridade: 'autoridade',
  'prova social': 'prova_social',
  prova_social: 'prova_social',
  bastidores: 'bastidores',
  educativo: 'educativo',
  engajamento: 'engajamento',
  institucional: 'institucional',
  'antes e depois': 'antes_depois',
  'antes/depois': 'antes_depois',
  antes_depois: 'antes_depois',
  diferenciais: 'diferenciais',
  comercial: 'comercial',
  cta: 'cta',
  'call to action': 'cta',
}

// Explicit table instead of a Unicode combining-marks regex range — keeps
// this file plain ASCII and avoids any editor/encoding mangling the range.
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
}

function parseFormat(raw: string): ContentType | undefined {
  return FORMAT_MAP[normalize(raw)]
}

function parsePillar(raw: string): ContentPillar | undefined {
  const key = normalize(raw).replace(/\s*\/\s*/g, '/')
  return PILLAR_MAP[key]
}

function isValidIsoDate(raw: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12) return false
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function parseIsoDate(raw: string): Date {
  const [y, m, d] = raw.trim().split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Parses + validates a "calendário editorial" CSV. Columns are read
 *  positionally (data, titulo, formato, pilar, responsavel, legenda,
 *  observacoes) — the first row is always treated as the header and
 *  skipped. Rows failing any of the 4 required checks (data/formato/
 *  pilar/titulo) go to `errors` instead of `valid`; `responsavel` is
 *  resolved best-effort by the caller and never fails validation on its
 *  own (an unmatched name just leaves the card unassigned). */
export function parseEditorialCalendarCsv(text: string): ParseEditorialCalendarResult {
  const rows = parseCsv(text)
  const dataRows = rows.slice(1)

  const valid: EditorialCalendarRow[] = []
  const errors: EditorialCalendarRowError[] = []

  dataRows.forEach((cols, idx) => {
    const line = idx + 2 // 1 = header
    if (cols.every((c) => c.trim() === '')) return // skip blank lines

    const [dataRaw = '', tituloRaw = '', formatoRaw = '', pilarRaw = '', responsavelRaw = '', legendaRaw = '', obsRaw = ''] = cols

    const issues: string[] = []

    if (!isValidIsoDate(dataRaw)) issues.push(`data inválida ("${dataRaw}") — use AAAA-MM-DD`)

    const title = tituloRaw.trim()
    if (!title) issues.push('título vazio')

    const type = parseFormat(formatoRaw)
    if (!type) issues.push(`formato inválido ("${formatoRaw}") — use Post, Reel ou Stories`)

    const pillar = parsePillar(pilarRaw)
    if (!pillar) issues.push(`pilar inválido ("${pilarRaw}")`)

    if (issues.length > 0) {
      errors.push({ line, message: issues.join('; ') })
      return
    }

    valid.push({
      line,
      title,
      type: type!,
      pillar: pillar!,
      scheduledDate: parseIsoDate(dataRaw),
      responsavelRaw: responsavelRaw.trim(),
      caption: legendaRaw.trim() || undefined,
      notes: obsRaw.trim() || undefined,
    })
  })

  return { valid, errors }
}
