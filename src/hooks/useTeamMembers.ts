import { subscribeTeamMembers } from '../services/teamMemberService'
import type { TeamMember } from '../types'
import { useSharedSubscription } from './useCollectionSubscription'

export function useTeamMembers() {
  return useSharedSubscription<TeamMember>('teamMembers', (onData, onError) => subscribeTeamMembers(onData, onError))
}
