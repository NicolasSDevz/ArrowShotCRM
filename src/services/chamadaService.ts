import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { BlocoTranscricao } from '../types/chamada'

function ref(leadId: string, chamadaId: string) {
  return doc(db, 'leads', leadId, 'chamadas', chamadaId)
}

export async function criarChamada(leadId: string, userId: string): Promise<string> {
  const docRef = await addDoc(collection(db, 'leads', leadId, 'chamadas'), {
    status: 'ativa',
    iniciadaEm: serverTimestamp(),
    encerradaEm: null,
    blocos: [],
    updatedBy: userId,
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function salvarBlocos(
  leadId: string,
  chamadaId: string,
  blocos: BlocoTranscricao[],
  userId: string
): Promise<void> {
  await updateDoc(ref(leadId, chamadaId), {
    blocos,
    updatedBy: userId,
    updatedAt: serverTimestamp(),
  })
}

export async function encerrarChamada(
  leadId: string,
  chamadaId: string,
  blocos: BlocoTranscricao[],
  userId: string
): Promise<void> {
  await updateDoc(ref(leadId, chamadaId), {
    status: 'encerrada',
    encerradaEm: serverTimestamp(),
    blocos,
    updatedBy: userId,
    updatedAt: serverTimestamp(),
  })
}
