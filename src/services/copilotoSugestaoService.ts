import { auth } from '../firebase/config'

export interface SugestaoPayload {
  leadId: string
  pergunta?: string
  transcricaoRecente: string
  resumoAnterior?: string
}

/** Chama /api/ai/sugestao (acao=sugestao, ver api/_lib/copilotoSugestao.js)
 *  e devolve o texto conforme chega — primeiro endpoint em streaming deste
 *  projeto. `onChunk` recebe o texto acumulado até agora (mais simples pra
 *  quem só quer mostrar "o que já chegou"). Lança se a requisição falhar
 *  (rede, 403, 500); um `[[ERRO]]` no meio do stream (falha já em
 *  streaming) também lança, mas com o texto parcial já recebido. */
export async function streamSugestao(
  payload: SugestaoPayload,
  onChunk: (textoAteAgora: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Usuário não autenticado')
  const idToken = await user.getIdToken()

  const res = await fetch('/api/ai/sugestao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(payload),
    signal,
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

  if (full.includes('[[ERRO]]')) {
    throw new Error('O assistente falhou ao gerar a sugestão.')
  }
  return full
}
