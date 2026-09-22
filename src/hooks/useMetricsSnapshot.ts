import { useEffect, useState } from 'react'
import type { FirestoreError } from 'firebase/firestore'
import { subscribeLatestMetricsSnapshot, subscribeRecentMetricsSnapshots } from '../services/metricsService'
import type { MetricsSnapshot } from '../types'

export function useMetricsSnapshot() {
  const [data, setData] = useState<MetricsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<FirestoreError | null>(null)

  useEffect(() => {
    const unsub = subscribeLatestMetricsSnapshot(
      (snap) => {
        setData(snap)
        setLoading(false)
      },
      (err) => {
        console.error(err)
        setError(err)
        setLoading(false)
      }
    )
    return unsub
  }, [])

  return { data, loading, error }
}

/** Histórico dos últimos `days` snapshots diários — base do gráfico de
 *  evolução de churn/MRR no modal de detalhe do Churn Rate. */
export function useRecentMetricsSnapshots(days: number) {
  const [data, setData] = useState<MetricsSnapshot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = subscribeRecentMetricsSnapshots(
      days,
      (snaps) => {
        setData(snaps)
        setLoading(false)
      },
      (err) => {
        console.error(err)
        setLoading(false)
      }
    )
    return unsub
  }, [days])

  return { data, loading }
}
