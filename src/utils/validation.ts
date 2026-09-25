import { isPhoneComplete } from './masks'

/** E-mail com cara de e-mail: algo@dominio.ext (sem espaços). */
export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim())
}

/** WhatsApp/telefone brasileiro com DDD: 10 ou 11 dígitos (aceita +55 na frente). */
export function isValidPhoneBR(raw: string): boolean {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return true
  return isPhoneComplete(raw)
}

export type ContactKind = 'phone' | 'email'

/** Mensagem de erro de um contato preenchido (null = está ok ou vazio). */
export function contactError(kind: ContactKind, raw: string | undefined | null): string | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  if (kind === 'email') return isValidEmail(v) ? null : 'Digite um e-mail válido (ex: nome@empresa.com)'
  return isValidPhoneBR(v) ? null : 'Digite um WhatsApp válido com DDD (ex: (11) 99999-9999)'
}

function allSame(d: string) {
  return /^(\d)\1+$/.test(d)
}

/** CPF com os dígitos verificadores certos. */
export function isValidCPF(raw: string): boolean {
  const d = raw.replace(/\D/g, '')
  if (d.length !== 11 || allSame(d)) return false
  const check = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return check(9) === Number(d[9]) && check(10) === Number(d[10])
}

/** CNPJ com os dígitos verificadores certos. */
export function isValidCNPJ(raw: string): boolean {
  const d = raw.replace(/\D/g, '')
  if (d.length !== 14 || allSame(d)) return false
  const check = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0)
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return check(12) === Number(d[12]) && check(13) === Number(d[13])
}

/** Erro de um CPF/CNPJ preenchido (null = está ok ou vazio). */
export function documentError(raw: string | undefined | null): string | null {
  const d = (raw ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.length === 11) return isValidCPF(d) ? null : 'Esse CPF não é válido — confira os números'
  if (d.length === 14) return isValidCNPJ(d) ? null : 'Esse CNPJ não é válido — confira os números'
  return 'Digite o CNPJ (14 números) ou o CPF (11 números)'
}

/** Erro de um link preenchido (null = está ok ou vazio). Aceita sem o
 *  "https://" (ex: instagram.com/empresa). */
export function linkError(raw: string | undefined | null): string | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`
  try {
    const u = new URL(url)
    if (/\s/.test(v) || !u.hostname.includes('.') || u.hostname.endsWith('.')) throw new Error('bad')
    return null
  } catch {
    return 'Digite um link válido (ex: instagram.com/suaempresa)'
  }
}

/** Link com "https://" na frente quando o lead não colocou. */
export function normalizeLinkAnswer(raw: string): string {
  const v = raw.trim()
  return !v || /^https?:\/\//i.test(v) ? v : `https://${v}`
}
