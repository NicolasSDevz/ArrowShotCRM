import { useEffect, useState } from 'react'
import type { FirestoreError } from 'firebase/firestore'
import { subscribeLatestMetricsSnapshot } from '../services/metricsService'
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
