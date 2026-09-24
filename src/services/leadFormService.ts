import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type FirestoreError,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { formatFieldsAnswer } from '../components/leads/leadFormFieldGroups'
import { formatAddressAnswer, OTHER_OPTION_ID, type LeadForm, type LeadFormInput, type LeadFormAnswer, type LeadFormQuestion } from '../types/leadForm'
import type { Lead } from '../types/lead'

const COLLECTION = 'leadForms'

/** Actor usado no createdBy/updatedBy de leads criados pelo formulário
 *  público (sem sessão logada) — mesmo padrão de `client-portal` em
 *  publicApprovalService.ts. */
const FORM_ACTOR = 'lead-form'

const DIACRITICS_RE = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g')

/** "Campanha Black Friday" -> "campanha-black-friday". O id do documento É o
 *  slug: a página pública faz um `get` direto por id (nunca uma query), então
 *  não precisa de índice composto nem de regra de `list` liberada. */
export function slugifyFormName(name: string): string {
  return name
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// ---------------- admin (interno, autenticado) ----------------

export function subscribeLeadForms(onData: (items: LeadForm[]) => void, onError?: (err: FirestoreError) => void) {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as LeadForm)),
    onError
  )
}

export async function getLeadFormById(id: string): Promise<LeadForm | null> {
  const snap = await getDoc(doc(db, COLLECTION, id))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as unknown as LeadForm) : null
}

/** Cria com um id (slug) escolhido explicitamente — não pode já existir.
 *  Devolve false sem gravar nada se o slug já estiver em uso. */
export async function createLeadForm(id: string, data: LeadFormInput, userId: string): Promise<boolean> {
  const ref = doc(db, COLLECTION, id)
  if ((await getDoc(ref)).exists()) return false
  await setDoc(ref, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    updatedBy: userId,
  })
  return true
}

export async function updateLeadForm(id: string, data: Partial<LeadFormInput>, userId: string) {
  await setDoc(doc(db, COLLECTION, id), { ...data, updatedAt: serverTimestamp(), updatedBy: userId }, { merge: true })
}

export async function deleteLeadForm(id: string) {
  await deleteDoc(doc(db, COLLECTION, id))
}

// ---------------- página pública (sem login) ----------------

/** Só devolve o formulário se ele existir E estiver ativo — mesma condição
 *  aplicada em firestore.rules (get liberado só com active == true). Um
 *  formulário desativado ou um id inexistente têm o mesmo retorno (null) pra
 *  não vazar "esse id existe mas está pausado" pra quem só tem o link. */
export async function getPublicLeadForm(id: string): Promise<LeadForm | null> {
  const snap = await getDoc(doc(db, COLLECTION, id))
  if (!snap.exists()) return null
  const form = { id: snap.id, ...snap.data() } as unknown as LeadForm
  return form.active ? form : null
}

function findRoleAnswer(
  questions: LeadFormQuestion[],
  answers: Record<string, string>,
  role: 'name' | 'whatsapp' | 'email' | 'company'
): string | undefined {
  const q = questions.find((item) => item.role === role)
  if (!q) return undefined
  const v = answers[q.id]?.trim()
  return v || undefined
}

/** Envia as respostas do formulário público: cria um Lead novo (status
 *  'new', sem gestor atribuído — Bruno/o time triam manualmente) com as
 *  perguntas marcadas como nome/whatsapp/e-mail/empresa alimentando os
 *  campos fixos do Lead, e todas as respostas guardadas em `formAnswers`
 *  pra aparecerem na ficha. Sem notificação automática: como é uma escrita
 *  anônima, não dá pra resolver quem são os admins (a coleção `users` exige
 *  login pra ler) sem abrir mão de segurança — o lead aparece em tempo real
 *  pra quem já está com o CRM aberto, igual qualquer lead novo. */
/** Texto legível da resposta: perguntas de escolha guardam ids de opção
 *  internamente, mas na ficha do lead o time precisa ler o texto da opção —
 *  e, quando o lead marcou "Outro", o que ele escreveu ("Outro: pintura"). */
function answerToText(q: LeadFormQuestion, raw: string | string[], otherText?: string): string {
  if (q.type === 'fields') return Array.isArray(raw) ? formatFieldsAnswer(q, raw) : raw
  if (q.type === 'address') return Array.isArray(raw) ? formatAddressAnswer(raw) : raw
  if (q.type !== 'single_choice' && q.type !== 'multi_choice') return Array.isArray(raw) ? raw.join(', ') : raw
  const ids = Array.isArray(raw) ? raw : [raw]
  return ids
    .map((id) => {
      if (id === OTHER_OPTION_ID) {
        const label = q.otherLabel?.trim() || 'Outro'
        return otherText?.trim() ? `${label}: ${otherText.trim()}` : label
      }
      return q.options?.find((o) => o.id === id)?.label ?? id
    })
    .join(', ')
}

export async function submitLeadFormResponse(
  form: LeadForm,
  answersByQuestionId: Record<string, string | string[]>,
  otherTexts: Record<string, string> = {}
): Promise<void> {
  const flatAnswers: Record<string, string> = {}
  const formAnswers: LeadFormAnswer[] = []
  for (const q of form.questions) {
    const raw = answersByQuestionId[q.id]
    if (raw === undefined || raw === null) continue
    const value = answerToText(q, raw, otherTexts[q.id])
    if (!value.trim()) continue
    flatAnswers[q.id] = value
    formAnswers.push({ questionId: q.id, label: q.label, value })
  }

  const contactName = findRoleAnswer(form.questions, flatAnswers, 'name') || 'Lead sem nome'
  const whatsapp = findRoleAnswer(form.questions, flatAnswers, 'whatsapp') || ''
  const email = findRoleAnswer(form.questions, flatAnswers, 'email')
  const companyName = findRoleAnswer(form.questions, flatAnswers, 'company')

  const payload: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'> = {
    contactName,
    whatsapp,
    email,
    companyName,
    services: {},
    source: 'form',
    status: 'new',
    order: Date.now(),
    stageChangedAt: Timestamp.now(),
    contactHistory: [],
    sourceFormId: form.id,
    formAnswers,
    createdBy: FORM_ACTOR,
    updatedBy: FORM_ACTOR,
  }

  await addDoc(collection(db, 'leads'), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}
