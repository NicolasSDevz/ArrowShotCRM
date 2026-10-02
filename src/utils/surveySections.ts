import type { SurveyQuestion } from '../types'

/** Agrupa as perguntas pela seção, mantendo a ordem em que aparecem. */
export function groupBySection(questions: SurveyQuestion[]) {
  const groups: { section: string; questions: SurveyQuestion[] }[] = []
  for (const q of questions) {
    const last = groups[groups.length - 1]
    if (last && last.section === q.section) last.questions.push(q)
    else groups.push({ section: q.section, questions: [q] })
  }
  return groups
}
