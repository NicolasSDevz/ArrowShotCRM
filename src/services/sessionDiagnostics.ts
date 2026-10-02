import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'

/** Diagnóstico de "o CRM fica me desconectando".
 *
 *  O Firebase guarda o login no IndexedDB do navegador. Ele só some por:
 *  - o navegador/extensão/limpador apagar os dados do site (ao fechar ou com o CRM aberto);
 *  - o servidor invalidar o login (senha trocada, conta alterada);
 *  e o CRM "parece desconectado" quando algo bloqueia a conexão com o Google
 *  (renovação do login ou banco de dados) — extensão, antivírus, VPN.
 *
 *  Marcas no localStorage dizem o que aconteceu; quando o localStorage também
 *  foi apagado, a comparação com users/{uid}.session (gravado no servidor)
 *  mostra que havia uma sessão aberta neste mesmo navegador. */

export type SessionIssueKind = 'storage-cleared' | 'not-restored' | 'live-removed' | 'revoked' | 'token-blocked' | 'db-blocked'

export interface SessionIssue {
  kind: SessionIssueKind
  at: number
  detail?: string
}

/** Gravado em users/{uid}.session a cada login. */
export interface ServerSessionMark {
  open: boolean
  deviceId: string
  ua: string
}

const DEVICE_KEY = 'crm-device-id'
const SESSION_KEY = 'crm-session'
const MANUAL_KEY = 'crm-manual-signout'
const AUTH_ERROR_KEY = 'crm-last-auth-error'
const PENDING_KEY = 'crm-session-issue'

const REVOKED_CODES = ['auth/user-token-expired', 'auth/invalid-user-token', 'auth/user-disabled', 'auth/user-not-found']

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* sem storage: não há o que diagnosticar */
  }
}

// Lido uma vez, na carga da página: se não existia, os dados do site foram apagados
// (ou é a primeira vez neste navegador).
const deviceExistedAtBoot = read<string>(DEVICE_KEY) !== null
const deviceId = read<string>(DEVICE_KEY) ?? crypto.randomUUID()
write(DEVICE_KEY, deviceId)

let sawUserThisPage = false

// ---------- pop-up pendente (mesmo padrão do confirmDialog) ----------
type Listener = (issue: SessionIssue | null) => void
let listener: Listener | null = null
let current: SessionIssue | null = read<SessionIssue>(PENDING_KEY)

export function onSessionIssue(fn: Listener) {
  listener = fn
  fn(current)
  return () => {
    if (listener === fn) listener = null
  }
}

function report(issue: SessionIssue) {
  // Não empilha o mesmo aviso de novo enquanto ele está na tela.
  if (current?.kind === issue.kind) return
  current = issue
  write(PENDING_KEY, issue)
  listener?.(issue)
}

export function dismissSessionIssue() {
  current = null
  write(PENDING_KEY, null)
  listener?.(null)
}

// ---------- eventos do login ----------

/** Chamar logo antes do signOut do botão "Sair" — não é queda, não mostra aviso. */
export async function markManualSignOut(uid: string | undefined) {
  write(MANUAL_KEY, Date.now())
  write(SESSION_KEY, null)
  if (uid) {
    await updateDoc(doc(db, 'users', uid), { 'session.open': false }).catch(() => {})
  }
}

/** Usuário logado (restaurado ou acabou de entrar). */
export function noteSignedIn(uid: string) {
  sawUserThisPage = true
  write(SESSION_KEY, { uid, at: Date.now() })
  write(MANUAL_KEY, null)
}

/** onAuthStateChanged devolveu null: decide se foi queda e por quê. */
export function noteSignedOut() {
  const manualAt = read<number>(MANUAL_KEY)
  const session = read<{ uid: string; at: number }>(SESSION_KEY)
  const authError = read<{ code: string; at: number }>(AUTH_ERROR_KEY)
  const wasMidUse = sawUserThisPage
  sawUserThisPage = false

  // "Sair" clicado (nesta aba ou em outra, nos últimos 30 s).
  if (manualAt && Date.now() - manualAt < 30_000) return
  if (!session) return // nunca houve login neste navegador (ou já foi tratado)
  write(SESSION_KEY, null)

  if (authError && REVOKED_CODES.includes(authError.code)) {
    report({ kind: 'revoked', at: Date.now(), detail: authError.code })
  } else if (wasMidUse) {
    report({ kind: 'live-removed', at: Date.now(), detail: authError?.code })
  } else {
    report({ kind: 'not-restored', at: Date.now(), detail: authError?.code })
  }
}

/** Depois que o perfil carrega: se o servidor diz que havia sessão aberta
 *  neste mesmo navegador e o navegador não lembra de nada, os dados foram apagados.
 *  Em seguida marca a sessão atual como aberta. */
export async function checkServerSession(uid: string, previous: ServerSessionMark | undefined) {
  const ua = navigator.userAgent
  if (!deviceExistedAtBoot && previous?.open && previous.ua === ua && previous.deviceId !== deviceId) {
    report({ kind: 'storage-cleared', at: Date.now() })
  }
  if (previous?.open && previous.deviceId === deviceId && previous.ua === ua) return
  const mark: ServerSessionMark = { open: true, deviceId, ua }
  await updateDoc(doc(db, 'users', uid), { session: { ...mark, at: serverTimestamp() } }).catch((err) =>
    console.error('[sessão] não foi possível registrar a sessão', err)
  )
}

/** Erro ao renovar o login (a cada poucos minutos, ver AuthContext). */
export function noteAuthError(code: string) {
  write(AUTH_ERROR_KEY, { code, at: Date.now() })
  if (code === 'auth/network-request-failed' && navigator.onLine) {
    report({ kind: 'token-blocked', at: Date.now(), detail: code })
  }
}

export function noteAuthOk() {
  write(AUTH_ERROR_KEY, null)
}

/** O perfil (Firestore) falhou várias vezes seguidas com a internet funcionando. */
export function noteDbBlocked(code: string) {
  if (navigator.onLine) report({ kind: 'db-blocked', at: Date.now(), detail: code })
}

/** Grava no perfil o último problema, pra dar pra ver depois de qualquer lugar. */
export async function saveIssueToProfile(uid: string, issue: SessionIssue) {
  await updateDoc(doc(db, 'users', uid), {
    lastSessionIssue: { kind: issue.kind, at: new Date(issue.at), detail: issue.detail ?? null, ua: navigator.userAgent },
  }).catch(() => {})
}
