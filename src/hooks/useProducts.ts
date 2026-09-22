import { subscribeProducts } from '../services/productService'
import type { Product } from '../types'
import { useCollectionSubscription } from './useCollectionSubscription'

export function useProducts() {
  return useCollectionSubscription<Product>((onData, onError) => subscribeProducts(onData, onError), [])
}
