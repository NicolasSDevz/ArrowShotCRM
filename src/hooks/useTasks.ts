import { subscribeAllTasks, subscribeTasks, type TaskFilters } from '../services/taskService'
import type { Task } from '../types'
import { useCollectionSubscription, useSharedSubscription } from './useCollectionSubscription'

export function useTasks(filters: TaskFilters = {}) {
  return useCollectionSubscription<Task>(
    (onData, onError) => subscribeTasks(onData, filters, onError),
    [filters.clientId, filters.assignedTo, filters.status]
  )
}

export function useAllTasks() {
  return useSharedSubscription<Task>('tasks:all', (onData, onError) => subscribeAllTasks(onData, onError))
}
