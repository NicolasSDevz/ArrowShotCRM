import type { Timestamp } from 'firebase/firestore'

export type JornadaMesStatus = 'pendente' | 'feita'

export interface JornadaMesSubitens {
  onboarding?: boolean
  briefing?: boolean
  estrategia?: boolean
}

export interface JornadaMes {
  id: string
  status: JornadaMesStatus
  dataReuniao?: Timestamp | null
  observacoes?: string
  subitens?: JornadaMesSubitens
  concluidoPor?: { uid: string; nome: string } | null
  concluidoEm?: Timestamp | null
  reuniaoVinculadaId?: string | null
  updatedBy?: string
  updatedAt?: Timestamp
}
