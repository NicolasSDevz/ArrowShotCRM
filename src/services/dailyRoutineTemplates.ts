/** Rotina diária — lista única por pessoa editável via /dailyRoutines/{userId}
 *  (ver dailyRoutineItemsService.ts). "Única" quer dizer: um documento só,
 *  sem duplicar por dia da semana — mas um item ainda pode ficar marcado
 *  pra só aparecer em certos dias na "Rotina de hoje" do Dashboard (ver
 *  `days`/`monthlyDay1` abaixo e filterRoutineItemsForDate). O editor (modal
 *  do Dashboard e ficha em Equipe) sempre mostra a lista inteira, sem esse
 *  filtro — só o widget "Rotina de hoje" filtra. Este arquivo guarda o
 *  essencial fixo: quem tem uma rotina padrão por cargo (estado inicial e
 *  botão "Restaurar padrão") e a resolução nome → cargo. Mesmo padrão de
 *  "nomes reais hardcoded" já usado em clientWorkflowTemplates.ts. */

export type RoutinePersonKey = 'bruno' | 'jamilson' | 'ciane' | 'nicolas'

export interface RoutineItem {
  id: string
  text: string
  /** Dias da semana em que aparece na "Rotina de hoje" (0=domingo … 6=sábado).
   *  Vazio/undefined = todo dia. */
  days?: number[]
  /** Só aparece no dia 1 do mês (relatório mensal) — ignora `days` quando true. */
  monthlyDay1?: boolean
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

interface DefaultRoutineItemSeed {
  text: string
  days?: number[]
  monthlyDay1?: boolean
}

const WEEKDAYS = [1, 2, 3, 4, 5]
const MONDAY = [1]
const FRIDAY = [5]

/** Itens padrão por cargo — usados (a) como estado inicial de
 *  /dailyRoutines/{userId} na primeira vez que a pessoa abre a rotina, e
 *  (b) pelo botão "Restaurar padrão" no editor. */
export const DEFAULT_ROUTINE_ITEMS: Record<RoutinePersonKey, DefaultRoutineItemSeed[]> = {
  bruno: [
    { text: 'Participar da reunião diária com o time (9h)', days: WEEKDAYS },
    { text: 'Responder mensagens de leads (manhã)', days: WEEKDAYS },
    { text: 'Organizar pipeline de leads na plataforma', days: WEEKDAYS },
    { text: 'Confirmar reuniões de vendas do dia', days: WEEKDAYS },
    { text: 'Responder mensagens e leads (tarde)', days: WEEKDAYS },
    { text: 'Marcar novas reuniões de vendas', days: WEEKDAYS },
    { text: 'Reunião de Sociedade (segunda e sexta)', days: [1, 5] },
  ],
  jamilson: [
    { text: 'Participar da reunião diária com o time (9h)', days: WEEKDAYS },
    { text: 'Verificar mensagens sem resposta nos grupos de WhatsApp dos clientes', days: WEEKDAYS },
    { text: 'Atualizar status das tarefas na plataforma', days: WEEKDAYS },
    { text: 'Verificar se há tarefas atrasadas dos clientes', days: WEEKDAYS },
    { text: 'Enviar atualização semanal aos clientes (sexta)', days: FRIDAY },
    { text: 'Enviar relatório mensal aos clientes (dia 1)', monthlyDay1: true },
  ],
  ciane: [
    { text: 'Participar da reunião diária com o time (9h)', days: WEEKDAYS },
    { text: 'Verificar desempenho das campanhas ativas', days: WEEKDAYS },
    { text: 'Atualizar tarefas na plataforma', days: WEEKDAYS },
    { text: 'Overview completo de todos os clientes (segunda)', days: MONDAY },
    { text: 'Revisar pendências da semana (sexta)', days: FRIDAY },
    { text: 'Verificar conteúdos aguardando aprovação (sexta)', days: FRIDAY },
  ],
  nicolas: [
    { text: 'Participar da reunião diária com o time (9h)', days: WEEKDAYS },
    { text: 'Verificar desempenho das campanhas ativas', days: WEEKDAYS },
    { text: 'Atualizar tarefas na plataforma', days: WEEKDAYS },
    { text: 'Iniciar produção de conteúdos da semana (segunda)', days: MONDAY },
    { text: 'Revisar pendências de produção de conteúdo (sexta)', days: FRIDAY },
    { text: 'Verificar conteúdos agendados para próxima semana (sexta)', days: FRIDAY },
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
  return DEFAULT_ROUTINE_ITEMS[personKey].map((seed) => ({
    id: makeId(),
    text: seed.text,
    days: seed.days,
    monthlyDay1: seed.monthlyDay1,
  }))
}

/** Itens visíveis hoje — usado só pelo widget "Rotina de hoje" do Dashboard.
 *  O editor (modal e ficha em Equipe) sempre mostra a lista inteira, sem
 *  esse filtro, senão daria pra editar um item de segunda só numa segunda. */
export function filterRoutineItemsForDate(items: RoutineItem[], date: Date): RoutineItem[] {
  const weekday = date.getDay()
  const isFirstOfMonth = date.getDate() === 1
  return items.filter((item) => {
    if (item.monthlyDay1) return isFirstOfMonth
    if (item.days && item.days.length > 0) return item.days.includes(weekday)
    return true
  })
}
