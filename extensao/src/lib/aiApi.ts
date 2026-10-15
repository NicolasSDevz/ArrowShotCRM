import { auth } from '../../../src/firebase/config'
import { transcribeAudio } from '../../../src/services/groqTranscriptionService'
import type { BlocoTranscricao, ResumoChamada, Sugestao } from '../../../src/types/chamada'

/** A extensão roda em chrome-extension://..., não no domínio do CRM — toda
 *  chamada pro /api/ai/[acao] precisa de URL absoluta (ver api/ai/index.js,
 *  que já aceita a origem da extensão via CORS). */
export const CRM_BASE_URL = 'https://arrowshotcrm.vercel.app'

async function idToken(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Usuário não autenticado')
  return user.getIdToken()
}

/** Mesma função de utils/groqRateLimiter.ts (web), só que apontada pra URL
 *  absoluta do CRM — passada pro GroqTranscriptionQueue no offscreen.ts. */
export function transcreverAudioExt(audio: Float32Array): Promise<string> {
  return transcribeAudio(audio, CRM_BASE_URL)
}

export async function streamSugestaoExt(
  payload: { leadId: string; pergunta?: string; transcricaoRecente: string; resumoAnterior?: string },
  onChunk: (textoAteAgora: string) => void
): Promise<string> {
  const token = await idToken()
  const res = await fetch(`${CRM_BASE_URL}/api/ai/sugestao`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Falha ao gerar sugestão (${res.status})`)
  }
  if (!res.body) throw new Error('Resposta sem corpo (streaming não suportado)')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    full += decoder.decode(value, { stream: true })
    onChunk(full)
  }
  if (full.includes('[[ERRO]]')) throw new Error('O assistente falhou ao gerar a sugestão.')
  return full
}

export async function gerarResumoChamadaExt(
  leadId: string,
  blocos: BlocoTranscricao[],
  sugestoes: Sugestao[]
): Promise<Omit<ResumoChamada, 'geradoEm'>> {
  const token = await idToken()
  const res = await fetch(`${CRM_BASE_URL}/api/ai/resumo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ leadId, blocos, sugestoes }),
    signal: AbortSignal.timeout(60_000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Falha ao gerar o resumo (${res.status})`)
  return body.resumo as Omit<ResumoChamada, 'geradoEm'>
}
