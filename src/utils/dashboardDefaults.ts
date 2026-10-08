import type { AppUser } from '../types/user'
import type { DashboardWidgetConfig } from '../types/dashboardLayout'
import type { DashboardArea } from '../types/teamMember'
import { resolveRoutinePersonKey, type RoutinePersonKey } from '../services/dailyRoutineTemplates'

/** Widgets numa lista curta, na ordem pedida — vira DashboardWidgetConfig[]
 *  com `order` sequencial (1, 2, 3...) e `visible: true`. */
function layout(entries: [DashboardWidgetConfig['id'], DashboardWidgetConfig['width']][]): DashboardWidgetConfig[] {
  return entries.map(([id, width], i) => ({ id, visible: true, order: i + 1, width }))
}

const BRUNO_LAYOUT = layout([
  ['rotina', 'full'],
  ['rotina_equipe', 'full'],
  ['otimizacoes_equipe', 'full'],
  ['tarefas_equipe', 'full'],
  ['consultorias_mes', 'full'],
  ['tarefas_atrasadas', 'full'],
  ['proximas_7dias', 'full'],
  ['resumo_clientes', 'full'],
  ['registrar_upsell', 'half'],
  ['relatorio_semanal_equipe', 'half'],
])

const JAMILSON_LAYOUT = layout([
  ['rotina', 'full'],
  ['consultorias_mes', 'full'],
  ['tarefas_hoje', 'half'],
  ['tarefas_atrasadas', 'half'],
  ['proximas_publicacoes', 'full'],
  ['aniversarios', 'full'],
])

const GESTORES_LAYOUT = layout([
  ['rotina', 'full'],
  ['relatorios_semanais', 'full'],
  ['otimizacoes', 'full'],
  ['otimizacoes_equipe', 'full'],
  ['conteudos_produzir', 'full'],
  ['tarefas_atrasadas', 'half'],
  ['tarefas_hoje', 'half'],
  ['proximas_publicacoes', 'full'],
  ['resumo_clientes', 'full'],
])

const SDR_LAYOUT = layout([
  ['rotina', 'full'],
  ['tarefas_hoje', 'half'],
  ['tarefas_atrasadas', 'half'],
  ['proximas_7dias', 'full'],
  ['nova_tarefa', 'half'],
  ['aniversarios', 'half'],
])

const CLOSER_LAYOUT = layout([
  ['rotina', 'full'],
  ['tarefas_hoje', 'half'],
  ['tarefas_atrasadas', 'half'],
  ['proximas_7dias', 'full'],
  ['registrar_upsell', 'half'],
  ['nova_tarefa', 'half'],
])

/** Pessoa nova sem layout pelo nome cai no layout da área dela. */
const AREA_LAYOUTS: Record<DashboardArea, DashboardWidgetConfig[]> = {
  comercial: BRUNO_LAYOUT,
  gestor_trafego: GESTORES_LAYOUT,
  cs: JAMILSON_LAYOUT,
  sdr: SDR_LAYOUT,
  closer: CLOSER_LAYOUT,
}

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

/** Widgets criados depois que a pessoa já tinha salvo o próprio layout —
 *  entram no fim do layout salvo de quem tem esse widget no padrão do cargo
 *  (ver useUserDashboardLayout). Widget que a pessoa removeu continua no
 *  array salvo com `visible: false`, então nunca reaparece sozinho. */
const LATE_ADDED_WIDGETS: DashboardWidgetConfig['id'][] = ['consultorias_mes', 'otimizacoes_equipe']

export function withLateAddedWidgets(
  saved: DashboardWidgetConfig[],
  profile: Pick<AppUser, 'name'> | null | undefined,
  area?: DashboardArea
): DashboardWidgetConfig[] {
  const savedIds = new Set(saved.map((w) => w.id))
  const missing = getDefaultLayout(profile, area).filter((w) => LATE_ADDED_WIDGETS.includes(w.id) && !savedIds.has(w.id))
  if (missing.length === 0) return saved
  const maxOrder = saved.reduce((max, w) => Math.max(max, w.order), 0)
  return [...saved, ...missing.map((w, i) => ({ ...w, order: maxOrder + i + 1 }))]
}

export function getDefaultLayout(profile: Pick<AppUser, 'name'> | null | undefined, area?: DashboardArea): DashboardWidgetConfig[] {
  const key = profile ? resolveRoutinePersonKey(profile.name) : undefined
  if (key) return DEFAULT_LAYOUTS[key]
  return area ? AREA_LAYOUTS[area] : DEFAULT_LAYOUTS.default
}
