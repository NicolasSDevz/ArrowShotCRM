import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
  type FirestoreError,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { collectionService } from './firestore'
import type { SurveyResponse, TeamSurvey } from '../types'

const COLLECTION = 'teamSurveys'
const surveys = collectionService<TeamSurvey>(COLLECTION)

export const createTeamSurvey = surveys.create
export const updateTeamSurvey = surveys.update

export function subscribeTeamSurveys(onData: (items: TeamSurvey[]) => void, onError?: (err: FirestoreError) => void) {
  return surveys.subscribe([orderBy('createdAt', 'desc')], onData, onError)
}

/** true quando este usuário já respondeu a rodada (marca em participants/{uid}). */
export function subscribeAnswered(surveyId: string, uid: string, onData: (answered: boolean) => void) {
  return onSnapshot(
    doc(db, COLLECTION, surveyId, 'participants', uid),
    (snap) => onData(snap.exists()),
    (err) => {
      console.error('[avaliação] participação', err)
      onData(false)
    }
  )
}

/** Envia a resposta anônima e marca a participação no MESMO batch (as regras
 *  exigem os dois juntos). A resposta não leva uid, nome nem horário, e o id
 *  é aleatório — não há como ligar uma à outra. */
export async function submitSurveyResponse(surveyId: string, uid: string, answers: SurveyResponse['answers']) {
  const batch = writeBatch(db)
  batch.set(doc(collection(db, COLLECTION, surveyId, 'responses')), { answers })
  batch.set(doc(db, COLLECTION, surveyId, 'participants', uid), { answered: true })
  await batch.commit()
}

/** Só o admin lê (regras). */
export function subscribeSurveyResponses(
  surveyId: string,
  onData: (items: SurveyResponse[]) => void,
  onError?: (err: FirestoreError) => void
) {
  return onSnapshot(
    collection(db, COLLECTION, surveyId, 'responses'),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SurveyResponse, 'id'>) }))),
    (err) => {
      console.error('[avaliação] respostas', err)
      onError?.(err)
    }
  )
}

/** Quantas pessoas já responderam (só o número — a tela nunca mostra quem). */
export function subscribeParticipantCount(surveyId: string, onData: (count: number) => void) {
  return onSnapshot(
    query(collection(db, COLLECTION, surveyId, 'participants')),
    (snap) => onData(snap.size),
    (err) => {
      console.error('[avaliação] participantes', err)
      onData(0)
    }
  )
}

export async function setSurveyStatus(id: string, status: TeamSurvey['status'], userId: string) {
  await surveys.update(id, { status }, userId)
}

/** Apaga a rodada com as respostas e as marcas de participação. */
export async function deleteTeamSurvey(id: string) {
  const [responses, participants] = await Promise.all([
    getDocs(collection(db, COLLECTION, id, 'responses')),
    getDocs(collection(db, COLLECTION, id, 'participants')),
  ])
  const batch = writeBatch(db)
  responses.docs.forEach((d) => batch.delete(d.ref))
  participants.docs.forEach((d) => batch.delete(d.ref))
  batch.delete(doc(db, COLLECTION, id))
  await batch.commit()
}

