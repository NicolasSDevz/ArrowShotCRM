import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import { resolveRoutinePersonKey, buildDailyRoutine } from '../services/dailyRoutineTemplates'
import { subscribeDailyRoutineProgress, setDailyRoutineItemDone } from '../services/dailyRoutineService'

function todayKey() {
  return format(new Date(), 'yyyy-MM-dd')
}

export function useDailyRoutine() {
  const { profile } = useAuth()
  const [dateKey, setDateKey] = useState(todayKey)
  const [completedIds, setCompletedIds] = useState<string[]>([])

  // No backend scheduler in this project — the checklist "resets at
  // midnight" simply because it's keyed by calendar day (see
  // dailyRoutineService); this just makes an already-open tab notice the
  // day rolled over without needing a manual refresh.
  useEffect(() => {
    const interval = setInterval(() => {
      const key = todayKey()
      setDateKey((prev) => (prev === key ? prev : key))
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  const personKey = profile ? resolveRoutinePersonKey(profile.name) : undefined
  const items = useMemo(() => (personKey ? buildDailyRoutine(personKey, new Date(`${dateKey}T00:00:00`)) : []), [personKey, dateKey])

  useEffect(() => {
    if (!profile || !personKey) {
      setCompletedIds([])
      return
    }
    return subscribeDailyRoutineProgress(profile.id, dateKey, setCompletedIds)
  }, [profile, personKey, dateKey])

  const toggle = (itemId: string) => {
    if (!profile) return
    const done = !completedIds.includes(itemId)
    // Atualiza local antes da confirmação do Firestore: arrayUnion/arrayRemove
    // não são resolvidos otimisticamente quando o documento do dia ainda não
    // existe (primeira marcação), então sem isso o checkbox só refletia a
    // marcação depois que o snapshot voltasse do servidor — na prática, só
    // ao sair e voltar para a página.
    setCompletedIds((prev) => (done ? [...prev, itemId] : prev.filter((id) => id !== itemId)))
    setDailyRoutineItemDone(profile.id, dateKey, itemId, done).catch((err) => {
      console.error(err)
      setCompletedIds((prev) => (done ? prev.filter((id) => id !== itemId) : [...prev, itemId]))
    })
  }

  return { personKey, items, completedIds, toggle }
}
