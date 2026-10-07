import type { AppUser } from '../types/user'
import type { DashboardArea, TeamMember } from '../types/teamMember'
import type { DashboardWidgetId } from '../types/dashboardLayout'
import { resolveRoutinePersonKey } from '../services/dailyRoutineTemplates'

/** O que cada área enxerga no Dashboard (métricas da empresa) e no
 *  Operacional (widgets). Comercial (Bruno) vê tudo; as outras áreas só o
 *  que é do trabalho delas. Filtro só de tela — os dados continuam
 *  protegidos pelas regras do Firestore, não por isto. */

/** Blocos da página Dashboard (OverviewDashboard + catálogo de produtos). */
export type OverviewSectionId =
  | 'alertas_leads'
  | 'alertas_clientes'
  | 'mrr'
  | 'clientes_ativos'
  | 'churn'
  | 'ltv'
  | 'evolucao_mrr'
  | 'receita_gerada'
  | 'entradas_saidas'
  | 'carteira'
  | 'upsell_receita'
  | 'receita_gestor'
  | 'pipeline'
  | 'vendas'
  | 'upsell_card'
  | 'clientes_risco'
  | 'novos_clientes'
  | 'produtos'

const OVERVIEW_BY_AREA: Record<Exclude<DashboardArea, 'comercial'>, OverviewSectionId[]> = {
  gestor_trafego: ['alertas_clientes', 'clientes_ativos', 'carteira', 'clientes_risco', 'novos_clientes'],
  cs: [
    'alertas_clientes',
    'clientes_ativos',
    'churn',
    'entradas_saidas',
    'carteira',
    'upsell_receita',
    'upsell_card',
    'clientes_risco',
    'novos_clientes',
  ],
  sdr: ['alertas_leads', 'pipeline', 'vendas', 'produtos'],
  closer: ['alertas_leads', 'pipeline', 'vendas', 'novos_clientes', 'produtos'],
}

/** Widgets que toda área pode ter no Operacional (rotina e tarefas da própria pessoa). */
const COMMON_WIDGETS: DashboardWidgetId[] = ['rotina', 'tarefas_atrasadas', 'tarefas_hoje', 'proximas_7dias', 'nova_tarefa', 'aniversarios']

const WIDGETS_BY_AREA: Record<Exclude<DashboardArea, 'comercial'>, DashboardWidgetId[]> = {
  gestor_trafego: [
    ...COMMON_WIDGETS,
    'relatorios_semanais',
    'otimizacoes',
    'conteudos_produzir',
    'em_producao',
    'aguardando_aprovacao',
    'conteudos_aprovados',
    'proximas_publicacoes',
    'resumo_clientes',
  ],
  cs: [
    ...COMMON_WIDGETS,
    'consultorias_mes',
    'relatorios_semanais',
    'aguardando_aprovacao',
    'conteudos_aprovados',
    'proximas_publicacoes',
    'resumo_clientes',
    'registrar_upsell',
  ],
  sdr: [...COMMON_WIDGETS],
  closer: [...COMMON_WIDGETS, 'registrar_upsell'],
}

/** Área da pessoa logada: a escolhida na ficha da Equipe; sem ela, deduz
 *  pelo nome (Bruno, Jamilson, Ciane, Nicolas) e depois pela rotina da
 *  ficha. `undefined` = sem área definida → vê tudo (como era antes). */
export function resolveDashboardArea(
  profile: Pick<AppUser, 'id' | 'name'> | null | undefined,
  teamMembers: TeamMember[]
): DashboardArea | undefined {
  if (!profile) return undefined
  const member = teamMembers.find((m) => m.userId === profile.id)
  if (member?.area) return member.area
  switch (resolveRoutinePersonKey(profile.name)) {
    case 'bruno':
      return 'comercial'
    case 'jamilson':
      return 'cs'
    case 'ciane':
    case 'nicolas':
      return 'gestor_trafego'
  }
  switch (member?.routineKey) {
    case 'cs':
      return 'cs'
    case 'gestor_trafego':
      return 'gestor_trafego'
    case 'sdr':
      return 'sdr'
    case 'closer':
      return 'closer'
  }
  return undefined
}

export function canSeeOverviewSection(area: DashboardArea | undefined, section: OverviewSectionId): boolean {
  if (!area || area === 'comercial') return true
  return OVERVIEW_BY_AREA[area].includes(section)
}

export function isWidgetAllowed(area: DashboardArea | undefined, id: DashboardWidgetId): boolean {
  if (!area || area === 'comercial') return true
  return WIDGETS_BY_AREA[area].includes(id)
}
