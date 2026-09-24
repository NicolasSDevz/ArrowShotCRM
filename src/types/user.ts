import type { Timestamp } from 'firebase/firestore'
import type { UserRole } from './common'

/** Mirrors Firebase Auth uid as document id in `users`. */
export interface AppUser {
  id: string
  name: string
  email: string
  photoURL?: string
  role: UserRole
  /** Client users are scoped to a single client account. */
  clientId?: string
  active: boolean
  /** Último sinal de "estou com o CRM aberto" (heartbeat, ver usePresenceHeartbeat) — base do "online agora" na Equipe. */
  lastSeenAt?: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Gerente',
  employee: 'Colaborador(a)',
  client: 'Cliente',
}
