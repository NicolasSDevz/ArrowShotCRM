// PDF protegido da área de membros: o link original fica cifrado na aula (o aluno
// nunca vê) e, a cada download, o servidor baixa o arquivo e carimba nome, CPF e
// e-mail do aluno em todas as páginas. Se o PDF vazar, dá pra saber de quem veio.

import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'

/** Limite da resposta de função na Vercel (~4,5 MB). */
export const MAX_PDF_BYTES = 4_200_000

/** Links de compartilhamento viram link de download direto (Drive e Dropbox). */
export function directDownloadUrl(raw) {
  const url = String(raw || '').trim()
  const drive = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]{10,})/)
  if (drive) return `https://drive.google.com/uc?export=download&id=${drive[1]}`
  if (/dropbox\.com\//.test(url)) {
    const fixed = url.replace(/([?&])dl=0/, '$1dl=1')
    return /[?&]dl=1/.test(fixed) ? fixed : `${fixed}${fixed.includes('?') ? '&' : '?'}dl=1`
  }
  return url
}

export async function fetchPdf(rawUrl) {
  const res = await fetch(directDownloadUrl(rawUrl), { redirect: 'follow', signal: AbortSignal.timeout(25_000) })
  if (!res.ok) throw new Error(`Não consegui baixar o arquivo original (HTTP ${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error('O link do anexo não entrega um PDF direto. No Google Drive, deixe o arquivo como "Qualquer pessoa com o link".')
  }
  if (buf.length > MAX_PDF_BYTES) throw new Error('PDF maior que 4 MB. Comprima o arquivo (ex.: ilovepdf.com) e troque o link.')
  return buf
}

const formatCpf = (cpf) => {
  const d = String(cpf || '').replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return ''
}

// Helvetica padrão só tem Latin-1: troca o resto por "?" pra não quebrar.
const latin1 = (text) => String(text || '').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')

/** Carimba todas as páginas: marca d'água diagonal clara + rodapé com os dados. */
export async function stampPdf(bytes, { name, cpf, email, orderId }) {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const doc = formatCpf(cpf)
  const who = latin1([name, doc && `CPF ${doc}`].filter(Boolean).join(' - '))
  const footer = latin1(`Licenciado para ${[name, doc && `CPF ${doc}`, email].filter(Boolean).join(' | ')}${orderId ? ` | Pedido ${orderId}` : ''}. Proibida a cópia ou distribuição.`)

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize()
    const size = Math.max(14, Math.min(28, width / 22))
    const textWidth = bold.widthOfTextAtSize(who, size)
    // Diagonal no meio da página.
    const angle = Math.atan2(height, width)
    const cx = width / 2 - (Math.cos(angle) * textWidth) / 2
    const cy = height / 2 - (Math.sin(angle) * textWidth) / 2
    page.drawText(who, { x: cx, y: cy, size, font: bold, color: rgb(0.55, 0.55, 0.55), opacity: 0.18, rotate: degrees((angle * 180) / Math.PI) })
    // Rodapé (encolhe se não couber).
    let fs = 7
    while (fs > 4 && font.widthOfTextAtSize(footer, fs) > width - 24) fs -= 0.5
    page.drawRectangle({ x: 0, y: 0, width, height: fs + 8, color: rgb(1, 1, 1), opacity: 0.75 })
    page.drawText(footer, { x: 12, y: 4, size: fs, font, color: rgb(0.3, 0.3, 0.3) })
  }
  pdf.setSubject(footer)
  pdf.setKeywords([latin1(email || ''), doc, orderId || ''].filter(Boolean))
  pdf.setProducer('Arrow Shot')
  return Buffer.from(await pdf.save())
}
