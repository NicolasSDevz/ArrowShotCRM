/** Snapshot diário de métricas da empresa, gravado pelo cron
 *  `/api/cron/update-metrics` (e pelo botão "Atualizar agora"). O painel
 *  "Visão Geral" do Dashboard lê o snapshot mais recente em vez de recalcular
 *  os agregados pesados (MRR, churn, LTV) em tempo real.
 *
 *  Id do documento = data no formato YYYY-MM-DD. */
export interface MetricsSnapshot {
  id: string
  /** Receita recorrente mensal — soma de monthlyValue dos clientes ativos. */
  mrr: number
  /** Clientes com status "Ativo". */
  activeClients: number
  /** (encerrados no mês / total no início do mês) × 100. */
  churnRate: number
  /** (MRR / clientes ativos) × média de meses de permanência dos ativos. */
  ltv: number
  /** Clientes cadastrados no mês corrente. */
  newClients: number
  /** Clientes que passaram para "Encerrado" no mês corrente. */
  churnedClients: number
  /** Soma de monthlyValue por gestor (Ciane / Nicolas). */
  revenueByGestor: { ciane: number; nicolas: number }
  /** Nº de clientes ativos por gestor — usado no card "Receita por Gestor". */
  clientsByGestor: { ciane: number; nicolas: number }
  /** Clientes ativos sem monthlyValue preenchido (ignorados no MRR). */
  clientsWithoutValue: number
  /** Valores do snapshot de ~30 dias atrás, p/ a variação % dos cards.
   *  `null` quando ainda não há histórico. */
  prevMonth: { mrr: number; activeClients: number } | null
  /** ISO string — quando o snapshot foi calculado. */
  calculatedAt: string
}
