import { doc, onSnapshot, setDoc, serverTimestamp, type Timestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { TEAM_MEETINGS } from '../types/teamMember'

/** Reunião recorrente da equipe (aba Equipe). `lastDoneAt` = última vez que
 *  alguém marcou como feita. */
export interface TeamMeetingItem {
  id: string
  title: string
  schedule: string
  participants: string
  lastDoneAt?: Timestamp | null
  lastDoneBy?: string | null
}

const REF = doc(db, 'settings', 'teamMeetings')

/** Lista padrão enquanto ninguém editou (as 2 reuniões de sempre). */
export const DEFAULT_TEAM_MEETINGS: TeamMeetingItem[] = TEAM_MEETINGS.map((m, i) => ({ id: `default-${i}`, ...m }))

export function subscribeTeamMeetings(onData: (items: TeamMeetingItem[]) => void) {
  return onSnapshot(
    REF,
    (snap) => onData(snap.exists() ? ((snap.data().meetings as TeamMeetingItem[]) ?? []) : DEFAULT_TEAM_MEETINGS),
    (err) => {
      console.error('[reuniões da equipe]', err)
      onData(DEFAULT_TEAM_MEETINGS)
    }
  )
}

export async function saveTeamMeetings(meetings: TeamMeetingItem[], userId: string) {
  await setDoc(REF, { meetings, updatedAt: serverTimestamp(), updatedBy: userId })
}
