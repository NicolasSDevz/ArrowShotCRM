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
import { getGoogleAdsInsights, getGoogleAdsKeywordInsights, getGoogleAdsSearchTermInsights } from '../services/googleAdsApi'
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

/** Cache em módulo (sobrevive a re-renders e a fechar/reabrir o painel,
 *  porque é sobre a agência inteira, não sobre uma conversa específica) —
 *  sem isso, cada pergunta buscaria de novo o Meta Ads (que já tem cache no
 *  próprio servidor) e, pior, o Google Ads (que não tem: seria 1 chamada de
 *  API por cliente configurado a cada mensagem). 5 minutos é fresco o
 *  suficiente pra uma pergunta de "como está a campanha" sem martelar a API
 *  do Google a cada mensagem da mesma conversa. */
let liveCampaignCache: { data: Record<string, unknown>; fetchedAt: number } | null = null
const LIVE_CACHE_TTL_MS = 5 * 60 * 1000

/** Cache separado (por cliente) pro nível granular de Google Ads (palavras-
 *  chave e termos de pesquisa) — só busca do cliente que está na tela no
 *  momento, não da carteira inteira como o `liveCampaignCache` acima: são 2
 *  chamadas extras à API do Google por cliente (keyword_view + search_term_
 *  view), inviável repetir pra cada cliente configurado a cada mensagem. */
let clientGranularCache: { clientId: string; data: Record<string, unknown>; fetchedAt: number } | null = null

/** Monta o contexto automático da página atual pro assistente de IA —
 *  reaproveita hooks já usados em outros pontos do app (mesmos listeners do
 *  Firestore, sem nenhuma leitura nova) pra não duplicar custo/latência.
 *  Chamado sempre no topo do componente (AiAssistantWidget é montado uma vez
 *  em AppLayout), então os hooks de "cliente" recebem clientId vazio quando
 *  a rota não é de cliente — retornam listas vazias nesse caso, sem erro.
 *
 *  `context` já vem pronto (síncrono, dados que o app já tem carregados).
 *  `resolveContext()` é chamado na hora de mandar a mensagem — busca o dado
 *  "ao vivo" (Meta/Google Ads Insights, últimos 30 dias) e mistura no
 *  contexto, sempre, não importa a página — uma pergunta sobre campanha pode
 *  vir de qualquer lugar (ex: perguntar da Dashboard sobre um cliente
 *  específico). Isso é cacheado por alguns minutos (ver liveCampaignCache)
 *  pra não repetir a busca a cada mensagem da mesma conversa. */
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
            '📊 Como está a performance dessa semana?',
            '💡 Sugestões de otimização',
            '📋 Resumo desse cliente',
            '⚠️ Algum ponto de atenção?',
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
          clientesMetaAds: metaClients.map((c) => c.companyName),
          clientesGoogleAds: googleClients.map((c) => c.companyName),
        },
        suggestedQuestions: [
          '🏆 Qual cliente tem melhor CPL?',
          '📉 Alguma conta com queda de performance?',
          '🔍 Qual campanha tem melhor conversão?',
          '💰 Como está o CPC médio dos clientes?',
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
          '🔴 Quais clientes precisam de atenção?',
          '📈 Como está o MRR esse mês?',
          '✅ O que foi concluído hoje?',
        ],
      }
    }

    // ---------- Genérico ----------
    return {
      type: 'generic',
      label: 'Quiver',
      data: { agencia: agencyOverview, pagina: location.pathname },
      suggestedQuestions: [
        '🔴 Quais clientes precisam de atenção?',
        '📈 Como está o MRR esse mês?',
      ],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, clients, tasks, optimizations, successEvaluations, clientId, canSeeAllTasks, viewerId, agencyOverview])

  // Busca dado "ao vivo" de campanha (Meta/Google Ads, últimos 30 dias) SEMPRE
  // — não só quando a pergunta parte da aba Métricas. Uma pergunta tipo "como
  // está a campanha do cliente X" pode vir de qualquer página (Dashboard,
  // ficha de outro cliente, etc.), e o assistente precisa desses números
  // independente de onde a pergunta foi feita.
  const resolveContext = useCallback(async (): Promise<AiPageContext> => {
    const now = Date.now()
    if (!liveCampaignCache || now - liveCampaignCache.fetchedAt > LIVE_CACHE_TTL_MS) {
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

      liveCampaignCache = {
        fetchedAt: now,
        data: {
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
          googleAdsUltimos30Dias:
            googleResults.status === 'fulfilled' ? googleResults.value : { erro: 'Não consegui buscar os dados do Google Ads agora.' },
        },
      }
    }

    // Nível granular (palavras-chave + termos de pesquisa) só do cliente que
    // está na tela agora — pra otimização "cirúrgica" (pausar termo ruim,
    // ajustar lance de uma palavra-chave), que o agregado por campanha acima
    // não permite. Ver clientGranularCache.
    let granularData: Record<string, unknown> = {}
    const currentClient = clientId ? clients.find((c) => c.id === clientId) : undefined
    const accountId = currentClient?.campaignPlanning?.acessos?.googleAdsAccountId
    if (currentClient?.modules?.googleAds && accountId) {
      const now2 = Date.now()
      if (!clientGranularCache || clientGranularCache.clientId !== clientId || now2 - clientGranularCache.fetchedAt > LIVE_CACHE_TTL_MS) {
        const { dateFrom, dateTo } = last30dRange()
        const [keywordResult, searchTermResult] = await Promise.allSettled([
          getGoogleAdsKeywordInsights(accountId, dateFrom, dateTo),
          getGoogleAdsSearchTermInsights(accountId, dateFrom, dateTo),
        ])
        clientGranularCache = {
          clientId,
          fetchedAt: now2,
          data: {
            palavrasChaveGoogleAdsUltimos30Dias:
              keywordResult.status === 'fulfilled' ? keywordResult.value.keywords : { erro: 'Não consegui buscar as palavras-chave agora.' },
            termosDePesquisaGoogleAdsUltimos30Dias:
              searchTermResult.status === 'fulfilled' ? searchTermResult.value.searchTerms : { erro: 'Não consegui buscar os termos de pesquisa agora.' },
          },
        }
      }
      granularData = clientGranularCache.data
    }

    return {
      ...context,
      data: { ...context.data, ...liveCampaignCache.data, ...granularData },
    }
  }, [context, clients, clientId])

  return { context, resolveContext }
}
