import { collection, query, orderBy, limit, onSnapshot, type FirestoreError, type Unsubscribe } from 'firebase/firestore'
import { db, auth } from '../firebase/config'
import type { MetricsSnapshot } from '../types'

const COLLECTION = 'metricsSnapshots'

/** Escuta o snapshot de métricas mais recente (um doc por dia). */
export function subscribeLatestMetricsSnapshot(
  onData: (snapshot: MetricsSnapshot | null) => void,
  onError?: (err: FirestoreError) => void
): Unsubscribe {
  const q = query(collection(db, COLLECTION), orderBy('calculatedAt', 'desc'), limit(1))
  return onSnapshot(
    q,
    (snap) => {
      const doc = snap.docs[0]
      onData(doc ? ({ id: doc.id, ...doc.data() } as MetricsSnapshot) : null)
    },
    onError
  )
}

/** Força o recálculo do snapshot no backend (botão "Atualizar agora"). */
export async function refreshMetricsNow(): Promise<MetricsSnapshot> {
  const user = auth.currentUser
  if (!user) throw new Error('Usuário não autenticado')
  const idToken = await user.getIdToken()
  const res = await fetch('/api/metrics/refresh', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.ok) throw new Error(body.error || 'Falha ao atualizar as métricas')
  return body.metrics as MetricsSnapshot
}
