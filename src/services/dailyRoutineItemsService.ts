import { doc, onSnapshot, setDoc, serverTimestamp, type FirestoreError, type Unsubscribe } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { RoutineItem } from './dailyRoutineTemplates'

const COLLECTION = 'dailyRoutines'

interface StoredRoutineItem {
  id: string
  text: string
  order: number
  days?: number[]
  monthlyDay1?: boolean
}

function fromStored(items: StoredRoutineItem[] | undefined): RoutineItem[] {
  return [...(items ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((it) => ({ id: it.id, text: it.text, days: it.days, monthlyDay1: it.monthlyDay1 }))
}

/** Itens da rotina diária editável de um usuário. `onData(null)` significa
 *  que o documento ainda não existe (primeira vez) — quem assina decide o
 *  fallback (ver useDailyRoutine, que materializa o padrão do cargo e cria
 *  o documento automaticamente). */
export function subscribeDailyRoutineItems(
  userId: string,
  onData: (items: RoutineItem[] | null) => void,
  onError?: (err: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, COLLECTION, userId),
    (snap) => onData(snap.exists() ? fromStored(snap.data().items as StoredRoutineItem[] | undefined) : null),
    onError
  )
}

/** Substitui a lista inteira de itens (ordem = posição no array). Usado
 *  tanto pelo "Salvar rotina" do editor quanto pela criação automática na
 *  primeira vez que alguém abre a própria rotina. */
export async function saveDailyRoutineItems(userId: string, items: RoutineItem[]) {
  await setDoc(doc(db, COLLECTION, userId), {
    userId,
    // days/monthlyDay1 undefined viram vazios sozinhos (ignoreUndefinedProperties
    // no firebase/config.ts) — sem precisar espalhar condicionalmente aqui.
    items: items.map((it, i) => ({ id: it.id, text: it.text, order: i, days: it.days, monthlyDay1: it.monthlyDay1 })),
    updatedAt: serverTimestamp(),
  })
}
