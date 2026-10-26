// Transcrição via Groq (Whisper large-v3-turbo) — api/ai?acao=transcrever
// (ver vercel.json). Mesmo arquivo da Vercel Function do Archer/Copiloto —
// nenhuma rota nova (limite de Functions do plano Hobby).
//
// Troca o Whisper local (transformers.js, removido — ver git log) por uma
// API: resolve o atraso acumulado (um único worker no navegador processando
// Bruno e Cliente em fila) e as alucinações/cortes do bloco fixo de 7s. O
// corte por fala (VAD) e o ritmo de envio ficam no navegador — ver
// hooks/useCopiloto.ts e utils/groqRateLimiter.ts; este arquivo só chama a
// API e repassa erro/retry-after pro chamador decidir.

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const GROQ_MODEL = 'whisper-large-v3-turbo'

// Vocabulário do nicho — ajuda o Whisper a acertar termos que confunde
// (ex: "país-obro" em vez de "pós-obra", "faxinho" em vez de "faxina").
const NICHE_PROMPT =
  'Arrow Shot, pós-obra, faxina, limpeza residencial, limpeza comercial, Airbnb, diarista, tráfego pago, Meta Ads, Google Ads, WhatsApp, orçamento, visita técnica.'

export class GroqRateLimitError extends Error {
  constructor(message, retryAfterSec) {
    super(message)
    this.retryAfterSec = retryAfterSec
  }
}

/** `audioBuffer`: Buffer/Uint8Array com o áudio (WAV, 16kHz mono — ver
 *  utils.encodeWAV do @ricky0123/vad-web no frontend). Lança
 *  GroqRateLimitError em 429 (com o retry-after, se vier) pro chamador
 *  decidir o que fazer — a pausa/reenvio é controlada no navegador. */
export async function transcribeWithGroq(audioBuffer, mimeType = 'audio/wav', fileName = 'audio.wav') {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY não configurada no servidor')
  }

  const form = new FormData()
  form.append('file', new Blob([audioBuffer], { type: mimeType }), fileName)
  form.append('model', GROQ_MODEL)
  form.append('language', 'pt')
  form.append('prompt', NICHE_PROMPT)
  form.append('response_format', 'json')
  form.append('temperature', '0')

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(25_000),
  })

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after'))
    const body = await res.json().catch(() => ({}))
    throw new GroqRateLimitError(body?.error?.message || 'Limite de requisições do Groq atingido', Number.isFinite(retryAfter) ? retryAfter : 5)
  }

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body?.error?.message || `Groq Whisper: erro ${res.status}`)
  }

  return (body.text || '').trim()
}
