/** Rotina diária — lista única por pessoa (sem variação por dia da semana),
 *  editável via /dailyRoutines/{userId} (ver dailyRoutineItemsService.ts).
 *  Este arquivo só guarda o essencial fixo: quem tem uma rotina padrão
 *  definida por cargo (usado como estado inicial na primeira vez e pelo
 *  botão "Restaurar padrão") e a resolução nome → cargo. Mesmo padrão de
 *  "nomes reais hardcoded" já usado em clientWorkflowTemplates.ts. */

export type RoutinePersonKey = 'bruno' | 'jamilson' | 'ciane' | 'nicolas'

export interface RoutineItem {
  id: string
  text: string
}

/** Resolves the logged-in user's name to one of the 4 defined default
 *  routines — case-insensitive, matches on first name (same convention as
 *  utils/userLookup.findUserIdByName, just in reverse). `undefined` means
 *  this person has no role default — they can still build their own routine
 *  from scratch, they just start with an empty list. */
export function resolveRoutinePersonKey(userName: string): RoutinePersonKey | undefined {
  const name = userName.toLowerCase()
  if (name.includes('bruno')) return 'bruno'
  if (name.includes('jamilson') || name.includes('janilson')) return 'jamilson'
  if (name.includes('ciane')) return 'ciane'
  if (name.includes('nicolas') || name.includes('nícolas')) return 'nicolas'
  return undefined
}

/** Itens padrão por cargo — usados (a) como estado inicial de
 *  /dailyRoutines/{userId} na primeira vez que a pessoa abre a rotina, e
 *  (b) pelo botão "Restaurar padrão" no editor. */
export const DEFAULT_ROUTINE_ITEMS: Record<RoutinePersonKey, string[]> = {
  bruno: [
    'Participar da reunião diária com o time (9h)',
    'Responder mensagens de leads (manhã)',
    'Organizar pipeline de leads na plataforma',
    'Confirmar reuniões de vendas do dia',
    'Responder mensagens e leads (tarde)',
    'Marcar novas reuniões de vendas',
    'Reunião de Sociedade (segunda e sexta)',
  ],
  jamilson: [
    'Participar da reunião diária com o time (9h)',
    'Verificar mensagens sem resposta nos grupos de WhatsApp dos clientes',
    'Atualizar status das tarefas na plataforma',
    'Verificar se há tarefas atrasadas dos clientes',
    'Enviar atualização semanal aos clientes (sexta)',
    'Enviar relatório mensal aos clientes (dia 1)',
  ],
  ciane: [
    'Participar da reunião diária com o time (9h)',
    'Verificar desempenho das campanhas ativas',
    'Atualizar tarefas na plataforma',
    'Overview completo de todos os clientes (segunda)',
    'Revisar pendências da semana (sexta)',
    'Verificar conteúdos aguardando aprovação (sexta)',
  ],
  nicolas: [
    'Participar da reunião diária com o time (9h)',
    'Verificar desempenho das campanhas ativas',
    'Atualizar tarefas na plataforma',
    'Iniciar produção de conteúdos da semana (segunda)',
    'Revisar pendências de produção de conteúdo (sexta)',
    'Verificar conteúdos agendados para próxima semana (sexta)',
  ],
}

function makeId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `item-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Materializa os itens padrão do cargo com ids novos — usado tanto pra
 *  criar o documento na primeira vez quanto pelo "Restaurar padrão". */
export function materializeDefaultRoutine(personKey: RoutinePersonKey): RoutineItem[] {
  return DEFAULT_ROUTINE_ITEMS[personKey].map((text) => ({ id: makeId(), text }))
}
