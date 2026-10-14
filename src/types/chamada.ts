import type { Timestamp } from 'firebase/firestore'

export type ChamadaStatus = 'ativa' | 'encerrada'

export interface BlocoTranscricao {
  id: string
  speaker: 'Bruno' | 'Cliente'
  texto: string
  /** Milissegundos desde o início da chamada */
  timestampMs: number
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
  updatedBy: string
  updatedAt: Timestamp
}
