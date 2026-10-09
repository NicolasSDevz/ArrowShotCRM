// Pix "copia e cola" (BR Code estático do Banco Central) gerado aqui mesmo,
// sem gateway nem taxa — o dinheiro cai direto na conta da chave (ex.: Nubank).
// Como o banco não avisa o sistema, o pedido fica aguardando a equipe clicar em
// "Confirmar pagamento" no CRM (aba Loja > Vendas).
//
// Formato: EMV/TLV (id de 2 dígitos + tamanho de 2 dígitos + valor), com
// CRC16-CCITT no fim. Manual do BR Code: bcb.gov.br (Pix > Regulamentação).

function tlv(id, value) {
  const v = String(value)
  return `${id}${String(v.length).padStart(2, '0')}${v}`
}

function crc16(payload) {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Tira acento e caractere especial (nome e cidade no BR Code são ASCII). */
function ascii(text, max) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .-]/g, '')
    .trim()
    .slice(0, max)
}

/** Deixa a chave no formato que o Pix espera, conforme o tipo. */
export function normalizePixKey(key, type) {
  const raw = String(key || '').trim()
  const digits = raw.replace(/\D/g, '')
  switch (type) {
    case 'cpf':
    case 'cnpj':
      return digits
    case 'phone':
      return digits.startsWith('55') && digits.length >= 12 ? `+${digits}` : `+55${digits}`
    case 'email':
      return raw.toLowerCase()
    default:
      return raw // chave aleatória (EVP)
  }
}

/** Monta o Pix copia e cola com valor e identificador do pedido. */
export function buildPixCode({ key, keyType, name, city, amountCents, txid }) {
  const account = tlv('00', 'br.gov.bcb.pix') + tlv('01', normalizePixKey(key, keyType))
  const payload =
    tlv('00', '01') +
    tlv('26', account) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', (amountCents / 100).toFixed(2)) +
    tlv('58', 'BR') +
    tlv('59', ascii(name, 25) || 'RECEBEDOR') +
    tlv('60', ascii(city, 15) || 'BRASIL') +
    tlv('62', tlv('05', String(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***')) +
    '6304'
  return payload + crc16(payload)
}
