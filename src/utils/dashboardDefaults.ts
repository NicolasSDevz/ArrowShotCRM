import type { AppUser } from '../types/user'
import type { DashboardWidgetConfig } from '../types/dashboardLayout'
import { resolveRoutinePersonKey, type RoutinePersonKey } from '../services/dailyRoutineTemplates'

/** Widgets numa lista curta, na ordem pedida — vira DashboardWidgetConfig[]
 *  com `order` sequencial (1, 2, 3...) e `visible: true`. */
function layout(entries: [DashboardWidgetConfig['id'], DashboardWidgetConfig['width']][]): DashboardWidgetConfig[] {
  return entries.map(([id, width], i) => ({ id, visible: true, order: i + 1, width }))
}

const BRUNO_LAYOUT = layout([
  ['nova_tarefa', 'half'],
  ['resumo_clientes', 'half'],
  ['tarefas_atrasadas', 'full'],
  ['proximas_7dias', 'full'],
])

const JAMILSON_LAYOUT = layout([
  ['rotina', 'full'],
  ['tarefas_hoje', 'half'],
  ['tarefas_atrasadas', 'half'],
  ['proximas_publicacoes', 'full'],
  ['aniversarios', 'full'],
])

const GESTORES_LAYOUT = layout([
  ['rotina', 'full'],
  ['otimizacoes', 'full'],
  ['conteudos_produzir', 'full'],
  ['tarefas_atrasadas', 'half'],
  ['tarefas_hoje', 'half'],
  ['proximas_publicacoes', 'full'],
  ['resumo_clientes', 'full'],
])

/** `default` cobre qualquer perfil que não bata com nenhum dos 4 nomes
 *  (colaborador(a) novo(a), etc.) — usa o layout de Gestores como o mais
 *  genérico/completo dos três. */
const DEFAULT_LAYOUTS: Record<RoutinePersonKey | 'default', DashboardWidgetConfig[]> = {
  bruno: BRUNO_LAYOUT,
  jamilson: JAMILSON_LAYOUT,
  ciane: GESTORES_LAYOUT,
  nicolas: GESTORES_LAYOUT,
  default: GESTORES_LAYOUT,
}

export function getDefaultLayout(profile: Pick<AppUser, 'name'> | null | undefined): DashboardWidgetConfig[] {
  const key = profile ? resolveRoutinePersonKey(profile.name) : undefined
  return DEFAULT_LAYOUTS[key ?? 'default']
}
