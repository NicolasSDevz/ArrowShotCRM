import { addDoc, collection, doc, orderBy, query, serverTimestamp, updateDoc, onSnapshot, type FirestoreError, type Unsubscribe } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { Chamada, BlocoTranscricao } from '../types/chamada'

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

/** Chamadas de um lead, mais recente primeiro — usado pela aba "Chamadas" no
 *  LeadDrawer (lista + transcrição completa, já que `blocos` vem embutido no
 *  próprio doc da chamada). */
export function subscribeChamadas(
  leadId: string,
  onData: (items: Chamada[]) => void,
  onError?: (err: FirestoreError) => void
): Unsubscribe {
  const q = query(collection(db, 'leads', leadId, 'chamadas'), orderBy('iniciadaEm', 'desc'))
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Chamada)),
    onError
  )
}
