import { formatDistanceToNowStrict } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Timestamp } from 'firebase/firestore'

/** Intervalo entre "estou aqui" enviados pela aba ativa. */
export const PRESENCE_HEARTBEAT_MS = 30_000
/** Sem sinal há mais que isso = offline (aba fechada à força, internet caiu…).
 *  Um pouco mais que 2 heartbeats pra não piscar por atraso de rede. */
export const PRESENCE_ONLINE_WINDOW_MS = 75_000
/** Aba aberta mas sem mexer no mouse/teclado há esse tempo = ausente. */
export const PRESENCE_IDLE_MS = 5 * 60_000

export type PresenceState = 'online' | 'away'

export interface Presence {
  online: boolean
  /** "Online agora", "Visto há 5 minutos" ou "Ainda não acessou". */
  label: string
}

/** Online = a última aba avisou "online" (não "saí") e o aviso é recente. */
export function getPresence(
  user: { lastSeenAt?: Timestamp | null; presenceState?: PresenceState | null },
  now: number
): Presence {
  const seen = user.lastSeenAt?.toMillis?.()
  if (!seen) return { online: false, label: 'Ainda não acessou' }
  if (user.presenceState !== 'away' && now - seen <= PRESENCE_ONLINE_WINDOW_MS) return { online: true, label: 'Online agora' }
  return { online: false, label: `Visto há ${formatDistanceToNowStrict(seen, { locale: ptBR })}` }
}
