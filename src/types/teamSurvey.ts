import type { Timestamp } from 'firebase/firestore'

/** Tipo de pergunta da avaliação da equipe:
 *  - scale: nota de 1 a 5 (com rótulo do 1 e do 5)
 *  - nps: nota de 0 a 10 ("você indicaria a empresa…") — vira o eNPS
 *  - text: resposta escrita, sempre opcional */
export type SurveyQuestionKind = 'scale' | 'nps' | 'text'

export interface SurveyQuestion {
  id: string
  section: string
  text: string
  kind: SurveyQuestionKind
  /** Só scale: o que significa o 1 e o 5. */
  minLabel?: string
  maxLabel?: string
}

export type SurveyStatus = 'open' | 'closed'

/** Rodada da "Avaliação de desempenho e satisfação" (teamSurveys/{id}).
 *  As respostas ficam em teamSurveys/{id}/responses SEM uid nem horário —
 *  ninguém, nem o admin, consegue ligar uma resposta a uma pessoa. Quem já
 *  respondeu fica só marcado em teamSurveys/{id}/participants/{uid} (pra não
 *  responder duas vezes), sem guardar o que respondeu. */
export interface TeamSurvey {
  id: string
  title: string
  description?: string
  questions: SurveyQuestion[]
  status: SurveyStatus
  createdAt: Timestamp
  createdBy: string
  updatedAt: Timestamp
  updatedBy: string
}

/** Resposta anônima: só o mapa pergunta → nota/texto. */
export interface SurveyResponse {
  id: string
  answers: Record<string, number | string>
}

/** Resultado só aparece com pelo menos esse número de respostas — numa equipe
 *  pequena, com 1 ou 2 respostas daria pra adivinhar quem foi. */
export const SURVEY_MIN_RESPONSES = 3

const AGREE = { minLabel: 'Discordo totalmente', maxLabel: 'Concordo totalmente' }

/** Perguntas padrão de cada rodada (o admin pode editar antes de abrir). */
export const DEFAULT_SURVEY_QUESTIONS: SurveyQuestion[] = [
  { id: 'q1', section: 'Satisfação', kind: 'scale', text: 'De forma geral, estou satisfeito(a) trabalhando aqui.', ...AGREE },
  { id: 'q2', section: 'Satisfação', kind: 'scale', text: 'Eu gosto das tarefas que faço no dia a dia.', ...AGREE },
  { id: 'q3', section: 'Satisfação', kind: 'scale', text: 'Me sinto valorizado(a) pelo trabalho que entrego.', ...AGREE },
  { id: 'q4', section: 'Satisfação', kind: 'nps', text: 'De 0 a 10, o quanto você indicaria a empresa como um bom lugar para trabalhar a um amigo?' },
  { id: 'q5', section: 'Equipe e ambiente', kind: 'scale', text: 'A comunicação dentro da equipe é clara.', ...AGREE },
  { id: 'q6', section: 'Equipe e ambiente', kind: 'scale', text: 'Me sinto respeitado(a) e ouvido(a) pela equipe.', ...AGREE },
  { id: 'q7', section: 'Equipe e ambiente', kind: 'scale', text: 'Tenho as ferramentas e informações de que preciso para fazer bem o meu trabalho.', ...AGREE },
  { id: 'q8', section: 'Liderança', kind: 'scale', text: 'Recebo retorno (feedback) sobre o meu trabalho com a frequência que gostaria.', ...AGREE },
  { id: 'q9', section: 'Liderança', kind: 'scale', text: 'Confio nas decisões da liderança.', ...AGREE },
  { id: 'q10', section: 'Desempenho', kind: 'scale', text: 'Sei com clareza o que é esperado do meu trabalho.', ...AGREE },
  { id: 'q11', section: 'Desempenho', kind: 'scale', text: 'Como você avalia o seu próprio desempenho neste período?', minLabel: 'Muito abaixo do que posso', maxLabel: 'Excelente' },
  { id: 'q12', section: 'Desempenho', kind: 'scale', text: 'Como está a sua carga de trabalho?', minLabel: 'Muito pesada', maxLabel: 'Tranquila, dá conta' },
  { id: 'q13', section: 'Crescimento', kind: 'scale', text: 'Vejo oportunidade de aprender e crescer aqui.', ...AGREE },
  { id: 'q14', section: 'Comentários', kind: 'text', text: 'O que você mais gosta de trabalhar aqui?' },
  { id: 'q15', section: 'Comentários', kind: 'text', text: 'O que mais atrapalha ou incomoda no seu dia a dia?' },
  { id: 'q16', section: 'Comentários', kind: 'text', text: 'Se você pudesse mudar uma coisa na empresa, o que seria?' },
  { id: 'q17', section: 'Comentários', kind: 'text', text: 'Quer dizer mais alguma coisa? (espaço livre)' },
]
