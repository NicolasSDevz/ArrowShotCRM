import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type Query,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../firebase/config'
import { collectionService } from './firestore'
import { compressImageToDataUrl } from '../utils/imageToDataUrl'
import {
  defaultCheckoutConfig,
  defaultMembersConfig,
  type StoreComment,
  type StoreCoupon,
  type StoreEnrollment,
  type StoreLesson,
  type StoreMember,
  type StoreModule,
  type StoreOrder,
  type StoreProduct,
  type StoreProgress,
  type StorePaymentSettings,
  type StoreInvoiceSettings,
} from '../types/store'

/** Telas da equipe (aba Loja do CRM). O que é dinheiro/acesso (pedidos,
 *  liberação, links) passa pelo servidor em /api/loja — ver storeApi.ts. */

const products = collectionService<StoreProduct>('storeProducts')
const coupons = collectionService<StoreCoupon>('storeCoupons')

type OnError = (err: FirestoreError) => void

function listen<T>(q: Query<DocumentData>, onData: (items: T[]) => void, onError?: OnError) {
  return onSnapshot(q, (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)), onError)
}

/* ------------------------------ produtos ------------------------------ */

export function slugify(text: string) {
  const base = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${base || 'produto'}-${Math.random().toString(36).slice(2, 7)}`
}

export function subscribeStoreProducts(onData: (items: StoreProduct[]) => void, onError?: OnError) {
  return products.subscribe([orderBy('createdAt', 'desc')], onData, onError)
}

export async function createStoreProduct(name: string, price: number, userId: string) {
  return products.create(
    {
      name,
      slug: slugify(name),
      status: 'draft',
      description: '',
      imageUrl: null,
      price,
      comparePrice: null,
      maxInstallments: 12,
      paymentMethods: { pix: true, card: true },
      supportEmail: null,
      statementDescriptor: null,
      testMode: false,
      checkout: { ...defaultCheckoutConfig(), headline: name },
      members: defaultMembersConfig(),
    },
    userId
  )
}

export function updateStoreProduct(id: string, data: Partial<StoreProduct>, userId: string) {
  return products.update(id, data, userId)
}

export async function deleteStoreProduct(id: string) {
  // Apaga módulos e aulas junto (subcoleções não somem sozinhas no Firestore).
  const batch = writeBatch(db)
  for (const sub of ['modules', 'lessons']) {
    const snap = await getDocs(collection(db, 'storeProducts', id, sub))
    snap.docs.forEach((d) => batch.delete(d.ref))
  }
  batch.delete(doc(db, 'storeProducts', id))
  await batch.commit()
}

/* --------------------------- módulos e aulas --------------------------- */

export function subscribeStoreModules(productId: string, onData: (items: StoreModule[]) => void, onError?: OnError) {
  return listen<StoreModule>(query(collection(db, 'storeProducts', productId, 'modules'), orderBy('order', 'asc')), onData, onError)
}

export function subscribeStoreLessons(productId: string, onData: (items: StoreLesson[]) => void, onError?: OnError) {
  return listen<StoreLesson>(query(collection(db, 'storeProducts', productId, 'lessons'), orderBy('order', 'asc')), onData, onError)
}

export function createStoreModule(productId: string, data: Omit<StoreModule, 'id'>) {
  return addDoc(collection(db, 'storeProducts', productId, 'modules'), { ...data, createdAt: serverTimestamp() })
}

export function updateStoreModule(productId: string, id: string, data: Partial<StoreModule>) {
  return updateDoc(doc(db, 'storeProducts', productId, 'modules', id), data)
}

export async function deleteStoreModule(productId: string, id: string, lessons: StoreLesson[]) {
  const batch = writeBatch(db)
  lessons.filter((l) => l.moduleId === id).forEach((l) => batch.delete(doc(db, 'storeProducts', productId, 'lessons', l.id)))
  batch.delete(doc(db, 'storeProducts', productId, 'modules', id))
  await batch.commit()
}

export function createStoreLesson(productId: string, data: Omit<StoreLesson, 'id'>) {
  return addDoc(collection(db, 'storeProducts', productId, 'lessons'), { ...data, createdAt: serverTimestamp() })
}

export function updateStoreLesson(productId: string, id: string, data: Partial<StoreLesson>) {
  return updateDoc(doc(db, 'storeProducts', productId, 'lessons', id), data)
}

export function deleteStoreLesson(productId: string, id: string) {
  return deleteDoc(doc(db, 'storeProducts', productId, 'lessons', id))
}

/** Troca a ordem de dois itens (módulos ou aulas). */
export async function swapStoreOrder(productId: string, sub: 'modules' | 'lessons', a: { id: string; order: number }, b: { id: string; order: number }) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'storeProducts', productId, sub, a.id), { order: b.order })
  batch.update(doc(db, 'storeProducts', productId, sub, b.id), { order: a.order })
  await batch.commit()
}

/* ------------------------------- cupons ------------------------------- */

export function subscribeStoreCoupons(onData: (items: StoreCoupon[]) => void, onError?: OnError) {
  return coupons.subscribe([orderBy('createdAt', 'desc')], onData, onError)
}

export function createStoreCoupon(data: Omit<StoreCoupon, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>, userId: string) {
  return coupons.create({ ...data, code: data.code.trim().toUpperCase() }, userId)
}

export function updateStoreCoupon(id: string, data: Partial<StoreCoupon>, userId: string) {
  return coupons.update(id, data, userId)
}

export function deleteStoreCoupon(id: string) {
  return coupons.remove(id)
}

/* ---------------------- pedidos, alunos e progresso ---------------------- */

export function subscribeStoreOrders(onData: (items: StoreOrder[]) => void, onError?: OnError) {
  return listen<StoreOrder>(query(collection(db, 'storeOrders'), orderBy('createdAt', 'desc'), limit(1000)), onData, onError)
}

export function subscribeStoreMembers(onData: (items: StoreMember[]) => void, onError?: OnError) {
  return listen<StoreMember>(query(collection(db, 'storeMembers'), orderBy('createdAt', 'desc')), onData, onError)
}

export function subscribeStoreEnrollments(onData: (items: StoreEnrollment[]) => void, onError?: OnError) {
  return listen<StoreEnrollment>(query(collection(db, 'storeEnrollments')), onData, onError)
}

export function subscribeStoreProgress(onData: (items: StoreProgress[]) => void, onError?: OnError) {
  return listen<StoreProgress>(query(collection(db, 'storeProgress')), onData, onError)
}

/* ------------------------------ comentários ------------------------------ */

export function subscribeStoreComments(onData: (items: StoreComment[]) => void, onError?: OnError) {
  return listen<StoreComment>(query(collection(db, 'storeComments'), orderBy('createdAt', 'desc'), limit(500)), onData, onError)
}

export function approveStoreComment(id: string) {
  return updateDoc(doc(db, 'storeComments', id), { status: 'approved' })
}

export function deleteStoreComment(id: string) {
  return deleteDoc(doc(db, 'storeComments', id))
}

export function replyAsProducer(parent: StoreComment, text: string, authorName: string, uid: string) {
  return addDoc(collection(db, 'storeComments'), {
    productId: parent.productId,
    lessonId: parent.lessonId,
    lessonTitle: parent.lessonTitle ?? null,
    uid,
    authorName,
    text,
    status: 'approved',
    isProducer: true,
    parentId: parent.parentId || parent.id,
    createdAt: serverTimestamp(),
  })
}

/* ------------------------------ recebimento ------------------------------ */

export function subscribeStorePaymentSettings(onData: (s: StorePaymentSettings | null) => void, onError?: OnError) {
  return onSnapshot(doc(db, 'storeSettings', 'payments'), (s) => onData(s.exists() ? (s.data() as StorePaymentSettings) : null), onError)
}

export function saveStorePaymentSettings(data: StorePaymentSettings, userId: string) {
  return setDoc(doc(db, 'storeSettings', 'payments'), { ...data, updatedAt: serverTimestamp(), updatedBy: userId })
}

export function subscribeStoreInvoiceSettings(onData: (s: StoreInvoiceSettings | null) => void, onError?: OnError) {
  return onSnapshot(doc(db, 'storeSettings', 'invoice'), (s) => onData(s.exists() ? (s.data() as StoreInvoiceSettings) : null), onError)
}

export function saveStoreInvoiceSettings(data: StoreInvoiceSettings, userId: string) {
  return setDoc(doc(db, 'storeSettings', 'invoice'), { ...data, updatedAt: serverTimestamp(), updatedBy: userId })
}

/* -------------------------------- imagens -------------------------------- */

/** Sobe uma imagem da loja (capa, banner, imagens do checkout) para o Storage
 *  em store/{productId}/ — leitura pública, porque o checkout não tem login.
 *  Se o Storage falhar, cai para data URI comprimido (mesmo padrão dos
 *  formulários de captura). */
export async function uploadStoreImage(productId: string, key: string, file: File, maxSize = 1600): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem.')
  if (file.size > 8 * 1024 * 1024) throw new Error('A imagem precisa ter no máximo 8MB.')
  try {
    const r = ref(storage, `store/${productId}/${key}-${Date.now()}`)
    const upload = uploadBytes(r, file, { contentType: file.type })
    await Promise.race([upload, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))])
    return await getDownloadURL(r)
  } catch (err) {
    console.warn('Storage indisponível — salvando imagem da loja como data URI.', err)
    return compressImageToDataUrl(file, Math.min(maxSize, 1000), 0.75)
  }
}
