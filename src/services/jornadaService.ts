import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  serverTimestamp,
  writeBatch,
  type FirestoreError,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import type { JornadaMes, JornadaMesSubitens } from '../types/jornada'

function jornadaCol(clientId: string) {
  return collection(db, 'clients', clientId, 'jornada')
}

export function subscribeJornada(
  clientId: string,
  onData: (items: JornadaMes[]) => void,
  onError?: (err: FirestoreError) => void,
) {
  const q = query(jornadaCol(clientId))
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as JornadaMes))),
    onError,
  )
}

export async function saveJornadaField(
  clientId: string,
  mes: string,
  data: Record<string, unknown>,
  userId: string,
) {
  const ref = doc(db, 'clients', clientId, 'jornada', mes)
  await setDoc(ref, { ...data, updatedBy: userId, updatedAt: serverTimestamp() }, { merge: true })
}

export async function saveJornadaSubitens(
  clientId: string,
  mes: string,
  subitens: JornadaMesSubitens,
  userId: string,
) {
  return saveJornadaField(clientId, mes, { subitens }, userId)
}

export async function marcarMesFeito(
  clientId: string,
  mes: string,
  userId: string,
  userName: string,
  currentFeitas: string[],
  hasDataReuniao: boolean,
) {
  const batch = writeBatch(db)

  const mesRef = doc(db, 'clients', clientId, 'jornada', mes)
  const payload: Record<string, unknown> = {
    status: 'feita',
    concluidoPor: { uid: userId, nome: userName },
    concluidoEm: serverTimestamp(),
    updatedBy: userId,
    updatedAt: serverTimestamp(),
  }
  if (!hasDataReuniao) {
    payload.dataReuniao = serverTimestamp()
  }
  batch.set(mesRef, payload, { merge: true })

  const newFeitas = [...new Set([...currentFeitas, mes])].sort()
  batch.update(doc(db, 'clients', clientId), {
    jornadaFeitas: newFeitas,
    updatedBy: userId,
    updatedAt: serverTimestamp(),
  })

  await batch.commit()
}

export async function desmarcarMes(
  clientId: string,
  mes: string,
  userId: string,
  currentFeitas: string[],
) {
  const batch = writeBatch(db)

  const mesRef = doc(db, 'clients', clientId, 'jornada', mes)
  batch.set(mesRef, {
    status: 'pendente',
    concluidoPor: null,
    concluidoEm: null,
    updatedBy: userId,
    updatedAt: serverTimestamp(),
  }, { merge: true })

  const newFeitas = currentFeitas.filter((m) => m !== mes).sort()
  batch.update(doc(db, 'clients', clientId), {
    jornadaFeitas: newFeitas,
    updatedBy: userId,
    updatedAt: serverTimestamp(),
  })

  await batch.commit()
}
