import type { Timestamp } from 'firebase/firestore'
import type { BaseDoc } from './common'
import type { ChecklistItem } from './task'

export interface Trail extends BaseDoc {
  title: string
  description: string
  order: number
}

export interface QuizQuestion {
  id: string
  question: string
  options: string[]
  correctIndex: number
}

/** Minimum quiz score (%) required to mark a module as concluded. */
export const QUIZ_PASS_THRESHOLD = 70

export interface Module extends BaseDoc {
  trailId: string
  title: string
  description: string
  /** Rich text content, rendered as markdown. */
  content: string
  videoUrl?: string
  materialUrl?: string
  checklist: ChecklistItem[]
  quiz: QuizQuestion[]
  order: number
}

/** One doc per (userId, moduleId) — id is `${userId}_${moduleId}`. */
export interface ModuleProgress {
  id: string
  userId: string
  trailId: string
  moduleId: string
  completed: boolean
  quizScore: number
  checklistDone: boolean
  completedAt: Timestamp | null
}

/** Lightweight record of an admin inviting a new hire. Account creation
 *  itself still happens manually in the Firebase Console, same as the rest
 *  of the CRM's onboarding today (see README) — this just tracks intent. */
export interface Invite extends BaseDoc {
  email: string
  status: 'pending' | 'done'
}
