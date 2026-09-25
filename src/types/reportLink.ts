import type { OptimizationPlatform } from './optimization'

/** Link público de relatório (/relatorio/:token) — o cliente abre sem login e
 *  escolhe as datas; os dados vêm ao vivo do Meta/Google. Guardado em
 *  `reportLinks/{token}`: o id do documento É o token. */
export interface ReportLink {
  token: string
  clientId: string
  clientName: string
  logoUrl?: string | null
  metaAccountId?: string | null
  googleAccountId?: string | null
  /** Plataformas com conta cadastrada e contratadas pelo cliente. */
  platforms: OptimizationPlatform[]
  active: boolean
  createdByName?: string
}
