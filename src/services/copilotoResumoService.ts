import { auth } from '../firebase/config'
import type { BlocoTranscricao, ResumoChamada, Sugestao } from '../types/chamada'

/** Pede o resumo estruturado pós-chamada (/api/ai/resumo, acao=resumo —
 *  ver api/_lib/copilotoResumo.js). Chamado automaticamente ao encerrar a
 *  chamada (CopilotoPage) e por "Gerar resumo agora" quando a chamada
 *  terminou sem resumo (LeadChamadasTab). Não streama — é uma resposta só,
 *  alguns segundos de espera, e com os 7 campos garantidos via tool use. */
export async function gerarResumoChamada(
  leadId: string,
  blocos: BlocoTranscricao[],
  sugestoes: Sugestao[]
): Promise<Omit<ResumoChamada, 'geradoEm'>> {
  const user = auth.currentUser
  if (!user) throw new Error('Usuário não autenticado')
  const idToken = await user.getIdToken()

  const res = await fetch('/api/ai/resumo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ leadId, blocos, sugestoes }),
    signal: AbortSignal.timeout(60_000),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Falha ao gerar o resumo (${res.status})`)

  return body.resumo as Omit<ResumoChamada, 'geradoEm'>
}
