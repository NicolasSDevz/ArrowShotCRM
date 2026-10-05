import { doc, onSnapshot, setDoc, runTransaction, serverTimestamp, type FirestoreError, type Unsubscribe } from 'firebase/firestore'
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
  // includeMetadataChanges: com o cache persistente (firebase/config.ts) o
  // primeiro snapshot pode vir do cache local dizendo "não existe" mesmo com
  // o documento existindo no servidor (cache vazio/limpo, outro navegador).
  // Tratar isso como "primeira vez" fazia useRoutineItemsFor gravar o padrão
  // do cargo por cima da rotina real — os itens criados sumiam. Só repassa
  // `null` depois que o servidor confirmar que o documento não existe.
  return onSnapshot(
    doc(db, COLLECTION, userId),
    { includeMetadataChanges: true },
    (snap) => {
      if (snap.exists()) {
        onData(fromStored(snap.data().items as StoredRoutineItem[] | undefined))
      } else if (!snap.metadata.fromCache) {
        onData(null)
      }
    },
    onError
  )
}

function toStored(userId: string, items: RoutineItem[]) {
  return {
    userId,
    // days/monthlyDay1 undefined viram vazios sozinhos (ignoreUndefinedProperties
    // no firebase/config.ts) — sem precisar espalhar condicionalmente aqui.
    items: items.map((it, i) => ({ id: it.id, text: it.text, order: i, days: it.days, monthlyDay1: it.monthlyDay1 })),
    updatedAt: serverTimestamp(),
  }
}

/** Substitui a lista inteira de itens (ordem = posição no array). Usado
 *  tanto pelo "Salvar rotina" do editor quanto pela criação automática na
 *  primeira vez que alguém abre a própria rotina. */
export async function saveDailyRoutineItems(userId: string, items: RoutineItem[]) {
  await setDoc(doc(db, COLLECTION, userId), toStored(userId, items))
}

/** Cria a rotina com os itens padrão só se o documento ainda não existir —
 *  em transação, porque várias telas abertas ao mesmo tempo (widget do
 *  Dashboard, "Rotina da equipe", ficha em Equipe) podem ver o documento
 *  ausente juntas; um setDoc direto de cada uma sobrescreveria a outra (ou
 *  uma rotina salva nesse meio-tempo). */
export async function createDailyRoutineIfMissing(userId: string, items: RoutineItem[]) {
  const ref = doc(db, COLLECTION, userId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (snap.exists()) return
    tx.set(ref, toStored(userId, items))
  })
}
