import { Timestamp } from 'firebase/firestore'
import { dateInputToTimestamp } from './dateInput'
import type { ResumoChamada } from '../types/chamada'
import type { LeadInput } from '../types/lead'

/** O que gravar no lead quando o resumo da chamada é salvo (TAREFA: "ao
 *  salvar, atualizar a temperatura do lead e, se houver próximo passo com
 *  data, criar um lembrete pro Bruno"). `temperaturaChamada` é um veredito
 *  separado do BANT (scorecard manual de 4 notas) — vem direto da
 *  transcrição, não substitui o BANT. O "lembrete com data" reaproveita
 *  nextAction/nextActionDate do próprio lead (já é o mecanismo existente
 *  pra isso — aparece no card do lead e no painel de crescimento), em vez
 *  de criar um sistema de tarefa novo e paralelo. */
export function buildLeadUpdateFromResumo(resumo: Omit<ResumoChamada, 'geradoEm'>): Partial<LeadInput> {
  const update: Partial<LeadInput> = {
    temperaturaChamada: {
      valor: resumo.temperatura,
      justificativa: resumo.temperaturaJustificativa,
      atualizadaEm: Timestamp.now(),
    },
  }

  if (resumo.proximoPassoData) {
    const data = dateInputToTimestamp(resumo.proximoPassoData)
    if (data) {
      update.nextAction = resumo.proximosPassos
      update.nextActionDate = data
    }
  }

  return update
}
