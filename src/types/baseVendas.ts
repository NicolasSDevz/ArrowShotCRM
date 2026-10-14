import type { Timestamp } from 'firebase/firestore'

/** Par objeção+resposta editável (adicionar/remover) na Base de Vendas. */
export interface BaseVendasObjecao {
  id: string
  objecao: string
  resposta: string
}

/** Fonte ÚNICA do conhecimento comercial da Arrow Shot — usada pelo Archer
 *  (chat de IA do CRM, seção "Vendas da Arrow Shot" do prompt) e pelo
 *  Copiloto de Vendas (sugestões ao vivo e, na Etapa 3, o resumo pós-
 *  chamada). Documento único em `config/baseVendas`, editável em
 *  Configurações → Base de Vendas por quem tem acesso ao Copiloto
 *  (admin/manager). Antes disso, esse conteúdo vivia hardcoded no prompt do
 *  Archer (api/ai/index.js) — ver src/config/baseVendasDefault.ts para o
 *  texto original, usado como semente na primeira vez que a tela abre. */
export interface BaseVendas {
  oQueVendemos: string
  metas: string
  icpAntiIcp: string
  qualificacao: string
  sinaisCompra: string
  bant: string
  sdrWhatsapp: string
  noShowFollowUp: string
  objecoes: BaseVendasObjecao[]
  provaSocial: string
  pagamento: string
  retencao: string
  errosComuns: string
  oQueNuncaPrometer: string
  updatedAt?: Timestamp
  updatedBy?: string
}

/** Rótulo + descrição de cada campo, na ordem em que aparecem na tela —
 *  evita repetir essa lista no componente e no texto de ajuda. */
export const BASE_VENDAS_FIELD_ORDER: { key: keyof Omit<BaseVendas, 'objecoes' | 'updatedAt' | 'updatedBy'>; label: string; rows: number }[] = [
  { key: 'oQueVendemos', label: 'O que vendemos (planos, preços, funil)', rows: 4 },
  { key: 'metas', label: 'Metas do período (OKRs)', rows: 3 },
  { key: 'icpAntiIcp', label: 'ICP e Anti-ICP', rows: 4 },
  { key: 'qualificacao', label: 'Qualificação obrigatória antes de agendar', rows: 4 },
  { key: 'sinaisCompra', label: 'Sinais de compra e sinais ruins', rows: 3 },
  { key: 'bant', label: 'BANT (escala de qualificação)', rows: 2 },
  { key: 'sdrWhatsapp', label: 'Script do SDR no WhatsApp', rows: 4 },
  { key: 'noShowFollowUp', label: 'No-show e cadência de follow-up', rows: 4 },
  { key: 'provaSocial', label: 'Prova social por perfil de cliente', rows: 4 },
  { key: 'pagamento', label: 'Cobrança após o fechamento', rows: 3 },
  { key: 'retencao', label: 'Retenção', rows: 2 },
  { key: 'errosComuns', label: 'Erros que já custaram vendas', rows: 3 },
  { key: 'oQueNuncaPrometer', label: 'O que nunca prometer', rows: 3 },
]
