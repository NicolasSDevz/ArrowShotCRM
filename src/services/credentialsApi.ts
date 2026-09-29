import { auth } from '../firebase/config'
import type { CredentialEntry, CredentialRequestStatus } from '../types/clientCredentials'

/** Acessos (login/senha) dos clientes — tudo passa pelo servidor, que guarda
 *  a senha criptografada (ver api/_lib/credentialsHandler.js). A rota mora
 *  em /api/meta/token por causa do limite de funções da Vercel. */
const BASE = '/api/meta/token?scope=credentials'

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser
  if (!user) throw new Error('Faça login de novo pra ver os acessos')
  return { Authorization: `Bearer ${await user.getIdToken()}` }
}

async function call<T>(query: string, init: RequestInit = {}, withAuth = true): Promise<T> {
  const headers: Record<string, string> = { ...(withAuth ? await authHeaders() : {}) }
  if (init.body) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${query}`, { ...init, headers, signal: AbortSignal.timeout(20_000) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Erro ao falar com o servidor')
  return body as T
}

const q = (params: Record<string, string>) => '&' + new URLSearchParams(params).toString()

export function listClientCredentials(clientId: string) {
  return call<{ entries: CredentialEntry[]; request: CredentialRequestStatus | null }>(q({ client_id: clientId }))
}

export async function revealCredentialPassword(clientId: string, key: string): Promise<string | null> {
  const r = await call<{ password: string | null }>(q({ client_id: clientId, reveal: key }))
  return r.password
}

/** `password`: undefined = não mexe, '' = apaga, texto = troca. */
export function saveClientCredential(
  clientId: string,
  key: string,
  data: { label?: string; login?: string; password?: string; note?: string }
) {
  return call<{ ok: true }>('', { method: 'POST', body: JSON.stringify({ clientId, key, ...data }) })
}

export function deleteClientCredential(clientId: string, key: string) {
  return call<{ ok: true }>(q({ client_id: clientId, key }), { method: 'DELETE' })
}

export function createCredentialRequestLink(clientId: string, clientName: string) {
  return call<{ token: string }>(q({ action: 'link' }), { method: 'POST', body: JSON.stringify({ clientId, clientName }) })
}

export function disableCredentialRequestLink(clientId: string) {
  return call<{ ok: true }>(q({ action: 'link', client_id: clientId }), { method: 'DELETE' })
}

export function credentialRequestUrl(token: string) {
  return `${window.location.origin}/acessos/${token}`
}

/* ------------------------- página pública (sem login) ------------------------- */

export function getCredentialRequest(token: string) {
  return call<{ clientName: string }>(q({ link: token }), {}, false)
}

export function submitCredentialRequest(token: string, entries: Record<string, { login?: string; password?: string; note?: string }>) {
  return call<{ saved: number }>(q({ link: token }), { method: 'POST', body: JSON.stringify({ entries }) }, false)
}
