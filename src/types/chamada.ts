import type { Timestamp } from 'firebase/firestore'

export type ChamadaStatus = 'ativa' | 'encerrada'

export interface BlocoTranscricao {
  id: string
  speaker: 'Bruno' | 'Cliente'
  texto: string
  /** Milissegundos desde o início da chamada */
  timestampMs: number
}

export type ChamadaTemperatura = 'quente' | 'morno' | 'frio'

export const CHAMADA_TEMPERATURA_LABEL: Record<ChamadaTemperatura, string> = {
  quente: '🔥 Quente',
  morno: '🙂 Morno',
  frio: '🧊 Frio',
}

export const CHAMADA_TEMPERATURA_BADGE: Record<ChamadaTemperatura, string> = {
  quente: 'bg-red-50 text-red-700',
  morno: 'bg-amber-50 text-amber-700',
  frio: 'bg-blue-50 text-blue-700',
}

/** Resumo pós-chamada (Etapa 3) — gerado por Claude Sonnet a partir da
 *  transcrição completa + sugestões da chamada + Base de Vendas (ver
 *  api/_lib/copilotoResumo.js). Editável antes de salvar (ver
 *  components/leads/ResumoReview.tsx); "não mencionado" é um valor de
 *  verdade aqui, não um placeholder vazio — significa que o modelo não
 *  achou isso na transcrição. */
export interface ResumoChamada {
  dores: string
  situacaoAtual: string
  objecoes: string
  temperatura: ChamadaTemperatura
  temperaturaJustificativa: string
  planoOuValor: string
  proximosPassos: string
  /** yyyy-MM-dd — só quando uma data concreta foi combinada na chamada. */
  proximoPassoData?: string | null
  followUpMensagem: string
  geradoEm: Timestamp
}

export type SugestaoTipo = 'objecao' | 'duvida' | 'sinal_compra' | 'geral'

/** Cartão de sugestão ao vivo do Copiloto (Etapa 2) — gerado por Claude
 *  Haiku a partir da Base de Vendas + transcrição recente, automaticamente
 *  (objeção/dúvida/sinal de compra detectado por palavra-chave) ou a pedido
 *  do Bruno ("Me ajuda agora" / pergunta digitada). Salvo junto da chamada
 *  pra alimentar o resumo da Etapa 3. */
export interface Sugestao {
  id: string
  tipo: SugestaoTipo
  /** O que o cliente quis dizer, em uma linha. */
  resumo: string
  /** 1 ou 2 frases prontas pro Bruno falar. */
  frases: string[]
  /** Milissegundos desde o início da chamada — mesma base de `BlocoTranscricao.timestampMs`. */
  timestampMs: number
  origem: 'auto' | 'manual'
  /** Só quando origem === 'manual' e o Bruno digitou uma pergunta (em vez de clicar "Me ajuda agora" direto). */
  pergunta?: string
}

export interface Chamada {
  id: string
  status: ChamadaStatus
  iniciadaEm: Timestamp
  encerradaEm?: Timestamp | null
  blocos: BlocoTranscricao[]
  /** Sugestões geradas durante a chamada (Etapa 2) — undefined em chamadas
   *  antigas, de antes dessa funcionalidade existir. */
  sugestoes?: Sugestao[]
  /** Resumo pós-chamada (Etapa 3) — undefined até ser gerado (automático ao
   *  encerrar, ou manual via "Gerar resumo agora" se a aba fechou antes). */
  resumo?: ResumoChamada
  updatedBy: string
  updatedAt: Timestamp
}
