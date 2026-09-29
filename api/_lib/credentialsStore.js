// Acessos das contas de cada cliente (site, Facebook, Instagram, Google…).
//
// Guardado em `clientCredentials/{clientId}` e SÓ lido/gravado aqui no
// servidor (as regras do Firestore negam o SDK do navegador). O login e a
// observação ficam em texto; a SENHA sempre criptografada com a mesma chave
// dos tokens do Meta (META_TOKEN_ENCRYPTION_KEY, ver tokenCrypto.js) e só é
// decifrada quando alguém da equipe clica em "Mostrar" — cada vez fica
// registrada em `clientCredentials/{clientId}/views`.
//
// O cliente também pode preencher por um link (`credentialRequests/{token}`),
// sem login: o que ele manda cai direto aqui.

import { randomBytes } from 'node:crypto'
import { getDoc, setDoc, updateDoc } from './firebaseAdmin.js'
import { encryptToken, decryptToken } from './tokenCrypto.js'

const COLLECTION = 'clientCredentials'
const REQUESTS = 'credentialRequests'

/** Os acessos fixos, na ordem da tela. `custom-*` são extras criados pela equipe. */
export const FIXED_KEYS = ['site', 'facebook', 'instagram', 'google', 'gmn', 'youtube', 'domain']
const MAX = { login: 200, password: 200, note: 500, label: 60 }
const MAX_CUSTOM = 15

export function isValidKey(key) {
  return FIXED_KEYS.includes(key) || /^custom-[a-z0-9-]{4,40}$/.test(key)
}

const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '')

async function readEntries(clientId) {
  const doc = await getDoc(`${COLLECTION}/${clientId}`)
  return doc.exists ? doc.data().entries || {} : {}
}

/** Lista pro painel: tudo menos a senha (só se existe ou não). */
export async function listCredentials(clientId) {
  const entries = await readEntries(clientId)
  return Object.entries(entries).map(([key, e]) => ({
    key,
    label: e.label || null,
    login: e.login || '',
    note: e.note || '',
    hasPassword: !!e.secret,
    updatedAt: e.updatedAt || null,
    updatedBy: e.updatedBy || null,
    source: e.source || 'team',
  }))
}

/** Aplica mudanças num acesso. `password`: undefined = mantém, '' = apaga,
 *  texto = troca. Só campos presentes em `patch` mudam. */
function applyPatch(current, patch, who, source) {
  const next = { ...(current || {}) }
  if (patch.label !== undefined) next.label = clip(patch.label, MAX.label).trim() || null
  if (patch.login !== undefined) next.login = clip(patch.login, MAX.login).trim()
  if (patch.note !== undefined) next.note = clip(patch.note, MAX.note).trim()
  if (patch.password !== undefined) {
    const pw = clip(patch.password, MAX.password)
    next.secret = pw ? encryptToken(pw) : null
  }
  next.updatedAt = new Date().toISOString()
  next.updatedBy = who
  next.source = source
  return next
}

export async function saveCredential(clientId, key, patch, who, source = 'team') {
  if (!isValidKey(key)) throw Object.assign(new Error('Acesso inválido'), { status: 400 })
  const entries = await readEntries(clientId)
  if (key.startsWith('custom-') && !entries[key] && Object.keys(entries).filter((k) => k.startsWith('custom-')).length >= MAX_CUSTOM) {
    throw Object.assign(new Error('Limite de acessos extras atingido'), { status: 400 })
  }
  entries[key] = applyPatch(entries[key], patch, who, source)
  await updateDoc(`${COLLECTION}/${clientId}`, { entries, updatedAt: new Date().toISOString() })
}

export async function deleteCredential(clientId, key) {
  const entries = await readEntries(clientId)
  delete entries[key]
  await updateDoc(`${COLLECTION}/${clientId}`, { entries, updatedAt: new Date().toISOString() })
}

/** Decifra a senha de UM acesso e registra quem viu. */
export async function revealPassword(clientId, key, user) {
  const entries = await readEntries(clientId)
  const secret = entries[key]?.secret
  if (!secret) return null
  const password = decryptToken(secret)
  const at = new Date()
  await setDoc(`${COLLECTION}/${clientId}/views/${at.getTime()}-${randomBytes(3).toString('hex')}`, {
    key,
    userId: user.uid,
    userName: user.name,
    at: at.toISOString(),
  }).catch((err) => console.error('[credentials] falha ao registrar visualização', err))
  return password
}

/* ------------------------------ link pro cliente ------------------------------ */

/** Cria (ou reaproveita) o link de preenchimento do cliente. */
export async function createRequestLink(clientId, clientName, user) {
  const token = randomBytes(18).toString('base64url')
  await setDoc(`${REQUESTS}/${token}`, {
    clientId,
    clientName,
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: user.name,
    submittedAt: null,
  })
  // Guarda no doc do cliente qual é o link atual (pra mostrar/desligar depois).
  const current = await getDoc(`${COLLECTION}/${clientId}`)
  const old = current.exists ? current.data().requestToken : null
  if (old) await updateDoc(`${REQUESTS}/${old}`, { active: false }).catch(() => {})
  await updateDoc(`${COLLECTION}/${clientId}`, { requestToken: token })
  return token
}

export async function getRequestStatus(clientId) {
  const doc = await getDoc(`${COLLECTION}/${clientId}`)
  const token = doc.exists ? doc.data().requestToken : null
  if (!token) return null
  const req = await getDoc(`${REQUESTS}/${token}`)
  if (!req.exists || !req.data().active) return null
  return { token, submittedAt: req.data().submittedAt || null, createdAt: req.data().createdAt || null }
}

export async function disableRequestLink(clientId) {
  const doc = await getDoc(`${COLLECTION}/${clientId}`)
  const token = doc.exists ? doc.data().requestToken : null
  if (token) await updateDoc(`${REQUESTS}/${token}`, { active: false })
  await updateDoc(`${COLLECTION}/${clientId}`, { requestToken: null })
}

/** Página pública: só o nome do cliente (e se o link vale). */
export async function getPublicRequest(token) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token || '')) return null
  const req = await getDoc(`${REQUESTS}/${token}`)
  if (!req.exists || !req.data().active) return null
  return { clientId: req.data().clientId, clientName: req.data().clientName }
}

/** O cliente enviou pelo link: grava só o que veio preenchido (campo vazio
 *  não apaga o que a agência já tinha). */
export async function submitFromClient(token, sent) {
  const req = await getPublicRequest(token)
  if (!req) throw Object.assign(new Error('Link desativado ou inválido'), { status: 404 })
  const entries = await readEntries(req.clientId)
  let changed = 0
  for (const key of FIXED_KEYS) {
    const s = sent?.[key]
    if (!s || typeof s !== 'object') continue
    const patch = {}
    if (typeof s.login === 'string' && s.login.trim()) patch.login = s.login
    if (typeof s.password === 'string' && s.password) patch.password = s.password
    if (typeof s.note === 'string' && s.note.trim()) patch.note = s.note
    if (Object.keys(patch).length === 0) continue
    entries[key] = applyPatch(entries[key], patch, `${req.clientName} (pelo link)`, 'client')
    changed++
  }
  if (changed === 0) throw Object.assign(new Error('Preencha pelo menos um acesso'), { status: 400 })
  await updateDoc(`${COLLECTION}/${req.clientId}`, { entries, updatedAt: new Date().toISOString() })
  await updateDoc(`${REQUESTS}/${token}`, { submittedAt: new Date().toISOString() })
  return changed
}
