import { utils } from '@ricky0123/vad-web'
import { auth } from '../firebase/config'

export class GroqRateLimitClientError extends Error {
  retryAfterSec: number
  constructor(message: string, retryAfterSec: number) {
    super(message)
    this.retryAfterSec = retryAfterSec
  }
}

/** Transcreve um trecho de áudio (Float32Array, 16kHz mono — o que o VAD
 *  devolve em onSpeechEnd) via /api/ai/transcrever (acao=transcrever, ver
 *  api/_lib/groqWhisper.js). Lança GroqRateLimitClientError em 429 — quem
 *  chama (utils/groqRateLimiter.ts) decide esperar e reenviar. */
export async function transcribeAudio(audio: Float32Array): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Usuário não autenticado')
  const idToken = await user.getIdToken()

  const wavBuffer = utils.encodeWAV(audio, 1, 16000, 1, 16)
  const audioBase64 = utils.arrayBufferToBase64(wavBuffer)

  const res = await fetch('/api/ai/transcrever', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ audioBase64, mimeType: 'audio/wav' }),
  })

  const body = await res.json().catch(() => ({}))

  if (res.status === 429) {
    throw new GroqRateLimitClientError(body.error || 'Limite de requisições atingido', Number(body.retryAfterSec) || 5)
  }
  if (!res.ok) throw new Error(body.error || `Falha ao transcrever (${res.status})`)

  return (body.text as string) || ''
}
