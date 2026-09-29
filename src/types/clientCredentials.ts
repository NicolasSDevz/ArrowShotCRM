/** Acessos das contas de um cliente (aba "Acessos" da ficha e link público
 *  pro cliente preencher). A senha nunca chega ao navegador junto da lista —
 *  só quando alguém clica em "Mostrar" (ver api/_lib/credentialsStore.js). */

export type FixedCredentialKey = 'site' | 'facebook' | 'instagram' | 'google' | 'gmn' | 'youtube' | 'domain'

export interface CredentialService {
  key: FixedCredentialKey
  label: string
  /** O que vai no primeiro campo: "Login" (site) ou "E-mail". */
  loginLabel: string
  hint?: string
}

/** Os acessos fixos, na ordem em que aparecem. */
export const CREDENTIAL_SERVICES: CredentialService[] = [
  { key: 'site', label: 'Site (Hostgator)', loginLabel: 'Login', hint: 'Painel onde o site está hospedado' },
  { key: 'facebook', label: 'Facebook', loginLabel: 'E-mail' },
  { key: 'instagram', label: 'Instagram', loginLabel: 'E-mail ou usuário' },
  { key: 'google', label: 'Conta Google', loginLabel: 'E-mail' },
  { key: 'gmn', label: 'Google Meu Negócio', loginLabel: 'E-mail' },
  { key: 'youtube', label: 'YouTube', loginLabel: 'E-mail' },
  { key: 'domain', label: 'Hospedagem de domínio', loginLabel: 'E-mail', hint: 'Registro.br, GoDaddy, Hostinger…' },
]

/** Um acesso como vem do servidor (sem a senha). */
export interface CredentialEntry {
  key: string
  /** Só nos acessos extras (custom-*). */
  label: string | null
  login: string
  note: string
  hasPassword: boolean
  updatedAt: string | null
  updatedBy: string | null
  /** 'client' = o próprio cliente preencheu pelo link. */
  source: 'team' | 'client'
}

export interface CredentialRequestStatus {
  token: string
  createdAt: string | null
  submittedAt: string | null
}
