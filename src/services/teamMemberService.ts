import { orderBy, type FirestoreError } from 'firebase/firestore'
import type { TeamMember } from '../types'
import { collectionService } from './firestore'
import { deleteMemberHealthRecord } from './memberHealthService'

const COLLECTION = 'teamMembers'
const base = collectionService<TeamMember>(COLLECTION)

export async function createTeamMember(
  data: Omit<TeamMember, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>,
  userId: string
) {
  return base.create(data, userId)
}

export async function updateTeamMember(id: string, data: Partial<TeamMember>, userId: string) {
  await base.update(id, data, userId)
}

export async function deleteTeamMember(id: string) {
  await base.remove(id)
  // memberHealth/{id} + memberEmergency/{id} share the member's id — drop the
  // confidential record so it doesn't linger after the roster entry is gone.
  await deleteMemberHealthRecord(id)
}

export function subscribeTeamMembers(
  onData: (items: TeamMember[]) => void,
  onError?: (err: FirestoreError) => void
) {
  return base.subscribe([orderBy('order', 'asc')], onData, onError)
}
