import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { isPast } from 'date-fns'
import { useClients } from './useClients'
import { useAllTasks } from './useTasks'
import { useClientOptimizations } from './useOptimizations'
import { useClientSuccessEvaluations } from './useClientSuccessEvaluations'
import { useTaskVisibility, filterVisibleTasks } from '../utils/taskVisibility'
import { metaTotals, googleTotals } from '../utils/campaignPlanningStats'
import { CLIENT_STATUS_LABEL } from '../types/client'
import type { AiPageContext } from '../types/ai'

const CLIENT_ROUTE = /^\/clientes\/([^/]+)/

/** Monta o contexto automático da página atual pro assistente de IA —
 *  reaproveita hooks já usados em outros pontos do app (mesmos listeners do
 *  Firestore, sem nenhuma leitura nova) pra não duplicar custo/latência.
 *  Chamado sempre no topo do componente (AiAssistantWidget é montado uma vez
 *  em AppLayout), então os hooks de "cliente" recebem clientId vazio quando
 *  a rota não é de cliente — retornam listas vazias nesse caso, sem erro. */
export function useAiPageContext(): AiPageContext {
  const location = useLocation()
  const { data: clients } = useClients()
  const { data: tasks } = useAllTasks()
  const { canSeeAllTasks, viewerId } = useTaskVisibility()

  const clientMatch = location.pathname.match(CLIENT_ROUTE)
  const clientId = clientMatch?.[1] ?? ''
  const { data: optimizations } = useClientOptimizations(clientId || undefined)
  const { data: successEvaluations } = useClientSuccessEvaluations(clientId)

  return useMemo(() => {
    // ---------- Ficha de cliente ----------
    if (clientId) {
      const client = clients.find((c) => c.id === clientId)
      if (client) {
        const planning = client.campaignPlanning
        const briefing = client.paidTrafficBriefing
        const latestSuccess = [...successEvaluations].sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth))[0]
        const recentOptimizations = [...optimizations]
          .sort((a, b) => b.date.toMillis() - a.date.toMillis())
          .slice(0, 3)
          .map((o) => ({
            data: o.date.toDate().toISOString().slice(0, 10),
            plataformas: o.platforms,
            resumo: o.optimizationsText,
          }))

        return {
          type: 'client',
          label: client.companyName,
          data: {
            cliente: client.companyName,
            segmento: client.segment || null,
            status: CLIENT_STATUS_LABEL[client.status],
            servicosContratados: client.modules || {},
            planejamentoMetaAds: planning?.metaAds
              ? { verbaMensal: planning.metaAds.verbaMensal ?? null, ...metaTotals(planning.metaAds) }
              : null,
            planejamentoGoogleAds: planning?.googleAds
              ? { verbaMensal: planning.googleAds.verbaMensal ?? null, ...googleTotals(planning.googleAds) }
              : null,
            briefing: briefing?.filledAt
              ? {
                  resultadoEsperado: briefing.resultadoEsperado || null,
                  ticketMedio: briefing.ticketMedio ?? null,
                  faturamentoMensal: briefing.faturamentoMensal ?? null,
                  desafiosAtuais: briefing.desafiosAtuais || null,
                  publicoAlvo: briefing.b2cDorPrincipal || briefing.b2bSetor || null,
                }
              : null,
            otimizacoesRecentes: recentOptimizations,
            scoreSucesso: latestSuccess ? { nota: latestSuccess.score, faixa: latestSuccess.tier, mes: latestSuccess.referenceMonth } : null,
          },
          suggestedQuestions: [
            'Como está a performance dessa semana?',
            'Quais campanhas estão com melhor CPL?',
            'Sugestões de otimização para esse cliente',
            'Resumo do briefing desse cliente',
          ],
        }
      }
    }

    // ---------- Métricas — Meta/Google Ads ----------
    if (location.pathname.startsWith('/metricas')) {
      const metaClients = clients.filter((c) => c.status !== 'churned' && (c.modules?.metaAds || c.modules?.paidTraffic))
      const googleClients = clients.filter((c) => c.status !== 'churned' && c.modules?.googleAds)
      return {
        type: 'meta_ads',
        label: 'Métricas',
        data: {
          nota: 'Sem número de performance ao vivo aqui — só a lista de clientes ativos por plataforma. Peça o número específico se precisar (o assistente não tem acesso automático ao Meta/Google Ads Insights ainda).',
          clientesMetaAds: metaClients.map((c) => c.companyName),
          clientesGoogleAds: googleClients.map((c) => c.companyName),
        },
        suggestedQuestions: [
          'Qual cliente tem melhor ROAS essa semana?',
          'Comparar performance dos últimos 30 dias',
        ],
      }
    }

    // ---------- Dashboard / Operacional ----------
    if (location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/operacional')) {
      const activeClients = clients.filter((c) => c.status === 'active')
      const mrr = activeClients.reduce((sum, c) => sum + (c.monthlyValue || 0), 0)
      const visibleTasks = filterVisibleTasks(tasks, canSeeAllTasks, viewerId)
      const overdueTasks = visibleTasks.filter((t) => t.status !== 'done' && t.dueDate && isPast(t.dueDate.toDate()))
      return {
        type: 'dashboard',
        label: 'Dashboard',
        data: {
          clientesAtivos: activeClients.length,
          mrrEstimado: mrr,
          tarefasAtrasadas: overdueTasks.length,
          exemplosTarefasAtrasadas: overdueTasks.slice(0, 5).map((t) => t.title),
        },
        suggestedQuestions: [
          'Quais clientes precisam de atenção hoje?',
          'Resumo das otimizações dessa semana',
          'Quais clientes estão em risco de churn?',
        ],
      }
    }

    // ---------- Genérico ----------
    return {
      type: 'generic',
      label: 'Quiver',
      data: { pagina: location.pathname },
      suggestedQuestions: [
        'Quais clientes precisam de atenção hoje?',
        'Resumo das otimizações dessa semana',
      ],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, clients, tasks, optimizations, successEvaluations, clientId, canSeeAllTasks, viewerId])
}
