/** Frases clássicas de alucinação do Whisper em trecho sem fala real (ruído,
 *  silêncio, música de fundo) — descartadas quando o trecho de áudio é curto
 *  (fala real curta tende a ser só uma palavra, não uma frase feita). */
const HALLUCINATION_PHRASES = [
  /^obrigad[oa]\.?$/i,
  /^e até a próxima!?$/i,
  /^legendas pela comunidade/i,
  /^inscreva-se/i,
  /^valeu,?\s*(galera|pessoal)?!?$/i,
  /^tchau,?\s*(gente|pessoal)?!?$/i,
]

/** Texto só entre colchetes — "[Música]", "[Som de futebol]", "[Som de botão]" etc. */
const BRACKETS_ONLY_RE = /^\s*(\[[^\]]*\]\s*)+$/

/** Curto o bastante pra uma frase-padrão de alucinação ser suspeita, não
 *  uma resposta real breve ("tá bom", "sim"). */
const SHORT_SEGMENT_SEC = 2.5

export function isHallucination(text: string, durationSec: number): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true
  if (BRACKETS_ONLY_RE.test(trimmed)) return true
  if (durationSec <= SHORT_SEGMENT_SEC && HALLUCINATION_PHRASES.some((re) => re.test(trimmed))) return true
  return false
}
