import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  type FirestoreError,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../firebase/config'

const COLLECTION = 'celebrationEvents'

/** Um evento de "novo cliente fechado" — gravado no Firestore só para que
 *  todas as abas abertas disparem a animação ao mesmo tempo. Vive ~10s. */
export interface CelebrationEvent {
  id: string
  clientName: string
  closedBy: string
  createdAt: Timestamp | null
}

/** Grava o evento. É um efeito colateral de festa — nunca deve derrubar a
 *  conversão do lead se falhar. */
export async function emitCelebration(clientName: string, closedBy: string) {
  try {
    await addDoc(collection(db, COLLECTION), {
      clientName,
      closedBy,
      createdAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('emitCelebration falhou (ação principal não afetada)', err)
  }
}

/** Só os últimos ~10s importam — quem abre a plataforma depois não deve ver
 *  a festa de novo. */
export const CELEBRATION_TTL_MS = 10_000

/** Assina os eventos recentes. `onNew` é chamado uma vez por evento fresco
 *  (createdAt < 10s), com dedupe por id feito pelo chamador. */
export function subscribeCelebrations(
  onNew: (event: CelebrationEvent) => void,
  onError?: (err: FirestoreError) => void
): Unsubscribe {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'), limit(5))
  return onSnapshot(
    q,
    (snap) => {
      const now = Date.now()
      for (const change of snap.docChanges()) {
        if (change.type !== 'added') continue
        const data = change.doc.data()
        const created = (data.createdAt as Timestamp | null)?.toMillis()
        // sem createdAt = serverTimestamp ainda não resolveu → é fresquíssimo
        if (created == null || now - created < CELEBRATION_TTL_MS) {
          onNew({
            id: change.doc.id,
            clientName: String(data.clientName ?? 'novo cliente'),
            closedBy: String(data.closedBy ?? 'a equipe'),
            createdAt: (data.createdAt as Timestamp | null) ?? null,
          })
        }
      }
    },
    onError
  )
}

/** Limpeza best-effort dos eventos antigos (>2min) — sem scheduler no
 *  projeto, quem estiver com a aba aberta apaga. Falhas são ignoradas. */
export async function pruneOldCelebrations() {
  try {
    const cutoff = Timestamp.fromMillis(Date.now() - 120_000)
    const snap = await getDocs(query(collection(db, COLLECTION), where('createdAt', '<', cutoff), limit(20)))
    await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, COLLECTION, d.id)).catch(() => {})))
  } catch {
    /* ignore */
  }
}
