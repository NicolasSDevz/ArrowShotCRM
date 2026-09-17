const CELEBRATION_KEYWORDS = ['questionário', 'prova', 'atividade', 'exercício', 'quiz']

const MOTIVATIONAL_MESSAGES = [
  '🎓 Arrasou! Mais uma etapa concluída!',
  '🏆 Missão cumprida! Você é incrível!',
  '✨ Questionário concluído! Continue voando alto!',
  '🚀 Mais uma conquista! Orgulho total!',
  '🎉 Isso! Cada passo conta na sua jornada!',
]

export const TASK_CELEBRATION_EVENT = 'arrowshot:task-celebration'

/** Título contém alguma das palavras-chave de questionário/prova/atividade
 *  (case insensitive) — ver TAREFA 2. */
export function isCelebratoryTaskTitle(title: string): boolean {
  const normalized = title.toLowerCase()
  return CELEBRATION_KEYWORDS.some((keyword) => normalized.includes(keyword))
}

/** Dispara o evento global que o TaskCelebrationOverlay escuta — desacoplado
 *  de onde a conclusão aconteceu (TaskDrawer, ChecklistEditor...). Sorteia
 *  uma das mensagens motivadoras. */
export function triggerTaskCelebration() {
  if (typeof window === 'undefined') return
  const message = MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)]
  window.dispatchEvent(new CustomEvent<{ message: string }>(TASK_CELEBRATION_EVENT, { detail: { message } }))
}
