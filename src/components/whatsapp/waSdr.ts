import type { WaConversation, WaSdrField, WaSdrStage, WaSdrTemperature } from '../../types/whatsapp'

/** Etapas do SDR na ordem do funil (as 5 primeiras viram a barra de progresso). */
export const SDR_FLOW: WaSdrStage[] = ['abertura', 'descoberta', 'qualificacao', 'agendamento', 'agendado']

export const SDR_STAGE: Record<WaSdrStage, { label: string; color: string; hint: string }> = {
  abertura: { label: 'Abertura', color: '#94a3b8', hint: 'Primeiro contato, entendendo quem é.' },
  descoberta: { label: 'Descoberta', color: '#60a5fa', hint: 'Entendendo a dor e como o negócio funciona.' },
  qualificacao: { label: 'Qualificação', color: '#a78bfa', hint: 'Conferindo verba, tamanho, quem decide e prazo.' },
  agendamento: { label: 'Agendando', color: '#f5b544', hint: 'Propondo a reunião de diagnóstico.' },
  agendado: { label: 'Reunião marcada', color: '#4cc38a', hint: 'Reunião combinada. Falta confirmar na agenda.' },
  nutricao: { label: 'Nutrição', color: '#22d3ee', hint: 'Tem perfil, mas não é o momento.' },
  desqualificado: { label: 'Sem perfil', color: '#f28b8b', hint: 'Não é empresa de limpeza ou não tem como contratar.' },
}

export const SDR_TEMP: Record<WaSdrTemperature, { label: string; color: string; bg: string }> = {
  quente: { label: 'Quente', color: '#fb7185', bg: 'rgba(251,113,133,.14)' },
  morno: { label: 'Morno', color: '#f5b544', bg: 'rgba(245,181,68,.14)' },
  frio: { label: 'Frio', color: '#60a5fa', bg: 'rgba(96,165,250,.14)' },
}

export const SDR_FIELD_LABEL: Record<WaSdrField, string> = {
  nome: 'Nome',
  empresa: 'Empresa',
  cidade: 'Cidade',
  servico: 'Tipo de limpeza',
  tamanho: 'Tamanho',
  anuncia: 'Anuncia hoje',
  investimento: 'Verba',
  objetivo: 'Objetivo',
  decisor: 'Quem decide',
  prazo: 'Prazo',
}

/** Os campos que o SDR tenta descobrir, na ordem que aparecem no painel. */
export const SDR_FIELDS: WaSdrField[] = ['empresa', 'cidade', 'servico', 'anuncia', 'investimento', 'objetivo', 'tamanho', 'decisor', 'prazo']

export const isHot = (c: Pick<WaConversation, 'sdr'>) => c.sdr?.temperature === 'quente'
export const hasMeeting = (c: Pick<WaConversation, 'sdr'>) => c.sdr?.stage === 'agendado' || c.sdr?.meeting?.agreed === true

/** Quantos campos do perfil já foram descobertos (0 a 1). */
export function profileProgress(c: Pick<WaConversation, 'sdr'>) {
  const p = c.sdr?.profile || {}
  return SDR_FIELDS.filter((k) => p[k]).length / SDR_FIELDS.length
}
