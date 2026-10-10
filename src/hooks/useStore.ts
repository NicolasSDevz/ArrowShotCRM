import { useCollectionSubscription, useSharedSubscription } from './useCollectionSubscription'
import {
  subscribeStoreComments,
  subscribeStoreCoupons,
  subscribeStoreEnrollments,
  subscribeStoreLessons,
  subscribeStoreMembers,
  subscribeStoreModules,
  subscribeStoreOrders,
  subscribeStoreProducts,
  subscribeStoreProgress,
} from '../services/storeService'
import type { StoreComment, StoreCoupon, StoreEnrollment, StoreLesson, StoreMember, StoreModule, StoreOrder, StoreProduct, StoreProgress } from '../types/store'

export const useStoreProducts = () => useSharedSubscription<StoreProduct>('storeProducts', (d, e) => subscribeStoreProducts(d, e))
export const useStoreOrders = () => useSharedSubscription<StoreOrder>('storeOrders', (d, e) => subscribeStoreOrders(d, e))
export const useStoreMembers = () => useSharedSubscription<StoreMember>('storeMembers', (d, e) => subscribeStoreMembers(d, e))
export const useStoreEnrollments = () => useSharedSubscription<StoreEnrollment>('storeEnrollments', (d, e) => subscribeStoreEnrollments(d, e))
export const useStoreProgress = () => useSharedSubscription<StoreProgress>('storeProgress', (d, e) => subscribeStoreProgress(d, e))
export const useStoreCoupons = () => useSharedSubscription<StoreCoupon>('storeCoupons', (d, e) => subscribeStoreCoupons(d, e))
export const useStoreComments = () => useSharedSubscription<StoreComment>('storeComments', (d, e) => subscribeStoreComments(d, e))
export const useStoreModules = (productId: string) => useCollectionSubscription<StoreModule>((d, e) => subscribeStoreModules(productId, d, e), [productId])
export const useStoreLessons = (productId: string) => useCollectionSubscription<StoreLesson>((d, e) => subscribeStoreLessons(productId, d, e), [productId])
