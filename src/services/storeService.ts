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
import { ref, uploadBytes, getDownloadURL, listAll, deleteObject } from 'firebase/storage'
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
  type StoreMembersTheme,
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

/** Copia um produto com toda a configuração (checkout, área de membros, bumps,
 *  desconto no Pix). A cópia nasce como rascunho e com link próprio.
 *  `withContent` copia também módulos e aulas (com as capas e anexos). */
export async function duplicateStoreProduct(source: StoreProduct, name: string, withContent: boolean, userId: string) {
  const { id: _id, createdAt: _c, createdBy: _cb, updatedAt: _u, updatedBy: _ub, slug: _s, status: _st, lessonCount: _l, ...config } = source
  const newId = await products.create(
    {
      ...config,
      name,
      slug: slugify(name),
      status: 'draft',
      lessonCount: 0,
      checkout: { ...source.checkout, headline: source.checkout?.headline === source.name ? name : source.checkout?.headline, bumps: (source.checkout?.bumps ?? []).filter((b) => b.productId !== source.id) },
    },
    userId
  )
  if (withContent) {
    const [mods, lessons] = await Promise.all([
      getDocs(query(collection(db, 'storeProducts', source.id, 'modules'), orderBy('order', 'asc'))),
      getDocs(query(collection(db, 'storeProducts', source.id, 'lessons'), orderBy('order', 'asc'))),
    ])
    // Módulos ganham id novo; as aulas são religadas ao módulo copiado.
    const moduleMap = new Map<string, string>()
    let batch = writeBatch(db)
    let ops = 0
    const flush = async () => {
      if (ops) await batch.commit()
      batch = writeBatch(db)
      ops = 0
    }
    for (const m of mods.docs) {
      const ref = doc(collection(db, 'storeProducts', newId, 'modules'))
      moduleMap.set(m.id, ref.id)
      batch.set(ref, { ...m.data(), createdAt: serverTimestamp() })
      if (++ops >= 400) await flush()
    }
    for (const l of lessons.docs) {
      const data = l.data()
      const moduleId = moduleMap.get(data.moduleId)
      if (!moduleId) continue
      batch.set(doc(collection(db, 'storeProducts', newId, 'lessons')), { ...data, moduleId, createdAt: serverTimestamp() })
      if (++ops >= 400) await flush()
    }
    await flush()
    await products.update(newId, { lessonCount: lessons.docs.filter((l) => moduleMap.has(l.data().moduleId)).length }, userId)
  }
  return newId
}

export async function updateStoreProduct(id: string, data: Partial<StoreProduct>, userId: string) {
  await products.update(id, data, userId)
  if ('imageUrl' in data || 'checkout' in data || 'members' in data) cleanupStoreImages(id)
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
  cleanupStoreImages(id)
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

export async function updateStoreModule(productId: string, id: string, data: Partial<StoreModule>) {
  await updateDoc(doc(db, 'storeProducts', productId, 'modules', id), data)
  if ('coverUrl' in data) cleanupStoreImages(productId)
}

export async function deleteStoreModule(productId: string, id: string, lessons: StoreLesson[]) {
  const batch = writeBatch(db)
  lessons.filter((l) => l.moduleId === id).forEach((l) => batch.delete(doc(db, 'storeProducts', productId, 'lessons', l.id)))
  batch.delete(doc(db, 'storeProducts', productId, 'modules', id))
  await batch.commit()
  cleanupStoreImages(productId)
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

/** storeSettings/links — domínio curto do checkout (ex.: pay.marketingparalimpeza.com.br). */
export function subscribeStoreLinks(onData: (s: { checkoutDomain?: string | null } | null) => void, onError?: OnError) {
  return onSnapshot(doc(db, 'storeSettings', 'links'), (s) => onData(s.exists() ? (s.data() as { checkoutDomain?: string | null }) : null), onError)
}

export function saveStoreLinks(data: { checkoutDomain: string | null }, userId: string) {
  return setDoc(doc(db, 'storeSettings', 'links'), { ...data, updatedAt: serverTimestamp(), updatedBy: userId })
}

export function subscribeStoreMembersTheme(onData: (s: StoreMembersTheme | null) => void, onError?: OnError) {
  return onSnapshot(doc(db, 'storeSettings', 'membersTheme'), (s) => onData(s.exists() ? (s.data() as StoreMembersTheme) : null), onError)
}

export async function saveStoreMembersTheme(data: StoreMembersTheme, userId: string) {
  await setDoc(doc(db, 'storeSettings', 'membersTheme'), { ...data, updatedAt: serverTimestamp(), updatedBy: userId })
  cleanupStoreImages('tema')
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
    const url = await getDownloadURL(r)
    pendingUploads.add(r.fullPath)
    return url
  } catch (err) {
    console.warn('Storage indisponível — salvando imagem da loja como data URI.', err)
    return compressImageToDataUrl(file, Math.min(maxSize, 1000), 0.75)
  }
}

/* Só a imagem atual fica no Storage. Depois de salvar, apaga de store/{pasta}/ os
 * arquivos que nenhum produto, módulo ou config da loja usa mais (trocados,
 * removidos ou de produto excluído). Produto duplicado reaproveita os links do
 * original, por isso a conferência olha a loja inteira, não só o produto salvo.
 * Imagem enviada nesta sessão e ainda não salva fica protegida até ser trocada
 * ou removida no campo (releaseStoreImage). */
const pendingUploads = new Set<string>()

function storagePathOf(url?: string | null) {
  const m = /\/o\/([^?]+)/.exec(url || '')
  return m ? decodeURIComponent(m[1]) : null
}

/** O campo de imagem trocou ou removeu esta imagem: ela pode ser apagada no próximo salvar. */
export function releaseStoreImage(url?: string | null) {
  const path = storagePathOf(url)
  if (path) pendingUploads.delete(path)
}

export async function cleanupStoreImages(folder: string) {
  try {
    const { items } = await listAll(ref(storage, `store/${folder}`))
    const candidates = items.filter((i) => !pendingUploads.has(i.fullPath))
    if (!candidates.length) return
    const [prods, settings] = await Promise.all([getDocs(collection(db, 'storeProducts')), getDocs(collection(db, 'storeSettings'))])
    const mods = await Promise.all(prods.docs.map((p) => getDocs(collection(db, 'storeProducts', p.id, 'modules'))))
    const used = JSON.stringify([...prods.docs, ...settings.docs, ...mods.flatMap((m) => m.docs)].map((d) => d.data()))
    const stale = candidates.filter((i) => !used.includes(encodeURIComponent(i.fullPath)))
    await Promise.all(stale.map((i) => deleteObject(i).catch(() => {})))
  } catch (err) {
    console.warn('Limpeza das imagens da loja falhou (tenta de novo no próximo salvar).', err)
  }
}
