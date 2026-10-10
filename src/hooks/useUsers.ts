import { subscribeUsers } from '../services/userService'
import type { AppUser } from '../types'
import { useSharedSubscription } from './useCollectionSubscription'

export function useUsers() {
  return useSharedSubscription<AppUser>('users', (onData, onError) => subscribeUsers(onData, onError))
}
