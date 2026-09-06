import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'

/** One-shot client company name by id — for building notification messages
 *  ("… — Help Gestão") from services that only carry the clientId. Standalone
 *  (no clientService import) to avoid a cycle with taskService/contentService.
 *  Returns '' on any miss so callers can `${name ? ` — ${name}` : ''}`. */
export async function getClientName(clientId?: string | null): Promise<string> {
  if (!clientId) return ''
  try {
    const snap = await getDoc(doc(db, 'clients', clientId))
    return snap.exists() ? ((snap.data() as { companyName?: string }).companyName ?? '') : ''
  } catch {
    return ''
  }
}
