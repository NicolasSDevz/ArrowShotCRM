import { orderBy, where, type QueryConstraint, type FirestoreError } from 'firebase/firestore'
import type { Module } from '../types'
import { collectionService } from './firestore'
import { deleteProgressForModule } from './progressService'

const COLLECTION = 'modules'
const base = collectionService<Module>(COLLECTION)

export async function createModule(
  data: Omit<Module, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>,
  userId: string
) {
  return base.create(data, userId)
}

export async function updateModule(id: string, data: Partial<Module>, userId: string) {
  await base.update(id, data, userId)
}

export async function deleteModule(id: string) {
  await base.remove(id)
  await deleteProgressForModule(id)
}

export function getModule(id: string) {
  return base.getById(id)
}

export function subscribeModulesByTrail(
  trailId: string,
  onData: (items: Module[]) => void,
  onError?: (err: FirestoreError) => void
) {
  const constraints: QueryConstraint[] = [where('trailId', '==', trailId), orderBy('order', 'asc')]
  return base.subscribe(constraints, onData, onError)
}

export function subscribeAllModules(onData: (items: Module[]) => void, onError?: (err: FirestoreError) => void) {
  return base.subscribe([orderBy('order', 'asc')], onData, onError)
}
