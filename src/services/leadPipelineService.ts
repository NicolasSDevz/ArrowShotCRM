import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, type FirestoreError } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { LeadPipeline, PipelineField, PipelineStage } from '../types/leadPipeline'
import { DEFAULT_PIPELINE_ID } from '../types/leadPipeline'

const COLLECTION = 'leadPipelines'

export function subscribeLeadPipelines(onData: (items: LeadPipeline[]) => void, onError?: (err: FirestoreError) => void) {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as LeadPipeline)),
    onError
  )
}

export interface PipelineInput {
  name: string
  fields: PipelineField[]
  /** Ignorado no pipeline padrão (as etapas dele são fixas). */
  stages?: PipelineStage[]
}

/** Cria um pipeline novo e devolve o id. */
export async function createLeadPipeline(input: PipelineInput & { stages: PipelineStage[]; order: number }, userId: string): Promise<string> {
  const ref = doc(collection(db, COLLECTION))
  await setDoc(ref, {
    name: input.name,
    order: input.order,
    stages: input.stages,
    fields: input.fields,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    updatedBy: userId,
  })
  return ref.id
}

/** Atualiza (ou, no padrão, cria na primeira vez) o doc do pipeline. */
export async function saveLeadPipeline(id: string, input: PipelineInput, userId: string) {
  const isDefault = id === DEFAULT_PIPELINE_ID
  await setDoc(
    doc(db, COLLECTION, id),
    {
      name: input.name,
      fields: input.fields,
      ...(isDefault ? { order: -1, stages: [], createdBy: userId } : { stages: input.stages }),
      updatedAt: serverTimestamp(),
      updatedBy: userId,
      ...(isDefault ? { createdAt: serverTimestamp() } : {}),
    },
    { merge: true }
  )
}

export async function deleteLeadPipeline(id: string) {
  await deleteDoc(doc(db, COLLECTION, id))
}
