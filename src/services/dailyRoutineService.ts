import { doc, onSnapshot, setDoc, serverTimestamp, arrayUnion, arrayRemove, type FirestoreError, type Unsubscribe } from 'firebase/firestore'
import { db } from '../firebase/config'

const COLLECTION = 'dailyRoutineProgress'

function docId(userId: string, date: string) {
  return `${userId}_${date}`
}

/** Which items of today's checklist this user already checked off — keyed
 *  by calendar day (yyyy-MM-dd), so a new day is automatically a blank
 *  slate (no "reset at midnight" job needed, see DashboardPage).
 *
 *  `onError` is optional and defaults to the original swallow-and-clear
 *  behavior (logs + reports empty) — pass it when the caller needs to tell
 *  a real permission-denied (e.g. reading someone else's progress, which
 *  firestore.rules explicitly forbids — see TeamRoutineTodayWidget) apart
 *  from "no doc yet". */
export function subscribeDailyRoutineProgress(
  userId: string,
  date: string,
  onData: (completedItemIds: string[]) => void,
  onError?: (err: FirestoreError) => void
): Unsubscribe {
  const ref = doc(db, COLLECTION, docId(userId, date))
  return onSnapshot(
    ref,
    (snap) => onData(snap.exists() ? ((snap.data().completedItemIds as string[]) ?? []) : []),
    (err) => {
      console.error(err)
      onData([])
      onError?.(err)
    }
  )
}

export async function setDailyRoutineItemDone(userId: string, date: string, itemId: string, done: boolean) {
  // Atomic array op instead of rewriting the whole list from a client-side
  // snapshot — marking two items in quick succession can't clobber each other.
  await setDoc(
    doc(db, COLLECTION, docId(userId, date)),
    {
      userId,
      date,
      completedItemIds: done ? arrayUnion(itemId) : arrayRemove(itemId),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}
