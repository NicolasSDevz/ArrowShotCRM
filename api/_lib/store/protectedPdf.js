// PDF protegido da área de membros: o link original fica cifrado na aula (o aluno
// nunca vê) e, a cada download, o servidor baixa o arquivo e carimba nome, CPF e
// e-mail do aluno em todas as páginas. Se o PDF vazar, dá pra saber de quem veio.

import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'

/** Limite da resposta de função na Vercel (~4,5 MB). */
export const MAX_PDF_BYTES = 4_200_000

const DRIVE_ID_RE = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]{10,})/
const DOCS_RE = /docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([\w-]{10,})/
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/** Links de compartilhamento viram link de download direto (Drive, Docs e Dropbox). */
export function directDownloadUrl(raw) {
  const url = String(raw || '').trim()
  const docs = url.match(DOCS_RE)
  if (docs) return `https://docs.google.com/${docs[1]}/d/${docs[2]}/export?format=pdf`
  const drive = url.match(DRIVE_ID_RE)
  // drive.usercontent + confirm=t pula a tela "não foi possível verificar vírus" do Google.
  if (drive) return `https://drive.usercontent.google.com/download?id=${drive[1]}&export=download&confirm=t`
  if (/dropbox\.com\//.test(url)) {
    const fixed = url.replace(/([?&])dl=0/, '$1dl=1')
    return /[?&]dl=1/.test(fixed) ? fixed : `${fixed}${fixed.includes('?') ? '&' : '?'}dl=1`
  }
  return url
}

const isPdf = (buf) => buf.subarray(0, 1024).toString('latin1').includes('%PDF-')

async function get(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25_000) })
  return { res, buf: Buffer.from(await res.arrayBuffer()) }
}

/** Página de confirmação do Drive (arquivo grande): reenvia o formulário com os campos escondidos. */
function driveConfirmUrl(html) {
  const form = html.match(/<form[^>]+action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/i)
  if (!form) return null
  const params = new URLSearchParams()
  for (const m of form[2].matchAll(/<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"/gi)) params.set(m[1], m[2])
  if (!params.get('id')) return null
  return `${form[1].replace(/&amp;/g, '&')}?${params}`
}

export async function fetchPdf(rawUrl) {
  let { res, buf } = await get(directDownloadUrl(rawUrl))
  if (res.ok && !isPdf(buf)) {
    const next = driveConfirmUrl(buf.toString('utf8'))
    if (next) ({ res, buf } = await get(next))
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(/google/.test(res.url) ? 'O Google não deixou baixar o arquivo. No Drive, Compartilhar > Acesso geral: "Qualquer pessoa com o link" (Leitor).' : `O site do arquivo recusou o download (HTTP ${res.status}).`)
    }
    if (res.status === 404) throw new Error('Arquivo não encontrado no link. Confira se ele não foi apagado ou movido.')
    throw new Error(`Não consegui baixar o arquivo original (HTTP ${res.status})`)
  }
  if (!isPdf(buf)) {
    const html = buf.toString('utf8')
    const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || '').trim()
    console.warn('[pdf] link não entregou PDF:', res.url, title)
    if (/accounts\.google\.com|ServiceLogin|Fazer login|Sign in/i.test(html)) throw new Error('O arquivo do Drive está restrito. Compartilhar > Acesso geral: "Qualquer pessoa com o link" (Leitor).')
    if (/quota|cota/i.test(html)) throw new Error('O Google bloqueou downloads desse arquivo por excesso de acessos hoje. Faça uma cópia no Drive e troque o link.')
    throw new Error(`O link do anexo não entrega um PDF${title ? ` (o Google respondeu: "${title.slice(0, 80)}")` : ''}. Confira se o arquivo é PDF mesmo e está como "Qualquer pessoa com o link".`)
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
