// Layout personalizado do Dashboard por usuário. Mesmo padrão de doc
// singleton por escopo já usado em optimizationService.ts (settings/*) e
// dailyRoutineService.ts (chave por userId) — um doc por usuário em
// `userDashboards/{userId}`, com um campo por "dashboard" (hoje só
// "operacional"), o que deixa espaço pra outros dashboards no mesmo doc no
// futuro sem precisar de mais uma coleção.

import { doc, onSnapshot, setDoc, serverTimestamp, type Unsubscribe } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { UserDashboardLayout } from '../types/dashboardLayout'

function ref(userId: string) {
  return doc(db, 'userDashboards', userId)
}

export function subscribeUserDashboard(
  userId: string,
  dashboardKey: string,
  onData: (layout: UserDashboardLayout | null) => void
): Unsubscribe {
  return onSnapshot(
    ref(userId),
    (snap) => onData((snap.data()?.[dashboardKey] as UserDashboardLayout | undefined) ?? null),
    (err) => {
      console.error('[userDashboardService] falha ao assinar layout:', err)
      onData(null)
    }
  )
}

export async function saveUserDashboard(
  userId: string,
  dashboardKey: string,
  layout: Pick<UserDashboardLayout, 'widgets'>,
  updatedBy: string
) {
  await setDoc(
    ref(userId),
    { [dashboardKey]: { widgets: layout.widgets, updatedAt: serverTimestamp(), updatedBy } },
    { merge: true }
  )
}
