import { useCollectionSubscription } from './useCollectionSubscription'
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

export const useStoreProducts = () => useCollectionSubscription<StoreProduct>((d, e) => subscribeStoreProducts(d, e), [])
export const useStoreOrders = () => useCollectionSubscription<StoreOrder>((d, e) => subscribeStoreOrders(d, e), [])
export const useStoreMembers = () => useCollectionSubscription<StoreMember>((d, e) => subscribeStoreMembers(d, e), [])
export const useStoreEnrollments = () => useCollectionSubscription<StoreEnrollment>((d, e) => subscribeStoreEnrollments(d, e), [])
export const useStoreProgress = () => useCollectionSubscription<StoreProgress>((d, e) => subscribeStoreProgress(d, e), [])
export const useStoreCoupons = () => useCollectionSubscription<StoreCoupon>((d, e) => subscribeStoreCoupons(d, e), [])
export const useStoreComments = () => useCollectionSubscription<StoreComment>((d, e) => subscribeStoreComments(d, e), [])
export const useStoreModules = (productId: string) => useCollectionSubscription<StoreModule>((d, e) => subscribeStoreModules(productId, d, e), [productId])
export const useStoreLessons = (productId: string) => useCollectionSubscription<StoreLesson>((d, e) => subscribeStoreLessons(productId, d, e), [productId])
