import { auth } from '../firebase/config'
import type { AiChatMessage, AiPageContext } from '../types/ai'

export class AiUsageLimitError extends Error {}

/** Manda uma mensagem pro assistente de IA (/api/ai/chat) — o backend
 *  verifica login+limite diário e chama a API da Anthropic, nunca expondo a
 *  chave no frontend (ver api/ai/chat.js). `history` são as mensagens
 *  anteriores da mesma conversa (só em memória, ver AiAssistantWidget). */
export async function sendAiChatMessage(
  message: string,
  context: AiPageContext,
  history: AiChatMessage[]
): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Usuário não autenticado')
  const idToken = await user.getIdToken()

  let res: Response
  try {
    res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
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

  if (res.status === 429) throw new AiUsageLimitError(body.error || 'Limite diário de mensagens atingido.')
  if (!res.ok) throw new Error(body.error || 'Falha ao falar com o assistente')

  return body.response as string
}
