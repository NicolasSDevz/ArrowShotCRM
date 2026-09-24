import { formatDistanceToNowStrict } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Timestamp } from 'firebase/firestore'

/** Intervalo entre "estou aqui" enviados por cada aba aberta. */
export const PRESENCE_HEARTBEAT_MS = 60_000
/** Quem mandou sinal dentro dessa janela conta como online — um pouco mais
 *  que 1 heartbeat, pra tolerar um atraso de rede sem piscar "offline". */
export const PRESENCE_ONLINE_WINDOW_MS = 2 * 60_000

export interface Presence {
  online: boolean
  /** "Online agora", "Visto há 5 minutos" ou "Nunca acessou". */
  label: string
}

export function getPresence(lastSeenAt: Timestamp | null | undefined, now: number): Presence {
  const seen = lastSeenAt?.toMillis?.()
  if (!seen) return { online: false, label: 'Ainda não acessou' }
  if (now - seen <= PRESENCE_ONLINE_WINDOW_MS) return { online: true, label: 'Online agora' }
  return { online: false, label: `Visto há ${formatDistanceToNowStrict(seen, { locale: ptBR })}` }
}
