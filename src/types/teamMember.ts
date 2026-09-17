import type { BaseDoc } from './common'

/** Descriptive access label shown on the roster — NOT the same as the real
 *  `UserRole` that gates Firestore security rules (see types/user.ts). This
 *  is informational only; it doesn't control what anyone can actually do.
 *  For members with `userId` set, the real role is managed from their
 *  profile drawer via the existing updateUserRole flow. */
export type TeamPermission = 'admin' | 'gestor' | 'cs' | 'visualizador'

export const TEAM_PERMISSION_LABEL: Record<TeamPermission, string> = {
  admin: 'Admin',
  gestor: 'Gestor',
  cs: 'CS',
  visualizador: 'Visualizador',
}

export type TeamMemberStatus = 'active' | 'inactive'

export type RoutineKey = 'closer' | 'cs' | 'gestor_trafego'

export interface TeamMember extends BaseDoc {
  name: string
  jobTitle: string
  email?: string
  whatsapp?: string
  permission: TeamPermission
  status: TeamMemberStatus
  photoURL?: string
  /** Links to the real login account in `users`, when this person has one —
   *  Bruno and Jamilson don't yet (see README: accounts are created
   *  manually in the Firebase Console). */
  userId?: string
  routineKey?: RoutineKey
  order: number
}

export interface RoleRoutine {
  title: string
  items: string[]
}

export const ROLE_ROUTINES: Record<RoutineKey, RoleRoutine> = {
  closer: {
    title: 'Rotina do Closer',
    items: [
      'Reunião de equipe (sexta, 9h15 às 10h)',
      'Responder mensagens de anúncios e confirmar reuniões (manhã)',
      'Organizar CRM (Leads na plataforma)',
      'Responder mensagens e confirmar reuniões (tarde)',
      'Marcar reuniões de vendas',
    ],
  },
  cs: {
    title: 'Rotina do CS',
    items: [
      'Reunião de equipe (sexta, 9h15 às 10h)',
      'Verificar mensagens sem resposta nos grupos de clientes',
      'Atualizar status das tarefas na plataforma',
      'Sexta: enviar atualização semanal a todos os clientes ativos',
      'Dia 1 do mês: enviar relatório mensal a todos os clientes',
    ],
  },
  gestor_trafego: {
    title: 'Rotina do Gestor de Tráfego',
    items: [
      'Reunião de equipe (sexta, 9h15 às 10h)',
      'Verificar desempenho das campanhas ativas',
      'Atualizar tarefas na plataforma',
      'Segunda: overview completo de todos os clientes',
      'Sexta: revisar pendências e planejar semana seguinte',
    ],
  },
}

export interface TeamMeeting {
  title: string
  schedule: string
  participants: string
}

/** Fixed company schedule, not meant to be edited from the UI — same spirit
 *  as ROLE_ROUTINES above. */
export const TEAM_MEETINGS: TeamMeeting[] = [
  { title: 'Reunião de Equipe', schedule: 'Toda sexta, 09:15 às 10:00', participants: 'Toda a equipe' },
  { title: 'Reunião Mensal da Equipe', schedule: '3ª quinta-feira do mês, 13:30', participants: 'Toda a equipe' },
]

/** Cargos planejados sem pessoa vinculada ainda — lista estática só para dar
 *  visibilidade do organograma futuro, não uma collection. */
export const FUTURE_ROLES = ['Head de Performance', 'Analista de Performance', 'BPO / Administrativo']
