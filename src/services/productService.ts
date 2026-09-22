import { orderBy, type FirestoreError } from 'firebase/firestore'
import type { Product } from '../types'
import { collectionService } from './firestore'

const COLLECTION = 'products'
const base = collectionService<Product>(COLLECTION)

export async function createProduct(
  data: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>,
  userId: string
) {
  return base.create(data, userId)
}

export async function updateProduct(id: string, data: Partial<Product>, userId: string) {
  await base.update(id, data, userId)
}

export async function deleteProduct(id: string) {
  await base.remove(id)
}

export function subscribeProducts(onData: (items: Product[]) => void, onError?: (err: FirestoreError) => void) {
  return base.subscribe([orderBy('order', 'asc')], onData, onError)
}
