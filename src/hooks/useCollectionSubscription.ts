import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { FirestoreError, Unsubscribe } from 'firebase/firestore'

type Subscribe<T> = (onData: (items: T[]) => void, onError?: (err: FirestoreError) => void) => Unsubscribe

/** Wraps any `subscribe(onData, onError) => Unsubscribe` service function into
 *  { data, loading, error } state, and tears the listener down on unmount/dep change. */
export function useCollectionSubscription<T>(subscribe: Subscribe<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<FirestoreError | null>(null)

  useEffect(() => {
    setLoading(true)
    const unsub = subscribe(
      (items) => {
        setData(items)
        setLoading(false)
      },
      (err) => {
        console.error(err)
        setError(err)
        setLoading(false)
      }
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error }
}

/* ------------------------- listeners compartilhados ------------------------- */

interface Snapshot {
  data: unknown[]
  loading: boolean
  error: FirestoreError | null
}

interface SharedEntry {
  snapshot: Snapshot
  notify: Set<() => void>
  unsub: Unsubscribe | null
  stopTimer: ReturnType<typeof setTimeout> | null
}

const INITIAL: Snapshot = { data: [], loading: true, error: null }
/** Quanto tempo o listener fica vivo depois que a última tela que usava saiu. */
const KEEP_ALIVE_MS = 5 * 60_000
const shared = new Map<string, SharedEntry>()

function acquire(key: string, subscribe: Subscribe<unknown>, onChange: () => void): SharedEntry {
  let entry = shared.get(key)
  if (!entry) {
    entry = { snapshot: INITIAL, notify: new Set(), unsub: null, stopTimer: null }
    shared.set(key, entry)
  }
  if (entry.stopTimer) clearTimeout(entry.stopTimer)
  entry.stopTimer = null
  // Listener que caiu com erro (ex.: sessão trocou) é refeito.
  if (entry.snapshot.error && entry.unsub) {
    entry.unsub()
    entry.unsub = null
    entry.snapshot = INITIAL
  }
  if (!entry.unsub) {
    const e = entry
    const emit = (snapshot: Snapshot) => {
      e.snapshot = snapshot
      e.notify.forEach((fn) => fn())
    }
    e.unsub = subscribe(
      (items) => emit({ data: items, loading: false, error: null }),
      (err) => {
        console.error(err)
        emit({ data: e.snapshot.data, loading: false, error: err })
      }
    )
  }
  entry.notify.add(onChange)
  return entry
}

function release(key: string, entry: SharedEntry, onChange: () => void) {
  entry.notify.delete(onChange)
  if (entry.notify.size || entry.stopTimer) return
  entry.stopTimer = setTimeout(() => {
    entry.unsub?.()
    if (shared.get(key) === entry) shared.delete(key)
  }, KEEP_ALIVE_MS)
}

/** Igual a useCollectionSubscription, mas um listener só por `key` para o app
 *  inteiro, mantido vivo por 5 min depois que a última tela sai. Cada listener
 *  novo no Firestore cobra a leitura de TODOS os documentos da consulta; com
 *  isso, ir e voltar entre páginas (ou várias telas usando a mesma lista) não
 *  relê a coleção. Use só para consultas que não dependem de quem está vendo
 *  além do que está na `key`. */
export function useSharedSubscription<T>(key: string, subscribe: Subscribe<T>) {
  const subscribeRef = useRef(subscribe)
  useLayoutEffect(() => {
    subscribeRef.current = subscribe
  })
  const listen = useCallback(
    (onChange: () => void) => {
      const entry = acquire(key, subscribeRef.current as Subscribe<unknown>, onChange)
      return () => release(key, entry, onChange)
    },
    [key]
  )
  const snapshot = useSyncExternalStore(listen, () => shared.get(key)?.snapshot ?? INITIAL)
  return snapshot as { data: T[]; loading: boolean; error: FirestoreError | null }
}

/** Desliga todos os listeners compartilhados (ao sair, para nada de uma sessão passar para a outra). */
export function clearSharedSubscriptions() {
  for (const entry of shared.values()) {
    if (entry.stopTimer) clearTimeout(entry.stopTimer)
    entry.unsub?.()
    entry.unsub = null
    entry.snapshot = INITIAL
    entry.notify.forEach((fn) => fn())
  }
  shared.clear()
}
