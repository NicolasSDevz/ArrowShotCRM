import type { ReactNode } from 'react'
import type { DashboardWidgetId } from '../../types/dashboardLayout'
import type { DashboardWidgetSharedData } from './dashboardWidgetTypes'
import { DailyRoutineWidget } from './DailyRoutineWidget'
import { TeamRoutineTodayWidget } from './TeamRoutineTodayWidget'
import { BirthdayTodayWidget } from './BirthdayTodayWidget'
import { SocialContentWidget } from './SocialContentWidget'
import { OptimizationsTodayWidget } from './OptimizationsTodayWidget'
import { OptimizationsTeamTodayWidget } from './OptimizationsTeamTodayWidget'
import { TeamTasksWidget } from './TeamTasksWidget'
import { WeeklyReportWidget } from './WeeklyReportWidget'
import { OverdueTasksWidget } from './OverdueTasksWidget'
import { TodayTasksWidget } from './TodayTasksWidget'
import { UpcomingTasksWidget } from './UpcomingTasksWidget'
import { InProductionWidget } from './InProductionWidget'
import { WaitingApprovalWidget } from './WaitingApprovalWidget'
import { ApprovedContentWidget } from './ApprovedContentWidget'
import { UpcomingPublicationsWidget } from './UpcomingPublicationsWidget'
import { ClientSummaryWidget } from './ClientSummaryWidget'
import { QuickTaskWidget } from './QuickTaskWidget'

/** Rótulo exibido no card do widget em modo de edição e no painel
 *  "adicionar widget". `conteudos_aprovados` não faz parte da lista pedida
 *  originalmente, mas já existia no dashboard fixo — mantido disponível. */
export const WIDGET_LABEL: Record<DashboardWidgetId, string> = {
  rotina: 'Rotina do dia',
  rotina_equipe: 'Rotina da equipe — hoje',
  relatorios_semanais: 'Envio de Relatórios Semanais',
  otimizacoes: 'Otimizações de hoje',
  otimizacoes_equipe: 'Otimizações de hoje — equipe',
  tarefas_equipe: 'Tarefas da equipe',
  tarefas_atrasadas: 'Tarefas atrasadas',
  tarefas_hoje: 'Tarefas de hoje',
  proximas_7dias: 'Próximas (7 dias)',
  conteudos_produzir: 'Conteúdos para produzir',
  em_producao: 'Em produção (Social Mídia)',
  aguardando_aprovacao: 'Aguardando aprovação',
  conteudos_aprovados: 'Conteúdos aprovados',
  proximas_publicacoes: 'Próximas publicações',
  resumo_clientes: 'Resumo por cliente',
  aniversarios: 'Próximos aniversários',
  nova_tarefa: 'Criar tarefa rápida',
}

export const ALL_WIDGET_IDS = Object.keys(WIDGET_LABEL) as DashboardWidgetId[]

/** Renderiza o conteúdo de um widget pelo id. Widgets que já buscam os
 *  próprios dados (rotina, aniversários, conteúdos pra produzir,
 *  otimizações) ignoram `data`; os de tarefa/conteúdo usam o pacote
 *  compartilhado computado em OperationalDashboard (ver
 *  dashboardWidgetTypes.ts) pra não duplicar listeners do Firestore nem o
 *  drawer compartilhado. */
export function renderDashboardWidget(id: DashboardWidgetId, data: DashboardWidgetSharedData): ReactNode {
  switch (id) {
    case 'rotina':
      return <DailyRoutineWidget />
    case 'rotina_equipe':
      return <TeamRoutineTodayWidget />
    case 'relatorios_semanais':
      return <WeeklyReportWidget />
    case 'otimizacoes':
      return <OptimizationsTodayWidget />
    case 'otimizacoes_equipe':
      return <OptimizationsTeamTodayWidget />
    case 'tarefas_equipe':
      return <TeamTasksWidget />
    case 'conteudos_produzir':
      return <SocialContentWidget />
    case 'aniversarios':
      return <BirthdayTodayWidget />
    case 'nova_tarefa':
      return <QuickTaskWidget clients={data.clients} />
    case 'tarefas_atrasadas':
      return <OverdueTasksWidget tasks={data.buckets.overdue} clientMap={data.clientMap} onOpenTask={data.onOpenTask} />
    case 'tarefas_hoje':
      return (
        <TodayTasksWidget
          tasks={data.buckets.today}
          assigneeMap={data.assigneeMap}
          onOpenTask={data.onOpenTask}
          onAddTask={data.onAddTask}
        />
      )
    case 'proximas_7dias':
      return (
        <UpcomingTasksWidget
          groups={data.upcomingGroups}
          count={data.buckets.upcoming.length}
          clientMap={data.clientMap}
          assigneeMap={data.assigneeMap}
          onOpenTask={data.onOpenTask}
          onAddTask={data.onAddTask}
        />
      )
    case 'em_producao':
      return (
        <InProductionWidget
          contents={data.buckets.inProduction}
          clientMap={data.clientMap}
          onOpenContent={data.onOpenContent}
          onAddContent={data.onAddContent}
        />
      )
    case 'aguardando_aprovacao':
      return (
        <WaitingApprovalWidget
          contents={data.buckets.waitingApproval}
          clientMap={data.clientMap}
          onOpenContent={data.onOpenContent}
          onAddContent={data.onAddContent}
        />
      )
    case 'conteudos_aprovados':
      return <ApprovedContentWidget contents={data.buckets.approved} clientMap={data.clientMap} onOpenContent={data.onOpenContent} />
    case 'proximas_publicacoes':
      return (
        <UpcomingPublicationsWidget contents={data.buckets.nextPublications} clientMap={data.clientMap} onOpenContent={data.onOpenContent} />
      )
    case 'resumo_clientes':
      return <ClientSummaryWidget rows={data.clientSummary} canSeeAllTasks={data.canSeeAllTasks} onNavigateClient={data.onNavigateClient} />
  }
}
