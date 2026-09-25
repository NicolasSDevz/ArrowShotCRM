/** Arquivos enviados pelo lead numa pergunta do tipo "Arquivo". Ficam no
 *  Storage em `leadFormUploads/{formId}/…` (só a equipe logada consegue
 *  baixar — ver storage.rules) e a resposta guarda uma linha por arquivo,
 *  no formato "📎 nome.png [caminho]", que a ficha do lead transforma num
 *  botão de download. */

export interface LeadFormUploadedFile {
  name: string
  path: string
}

/** Tipos aceitos: imagens, PDF e os formatos de designer (AI, EPS, PSD, CDR, SVG) e ZIP. */
export const LEAD_FORM_FILE_ACCEPT = 'image/*,.pdf,.ai,.eps,.psd,.cdr,.svg,.zip'
export const LEAD_FORM_FILE_MAX_MB = 20
export const LEAD_FORM_FILE_MAX_COUNT = 5

const LINE_RE = /^📎 (.+) \[(leadFormUploads\/[^\]]+)\]$/

export function encodeFileAnswer(f: LeadFormUploadedFile): string {
  return `📎 ${f.name.replace(/[[\]\n]/g, ' ')} [${f.path}]`
}

export function decodeFileAnswer(line: string): LeadFormUploadedFile | null {
  const m = LINE_RE.exec(line.trim())
  return m ? { name: m[1], path: m[2] } : null
}

/** Todas as linhas de arquivo de uma resposta (vazio = não é resposta de arquivo). */
export function filesInAnswer(value: string): LeadFormUploadedFile[] {
  return value
    .split('\n')
    .map(decodeFileAnswer)
    .filter((f): f is LeadFormUploadedFile => !!f)
}
