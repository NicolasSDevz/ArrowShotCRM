import { useCallback, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { isPast } from 'date-fns'
import { useClients } from './useClients'
import { useAllTasks } from './useTasks'
import { useClientOptimizations } from './useOptimizations'
import { useClientSuccessEvaluations } from './useClientSuccessEvaluations'
import { useTaskVisibility, filterVisibleTasks } from '../utils/taskVisibility'
import { metaTotals, googleTotals } from '../utils/campaignPlanningStats'
import { fetchMetaAgencyOverview } from '../services/metaAgencyService'
import { getGoogleAdsInsights } from '../services/googleAdsApi'
import { CLIENT_STATUS_LABEL, type Client } from '../types/client'
import type { AiPageContext } from '../types/ai'

const CLIENT_ROUTE = /^\/clientes\/([^/]+)/

/** Contexto que qualquer conversa carrega, não importa a página — dá pro
 *  assistente noção da agência inteira (não só de quem está na tela),
 *  então ele consegue responder sobre outro cliente que não o da página
 *  atual sem inventar dado. Lista compacta de propósito (nome, status,
 *  serviços) — detalhe fino (briefing, otimizações) só entra quando o
 *  contexto é especificamente daquele cliente (ver ramo "Ficha de cliente"). */
function buildAgencyOverview(clients: Client[]) {
  const active = clients.filter((c) => c.status === 'active')
  const byStatus: Record<string, number> = {}
  for (const c of clients) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1
  return {
    totalClientes: clients.length,
    clientesPorStatus: byStatus,
    mrrEstimado: active.reduce((sum, c) => sum + (c.monthlyValue || 0), 0),
    carteiraDeClientes: clients
      .filter((c) => c.status !== 'churned')
      .map((c) => ({
        nome: c.companyName,
        status: CLIENT_STATUS_LABEL[c.status],
        servicos: Object.entries(c.modules || {})
          .filter(([, v]) => v)
          .map(([k]) => k),
      })),
  }
}

function last30dRange() {
  const to = new Date()
  to.setDate(to.getDate() - 1)
  const from = new Date(to)
  from.setDate(from.getDate() - 29)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { dateFrom: iso(from), dateTo: iso(to) }
}

/** Monta o contexto automático da página atual pro assistente de IA —
 *  reaproveita hooks já usados em outros pontos do app (mesmos listeners do
 *  Firestore, sem nenhuma leitura nova) pra não duplicar custo/latência.
 *  Chamado sempre no topo do componente (AiAssistantWidget é montado uma vez
 *  em AppLayout), então os hooks de "cliente" recebem clientId vazio quando
 *  a rota não é de cliente — retornam listas vazias nesse caso, sem erro.
 *
 *  `context` já vem pronto (síncrono, dados que o app já tem carregados).
 *  `resolveContext()` é chamado na hora de mandar a mensagem — só ele busca
 *  dado "ao vivo" (Meta/Google Ads Insights), porque isso custa uma chamada
 *  de rede de verdade e não faz sentido repetir a cada re-render. */
export function useAiPageContext(): { context: AiPageContext; resolveContext: () => Promise<AiPageContext> } {
  const location = useLocation()
  const { data: clients } = useClients()
  const { data: tasks } = useAllTasks()
  const { canSeeAllTasks, viewerId } = useTaskVisibility()

  const clientMatch = location.pathname.match(CLIENT_ROUTE)
  const clientId = clientMatch?.[1] ?? ''
  const { data: optimizations } = useClientOptimizations(clientId || undefined)
  const { data: successEvaluations } = useClientSuccessEvaluations(clientId)

  const agencyOverview = useMemo(() => buildAgencyOverview(clients), [clients])

  const context = useMemo((): AiPageContext => {
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
            agencia: agencyOverview,
            clienteAtual: {
              cliente: client.companyName,
              segmento: client.segment || null,
              status: CLIENT_STATUS_LABEL[client.status],
              servicosContratados: client.modules || {},
              contaGoogleAds: planning?.acessos?.googleAdsAccountId || null,
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
      const googleClients = clients.filter((c) => c.status !== 'churned' && c.modules?.googleAds && c.campaignPlanning?.acessos?.googleAdsAccountId)
      return {
        type: 'meta_ads',
        label: 'Métricas',
        data: {
          agencia: agencyOverview,
          nota: 'Números de performance ao vivo (Meta/Google Ads, últimos 30 dias) são buscados só quando você manda a pergunta — podem levar alguns segundos a mais pra responder.',
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
      const visibleTasks = filterVisibleTasks(tasks, canSeeAllTasks, viewerId)
      const overdueTasks = visibleTasks.filter((t) => t.status !== 'done' && t.dueDate && isPast(t.dueDate.toDate()))
      return {
        type: 'dashboard',
        label: 'Dashboard',
        data: {
          agencia: agencyOverview,
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
      data: { agencia: agencyOverview, pagina: location.pathname },
      suggestedQuestions: [
        'Quais clientes precisam de atenção hoje?',
        'Resumo das otimizações dessa semana',
      ],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, clients, tasks, optimizations, successEvaluations, clientId, canSeeAllTasks, viewerId, agencyOverview])

  const resolveContext = useCallback(async (): Promise<AiPageContext> => {
    if (context.type !== 'meta_ads') return context

    const { dateFrom, dateTo } = last30dRange()
    const googleClients = clients.filter((c) => c.status !== 'churned' && c.campaignPlanning?.acessos?.googleAdsAccountId)

    const [metaResult, googleResults] = await Promise.allSettled([
      fetchMetaAgencyOverview({ preset: 'last_30d' }),
      Promise.all(
        googleClients.map(async (c) => {
          try {
            const insights = await getGoogleAdsInsights(c.campaignPlanning!.acessos!.googleAdsAccountId!, dateFrom, dateTo)
            return { cliente: c.companyName, ...insights.summary }
          } catch {
            return { cliente: c.companyName, erro: 'falha ao buscar' }
          }
        })
      ),
    ])

    return {
      ...context,
      data: {
        ...context.data,
        nota: undefined,
        metaAdsUltimos30Dias:
          metaResult.status === 'fulfilled'
            ? {
                totais: metaResult.value.totals,
                porCliente: metaResult.value.rows.map((r) => ({
                  cliente: r.companyName,
                  investido: r.metrics?.spend ?? null,
                  conversas: r.metrics?.conversations ?? null,
                  custoPorConversa: r.metrics?.costPerConversation ?? null,
                  ctr: r.metrics?.ctr ?? null,
                })),
              }
            : { erro: 'Não consegui buscar os dados do Meta Ads agora.' },
        googleAdsUltimos30Dias: googleResults.status === 'fulfilled' ? googleResults.value : { erro: 'Não consegui buscar os dados do Google Ads agora.' },
      },
    }
  }, [context, clients])

  return { context, resolveContext }
}
