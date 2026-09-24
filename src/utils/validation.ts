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
