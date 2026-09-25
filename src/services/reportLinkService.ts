import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { hasContractedPaidTraffic, trafficServices } from '../utils/clientServices'
import type { Client } from '../types/client'
import type { ReportLink } from '../types/reportLink'

const COLLECTION = 'reportLinks'

/** 18 bytes aleatórios em base64url (24 caracteres) — é o que protege o link,
 *  então não pode ser adivinhável. */
function newToken(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function reportLinkUrl(token: string, range?: { from: string; to: string }): string {
  const url = `${window.location.origin}/relatorio/${token}`
  return range ? `${url}?de=${range.from}&ate=${range.to}` : url
}

/** O que o link precisa pra buscar os dados ao vivo — contas de anúncio e o
 *  nome/logo pro cabeçalho (a página pública não lê a ficha do cliente). */
function linkPayload(client: Client) {
  const acessos = client.campaignPlanning?.acessos
  const metaAccountId = acessos?.metaAdsAccountId?.trim() || null
  const googleAccountId = acessos?.googleAdsAccountId?.trim() || null
  const contracted = hasContractedPaidTraffic(client) ? trafficServices(client).platforms : []
  const platforms = contracted.filter((p) => (p === 'meta' ? !!metaAccountId : !!googleAccountId))
  return {
    clientId: client.id,
    clientName: client.companyName,
    logoUrl: client.logoUrl ?? null,
    metaAccountId,
    googleAccountId,
    platforms,
  }
}

/** Link ativo do cliente (reaproveita o que já existe, atualizando contas e
 *  nome) ou cria um novo. Um cliente tem no máximo um link ativo. */
export async function getOrCreateReportLink(client: Client, userId: string, userName: string): Promise<ReportLink> {
  const payload = linkPayload(client)
  if (payload.platforms.length === 0) {
    throw new Error('Este cliente não tem conta de Meta Ads ou Google Ads cadastrada em Acessos.')
  }
  const existing = await getDocs(
    query(collection(db, COLLECTION), where('clientId', '==', client.id), where('active', '==', true))
  )
  if (!existing.empty) {
    const d = existing.docs[0]
    await updateDoc(d.ref, { ...payload, updatedAt: serverTimestamp(), updatedBy: userId })
    return { ...(d.data() as ReportLink), ...payload, token: d.id }
  }
  const token = newToken()
  await setDoc(doc(db, COLLECTION, token), {
    ...payload,
    active: true,
    createdByName: userName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    updatedBy: userId,
  })
  return { ...payload, token, active: true, createdByName: userName }
}

/** Token do link ativo do cliente, ou null se ele não tem. */
export async function getActiveReportLink(clientId: string): Promise<string | null> {
  const snap = await getDocs(query(collection(db, COLLECTION), where('clientId', '==', clientId), where('active', '==', true)))
  return snap.empty ? null : snap.docs[0].id
}

/** Desliga o link — quem tiver o endereço antigo passa a ver "link desativado". */
export async function disableReportLink(token: string, userId: string) {
  await updateDoc(doc(db, COLLECTION, token), { active: false, updatedAt: serverTimestamp(), updatedBy: userId })
}

/** Leitura da página pública (sem login). null = não existe ou desativado. */
export async function getPublicReportLink(token: string): Promise<ReportLink | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, token))
    if (!snap.exists()) return null
    const data = snap.data() as ReportLink
    return data.active ? { ...data, token: snap.id } : null
  } catch {
    // Link desativado: as regras negam a leitura pra quem não é da equipe.
    return null
  }
}
