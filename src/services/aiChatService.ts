import { auth } from '../firebase/config'
import type { AiChatMessage, AiPageContext } from '../types/ai'

/** Mensagens do Archer usadas hoje pelo usuário logado. */
export interface AiQuota {
  used: number
  limit: number
}

export class AiUsageLimitError extends Error {
  quota?: AiQuota
  constructor(message: string, quota?: AiQuota) {
    super(message)
    this.quota = quota
  }
}

async function authHeader() {
  const user = auth.currentUser
  if (!user) throw new Error('Usuário não autenticado')
  return { Authorization: `Bearer ${await user.getIdToken()}` }
}

/** Uso de hoje (pra mostrar "X de 50" ao abrir o painel). null = não deu pra ler. */
export async function getAiQuota(): Promise<AiQuota | null> {
  try {
    const res = await fetch('/api/ai/chat', { headers: await authHeader() })
    if (!res.ok) return null
    const body = await res.json()
    return body.quota ?? null
  } catch {
    return null
  }
}

/** Manda uma mensagem pro assistente de IA (/api/ai/chat) — o backend
 *  verifica login+limite diário e chama a API da Anthropic, nunca expondo a
 *  chave no frontend (ver api/ai/chat.js). `history` são as mensagens
 *  anteriores da mesma conversa (só em memória, ver AiAssistantWidget). */
export async function sendAiChatMessage(
  message: string,
  context: AiPageContext,
  history: AiChatMessage[]
): Promise<{ text: string; quota: AiQuota | null }> {
  let res: Response
  try {
    res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ message, context, history }),
      // Sem timeout, uma resposta lenta (Anthropic, Firestore) deixa o
      // Archer "digitando" pra sempre sem erro nenhum aparecer — 50s cobre
      // folgado o tempo normal de resposta.
      signal: AbortSignal.timeout(50_000),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error('O assistente demorou demais pra responder. Tenta de novo.')
    }
    throw err
  }
  const body = await res.json().catch(() => ({}))

  if (res.status === 429) throw new AiUsageLimitError(body.error || 'Limite diário de mensagens atingido.', body.quota)
  if (!res.ok) throw new Error(body.error || 'Falha ao falar com o assistente')

  return { text: body.response as string, quota: body.quota ?? null }
}
