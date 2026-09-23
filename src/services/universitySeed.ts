import { getDocs } from 'firebase/firestore'
import { createTrail } from './trailService'
import { createModule } from './moduleService'
import type { QuizQuestion } from '../types'
import { collectionService } from './firestore'
import type { Trail } from '../types'

/** Placeholder quiz — every seeded module gets one so "Concluir módulo" is
 *  reachable immediately; an admin should replace the question text with
 *  something specific to the real content once it's written. */
function placeholderQuiz(moduleTitle: string): QuizQuestion[] {
  return [
    {
      id: crypto.randomUUID(),
      question: `Qual é o principal objetivo do módulo "${moduleTitle}"?`,
      options: ['Ainda não definido — edite esta pergunta', 'Opção B', 'Opção C', 'Opção D'],
      correctIndex: 0,
    },
    {
      id: crypto.randomUUID(),
      question: 'Pergunta 2 (edite no painel admin)',
      options: ['Opção A', 'Opção B', 'Opção C', 'Opção D'],
      correctIndex: 0,
    },
    {
      id: crypto.randomUUID(),
      question: 'Pergunta 3 (edite no painel admin)',
      options: ['Opção A', 'Opção B', 'Opção C', 'Opção D'],
      correctIndex: 0,
    },
  ]
}

const TRAILS: { title: string; description: string; modules: string[] }[] = [
  {
    title: 'Onboarding Geral',
    description: 'Todo funcionário faz primeiro — visão geral da agência, ferramentas, comunicação e cultura.',
    modules: ['Sobre a Agência', 'Ferramentas e Sistemas', 'Comunicação Interna', 'Cultura e Padrões'],
  },
  {
    title: 'Social Mídia',
    description: 'Processos do serviço de Social Mídia, da produção à entrega ao cliente.',
    modules: [
      'Visão Geral do Serviço',
      'Identidade Visual e Catálogos',
      'Gestão de Tarefas',
      'Produção de Conteúdo',
      'Gestão de Clientes',
      'Comunicação e Entrega',
    ],
  },
  {
    title: 'Tráfego Pago',
    description: 'Processos do serviço de Tráfego Pago, de estratégia a relatórios.',
    modules: [
      'Visão Geral do Serviço',
      'Estratégia e Estrutura de Campanhas',
      'Gestão de Contas',
      'Rastreamento e Dados',
      'Relatórios e Clientes',
    ],
  },
  {
    title: 'Gestão e Liderança',
    description: 'Processos de gestão de equipe, clientes, qualidade e crescimento.',
    modules: ['Gestão de Equipe', 'Gestão de Clientes', 'Processos e Qualidade', 'Crescimento e Escala'],
  },
]

/** Idempotent — no-ops if any trail already exists, so it's safe to trigger
 *  more than once from the Admin panel. */
export async function seedInitialTrails(userId: string) {
  const trailsCol = collectionService<Trail>('trails')
  const existing = await getDocs(trailsCol.colRef)
  if (!existing.empty) return { seeded: false as const }

  for (let t = 0; t < TRAILS.length; t++) {
    const trail = TRAILS[t]
    const trailId = await createTrail({ title: trail.title, description: trail.description, order: t }, userId)

    for (let m = 0; m < trail.modules.length; m++) {
      const title = trail.modules[m]
      await createModule(
        {
          trailId,
          title,
          description: 'Conteúdo a ser preenchido pelo time.',
          content: `# ${title}\n\nConteúdo ainda não escrito — edite este módulo no painel admin da Universidade Quiver.`,
          checklist: [{ id: crypto.randomUUID(), text: 'Revisar o conteúdo deste módulo', done: false }],
          quiz: placeholderQuiz(title),
          order: m,
        },
        userId
      )
    }
  }

  return { seeded: true as const }
}
