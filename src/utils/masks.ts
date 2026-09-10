/** Progressive (00) 00000-0000 / (00) 0000-0000 mask — switches to the
 *  5-digit mobile block once an 11th digit is typed. */
export function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length === 0) return ''
  if (digits.length <= 2) return `(${digits}`

  const ddd = digits.slice(0, 2)
  const rest = digits.slice(2)
  if (rest.length <= 4) return `(${ddd}) ${rest}`

  const splitAt = digits.length <= 10 ? 4 : 5
  const part1 = rest.slice(0, splitAt)
  const part2 = rest.slice(splitAt)
  return `(${ddd}) ${part1}-${part2}`
}

/** Número pronto para `https://wa.me/<n>` — só dígitos, com DDI 55 na frente
 *  quando o número tem 10-11 dígitos (formato BR sem código do país).
 *  Retorna undefined se não sobrar dígito nenhum. */
export function toWhatsappDigits(raw?: string | null): string | undefined {
  let d = (raw ?? '').replace(/\D/g, '')
  if (!d) return undefined
  if (d.length === 10 || d.length === 11) d = `55${d}`
  return d
}

/** A phone is only "complete" at exactly 10 (fixed) or 11 (mobile) digits. */
export function isPhoneComplete(raw: string): boolean {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 10 || digits.length === 11
}

/** Progressive CPF (000.000.000-00) / CNPJ (00.000.000/0000-00) mask —
 *  detects which one applies purely from how many digits have been typed
 *  (>11 digits means it can only be a CNPJ). */
export function maskDocument(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 14)
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

/** Money input: digits typed are treated as cents, right-aligned, and shown
 *  as "R$ 0.000,00" — the classic "type the amount like a calculator" pattern. */
export function maskCurrencyInput(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const value = Number(digits) / 100
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Inverse of maskCurrencyInput — recovers the plain numeric amount for storage. */
export function parseCurrencyToNumber(masked: string): number | undefined {
  const digits = masked.replace(/\D/g, '')
  if (!digits) return undefined
  return Number(digits) / 100
}
