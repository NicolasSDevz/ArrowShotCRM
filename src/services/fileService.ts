import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { collection, addDoc, where, orderBy, serverTimestamp, deleteDoc, doc, getDocs, query, type FirestoreError } from 'firebase/firestore'
import { db } from '../firebase/config'
import { storage } from '../firebase/config'
import type { FileMeta, FileCategory, EntityType } from '../types'
import { collectionService } from './firestore'
import { logActivity } from './activityService'

const COLLECTION = 'files'
const base = collectionService<FileMeta>(COLLECTION)

/** Builds the canonical storage path. Keep every module writing through this
 *  function so the folder layout never drifts:
 *  /clients/{clientId}/{category}/{timestamp}_{fileName} */
function buildStoragePath(clientId: string, category: FileCategory, fileName: string) {
  const safeName = fileName.replace(/[^\w.-]+/g, '_')
  return `clients/${clientId}/${category}/${Date.now()}_${safeName}`
}

export function uploadFile(params: {
  file: File
  clientId: string
  category: FileCategory
  relatedType?: EntityType
  relatedId?: string
  uploadedBy: string
  uploadedByName: string
  onProgress?: (pct: number) => void
}): { promise: Promise<string>; cancel: () => void } {
  const path = buildStoragePath(params.clientId, params.category, params.file.name)
  const storageRef = ref(storage, path)
  const task = uploadBytesResumable(storageRef, params.file)

  const promise = new Promise<string>((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        params.onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100))
      },
      (err) => reject(err),
      async () => {
        try {
          const downloadUrl = await getDownloadURL(task.snapshot.ref)
          const docRef = await addDoc(collection(db, COLLECTION), {
            fileName: params.file.name,
            mimeType: params.file.type || 'application/octet-stream',
            size: params.file.size,
            downloadUrl,
            storagePath: path,
            category: params.category,
            clientId: params.clientId,
            relatedType: params.relatedType ?? null,
            relatedId: params.relatedId ?? null,
            uploadedBy: params.uploadedBy,
            uploadedByName: params.uploadedByName,
            createdAt: serverTimestamp(),
          })

          if (params.relatedType && params.relatedId) {
            await logActivity({
              entityType: params.relatedType,
              entityId: params.relatedId,
              clientId: params.clientId,
              action: 'file_uploaded',
              message: `enviou o arquivo "${params.file.name}"`,
              userId: params.uploadedBy,
              userName: params.uploadedByName,
            })
          }

          resolve(docRef.id)
        } catch (err) {
          reject(err)
        }
      }
    )
  })

  return { promise, cancel: () => task.cancel() }
}

export async function deleteFile(file: FileMeta) {
  try {
    await deleteObject(ref(storage, file.storagePath))
  } catch {
    // object may already be gone from storage; still clean up the metadata doc
  }
  await deleteDoc(doc(db, COLLECTION, file.id))
}

/** One-shot fetch — used by the client-deletion cascade to also drop the
 *  Storage binaries (subscribe* variants are for live views). */
export async function getClientFiles(clientId: string): Promise<FileMeta[]> {
  const snap = await getDocs(query(base.colRef, where('clientId', '==', clientId)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as FileMeta)
}

export function subscribeFilesByClient(
  clientId: string,
  onData: (items: FileMeta[]) => void,
  onError?: (err: FirestoreError) => void
) {
  return base.subscribe([where('clientId', '==', clientId), orderBy('createdAt', 'desc')], onData, onError)
}

export function subscribeFilesByRelated(
  relatedType: EntityType,
  relatedId: string,
  onData: (items: FileMeta[]) => void,
  onError?: (err: FirestoreError) => void
) {
  return base.subscribe(
    [where('relatedType', '==', relatedType), where('relatedId', '==', relatedId), orderBy('createdAt', 'desc')],
    onData,
    onError
  )
}
