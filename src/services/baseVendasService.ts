import { doc, onSnapshot, setDoc, serverTimestamp, type FirestoreError, type Unsubscribe } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { BaseVendas } from '../types/baseVendas'

const REF = doc(db, 'config', 'baseVendas')

/** `onData(null)` = documento ainda não existe (ninguém abriu a tela
 *  ainda) — quem assina decide o fallback (ver hooks/useBaseVendas.ts, que
 *  semeia o padrão automaticamente). */
export function subscribeBaseVendas(
  onData: (value: BaseVendas | null) => void,
  onError?: (err: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(
    REF,
    (snap) => onData(snap.exists() ? (snap.data() as BaseVendas) : null),
    onError
  )
}

export async function saveBaseVendas(data: Omit<BaseVendas, 'updatedAt' | 'updatedBy'>, userId: string) {
  await setDoc(REF, { ...data, updatedAt: serverTimestamp(), updatedBy: userId })
}
