import { subscribeProducts } from '../services/productService'
import type { Product } from '../types'
import { useSharedSubscription } from './useCollectionSubscription'

export function useProducts() {
  return useSharedSubscription<Product>('products', (onData, onError) => subscribeProducts(onData, onError))
}
