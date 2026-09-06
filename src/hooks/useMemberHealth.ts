import { useEffect, useState } from 'react'
import { subscribeMemberEmergency, subscribeMemberHealth } from '../services/memberHealthService'
import type { MemberEmergency, MemberHealth } from '../types'

/** Confidential record — `denied` flips true when Firestore rules reject the
 *  read (i.e. the viewer is not an admin). */
export function useMemberHealth(memberId: string | null) {
  const [data, setData] = useState<MemberHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [trackedId, setTrackedId] = useState(memberId)

  // Reset synchronously when the target member changes, so a previous
  // member's medical record is never rendered under a different name for a
  // frame while the new subscription is still loading.
  if (trackedId !== memberId) {
    setTrackedId(memberId)
    setData(null)
    setDenied(false)
    setLoading(!!memberId)
  }

  useEffect(() => {
    if (!memberId) return
    const unsub = subscribeMemberHealth(
      memberId,
      (d) => {
        setData(d)
        setLoading(false)
      },
      () => {
        setDenied(true)
        setLoading(false)
      }
    )
    return unsub
  }, [memberId])

  return { data, loading, denied }
}

export function useMemberEmergency(memberId: string | null) {
  const [data, setData] = useState<MemberEmergency | null>(null)
  const [loading, setLoading] = useState(true)
  const [trackedId, setTrackedId] = useState(memberId)

  // See useMemberHealth — reset synchronously so a previous member's data is
  // never shown under a different name while the new load is in flight.
  if (trackedId !== memberId) {
    setTrackedId(memberId)
    setData(null)
    setLoading(!!memberId)
  }

  useEffect(() => {
    if (!memberId) return
    const unsub = subscribeMemberEmergency(
      memberId,
      (d) => {
        setData(d)
        setLoading(false)
      },
      () => setLoading(false)
    )
    return unsub
  }, [memberId])

  return { data, loading }
}
