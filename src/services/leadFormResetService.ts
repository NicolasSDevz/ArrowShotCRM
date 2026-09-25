import { collection, getDocs, query, where, writeBatch, type DocumentReference } from 'firebase/firestore'
import { db } from '../firebase/config'

/** Apaga documentos em lotes (o Firestore aceita até 500 escritas por lote). */
async function deleteInBatches(refs: DocumentReference[]) {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db)
    for (const ref of refs.slice(i, i + 400)) batch.delete(ref)
    await batch.commit()
  }
}

/** Zera as métricas de um formulário (visualizações, inícios, respostas,
 *  tempo e desistência por pergunta) — apaga os eventos gravados pela
 *  página pública. Devolve quantos eventos foram apagados. */
export async function clearLeadFormMetrics(formId: string): Promise<number> {
  const snap = await getDocs(query(collection(db, 'leadFormEvents'), where('formId', '==', formId)))
  await deleteInBatches(snap.docs.map((d) => d.ref))
  return snap.size
}

/** Apaga os leads que chegaram por esse formulário (ex: os envios de teste).
 *  Leads já convertidos em cliente ficam de fora — o cliente continua existindo. */
export async function deleteLeadsFromForm(formId: string): Promise<number> {
  const snap = await getDocs(query(collection(db, 'leads'), where('sourceFormId', '==', formId)))
  const refs = snap.docs.filter((d) => !d.data().convertedClientId).map((d) => d.ref)
  await deleteInBatches(refs)
  return refs.length
}
