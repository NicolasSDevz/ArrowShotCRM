import { collection, doc, limit, onSnapshot, orderBy, query, setDoc, type Unsubscribe } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import {
  WA_DEFAULT_SETTINGS,
  type WaConversation,
  type WaSdr,
  type WaMessage,
  type WaSettings,
  type WaStatus,
  type WaTemplate,
} from '../types/whatsapp'

/** Cliente de /api/whatsapp (ver api/whatsapp/index.js) + leituras em tempo real. */

async function api<T>(acao: string, init: { method?: 'GET' | 'POST'; body?: unknown; query?: string } = {}): Promise<T> {
  const user = auth.currentUser
  if (!user) throw new Error('Usuário não autenticado')
  const res = await fetch(`/api/whatsapp/${acao}${init.query ? `?${init.query}` : ''}`, {
    method: init.method || 'GET',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(60_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`)
  return data as T
}

export function listenConversations(cb: (rows: WaConversation[]) => void, onError?: (e: Error) => void): Unsubscribe {
  const q = query(collection(db, 'waConversations'), orderBy('lastMessageAt', 'desc'), limit(300))
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WaConversation, 'id'>) }))),
    (e) => onError?.(e)
  )
}

export function listenMessages(waId: string, cb: (rows: WaMessage[]) => void, onError?: (e: Error) => void): Unsubscribe {
  const q = query(collection(db, 'waConversations', waId, 'messages'), orderBy('at', 'desc'), limit(200))
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WaMessage, 'id'>) })).reverse()),
    (e) => onError?.(e)
  )
}

export function listenWaSettings(cb: (s: WaSettings) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'waSettings', 'main'),
    (snap) => {
      const d = (snap.data() || {}) as Partial<WaSettings>
      cb({
        ...WA_DEFAULT_SETTINGS,
        ...d,
        followUp: { ...WA_DEFAULT_SETTINGS.followUp, ...(d.followUp || {}) },
        cart: { ...WA_DEFAULT_SETTINGS.cart, ...(d.cart || {}) },
        sdr: { ...WA_DEFAULT_SETTINGS.sdr, ...(d.sdr || {}) },
        reminder: { ...WA_DEFAULT_SETTINGS.reminder, ...(d.reminder || {}) },
      })
    },
    () => cb(WA_DEFAULT_SETTINGS)
  )
}

export async function saveWaSettings(s: WaSettings, userId: string) {
  await setDoc(doc(db, 'waSettings', 'main'), { ...s, updatedBy: userId, updatedAt: new Date().toISOString() })
}

export const getWaStatus = () => api<WaStatus>('status')

export const saveWaCredentials = (body: { token: string; appSecret: string; phoneNumberId: string; wabaId: string }) =>
  api<{ displayPhone: string; verifiedName: string }>('credentials', { method: 'POST', body })

export const listWaTemplates = (fresh = false) => api<{ templates: WaTemplate[] }>('templates', { query: fresh ? 'fresh=1' : '' }).then((r) => r.templates)

export const sendWaText = (to: string, text: string) => api<{ id: string; waId: string }>('send', { method: 'POST', body: { to, text } })

export const sendWaTemplate = (to: string, template: { name: string; lang: string; params: string[] }, name?: string) =>
  api<{ id: string; waId: string }>('send', { method: 'POST', body: { to, template, name } })

export const updateWaConversation = (
  waId: string,
  patch: { aiMode?: 'auto' | 'off'; followUpStopped?: boolean; read?: boolean; leadId?: string | null; name?: string }
) => api<{ ok: true }>('conversation', { method: 'POST', body: { waId, ...patch } })

export const replyWithAi = (waId: string) => api<{ replied?: boolean; skipped?: string; handoff?: boolean }>('reply-ai', { method: 'POST', body: { waId } })

export const analyzeWaConversation = (waId: string) => api<{ sdr: WaSdr }>('sdr-analyze', { method: 'POST', body: { waId } })
