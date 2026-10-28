/** Chave do telefone pra casar números do Brasil: DDD + últimos 8 dígitos.
 *  "(11) 98765-4321", "5511987654321" e "551187654321" (sem o 9, como o
 *  WhatsApp às vezes manda) dão a mesma chave. Igual a phoneKey() em
 *  api/_lib/whatsapp.js: o servidor busca o lead por esse campo. */
export function waPhoneKey(phone: string | null | undefined): string | null {
  let d = (phone || '').replace(/\D/g, '')
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)
  d = d.replace(/^0+/, '')
  if (d.length < 10) return null
  return d.slice(0, 2) + d.slice(-8)
}
