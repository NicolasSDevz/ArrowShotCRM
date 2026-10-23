import { collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { AiChatMessage } from '../types/ai'

/** Conversas do Archer salvas no Firestore (aiChats/{chatId}), uma por
 *  documento, só o dono lê (ver firestore.rules). Assim o F5 não apaga a
 *  conversa e dá pra abrir as antigas no Histórico. A resposta do Archer é
 *  gravada pelo servidor (api/ai/index.js), então chega mesmo se a página
 *  for recarregada enquanto ele pensa. */
export interface ArcherChat {
  id: string
  uid: string
  title: string
  messages: AiChatMessage[]
  /** true enquanto o servidor ainda está gerando a resposta. */
  pending?: boolean
  pendingAt?: number
  createdAt: number
  updatedAt: number
}

const COLL = 'aiChats'
/** Limite pra não passar de 1 MB por documento (respostas com tabela são grandes). */
const MAX_SAVED = 120

export function newArcherChatId(): string {
  return doc(collection(db, COLL)).id
}

export function chatTitle(messages: AiChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user')?.content.trim().replace(/\s+/g, ' ') || 'Conversa'
  return first.length > 70 ? `${first.slice(0, 70)}…` : first
}

/** Firestore não aceita `undefined` — tira os campos vazios. */
function clean(messages: AiChatMessage[]) {
  return messages.slice(-MAX_SAVED).map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.sources && m.sources.length > 0 ? { sources: m.sources } : {}),
  }))
}

export async function saveArcherChat(chatId: string, uid: string, messages: AiChatMessage[], pending: boolean, createdAt?: number) {
  const now = Date.now()
  await setDoc(
    doc(db, COLL, chatId),
    {
      uid,
      title: chatTitle(messages),
      messages: clean(messages),
      pending,
      pendingAt: pending ? now : 0,
      updatedAt: now,
      ...(createdAt ? { createdAt } : {}),
    },
    { merge: true }
  )
}

export function watchArcherChat(chatId: string, onChange: (chat: ArcherChat | null) => void): () => void {
  return onSnapshot(
    doc(db, COLL, chatId),
    (snap) => onChange(snap.exists() ? ({ id: snap.id, ...snap.data() } as ArcherChat) : null),
    () => onChange(null)
  )
}

/** Conversas do usuário, da mais recente pra mais antiga. */
export async function listArcherChats(uid: string): Promise<ArcherChat[]> {
  const snap = await getDocs(query(collection(db, COLL), where('uid', '==', uid)))
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as ArcherChat)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

export async function deleteArcherChat(chatId: string) {
  await deleteDoc(doc(db, COLL, chatId))
}
