import type { Timestamp } from 'firebase/firestore'

export type ChamadaStatus = 'ativa' | 'encerrada'

export interface BlocoTranscricao {
  id: string
  speaker: 'Bruno' | 'Cliente'
  texto: string
  /** Milissegundos desde o início da chamada */
  timestampMs: number
}

export interface Chamada {
  id: string
  status: ChamadaStatus
  iniciadaEm: Timestamp
  encerradaEm?: Timestamp | null
  blocos: BlocoTranscricao[]
  updatedBy: string
  updatedAt: Timestamp
}
