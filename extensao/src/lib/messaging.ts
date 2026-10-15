import type { BlocoTranscricao, Sugestao, ResumoChamada } from '../../../src/types/chamada'
import type { SugestaoParcial } from '../../../src/hooks/useCopilotoSugestoes'
import type { CopilotoStatus, OuvindoStatus } from '../../../src/hooks/useCopiloto'

/** Protocolo de mensagens entre as 3 páginas da extensão — side panel
 *  (interface), offscreen document (captura + IA, roda sempre em segundo
 *  plano) e background (service worker, só gerencia o side panel por aba e
 *  o ciclo de vida do offscreen). Tudo via chrome.runtime.sendMessage, que
 *  entrega pra qualquer contexto da própria extensão com um listener — não
 *  precisa "passar pelo" background. */

export interface IniciarMsg {
  type: 'iniciar'
  leadId: string
  tabStreamId: string | null
}
export interface EncerrarMsg {
  type: 'encerrar'
}
export interface PedirAjudaMsg {
  type: 'pedirAjuda'
  pergunta?: string
}
export interface GerarResumoMsg {
  type: 'gerarResumo'
}
export type SidePanelParaOffscreenMsg = IniciarMsg | EncerrarMsg | PedirAjudaMsg | GerarResumoMsg

export interface StatusEvt {
  type: 'status'
  status: CopilotoStatus
}
export interface OuvindoEvt {
  type: 'ouvindo'
  ouvindo: OuvindoStatus
}
export interface BlocoEvt {
  type: 'bloco'
  bloco: BlocoTranscricao
}
export interface ChamadaIdEvt {
  type: 'chamadaId'
  chamadaId: string
}
export interface ErroCapturaEvt {
  type: 'erroCaptura'
  mensagem: string
}
export interface SemAudioClienteEvt {
  type: 'semAudioCliente'
}
export interface SugestaoChunkEvt {
  type: 'sugestaoChunk'
  parcial: SugestaoParcial | null
}
export interface SugestaoFinalEvt {
  type: 'sugestaoFinal'
  sugestao: Sugestao
}
export interface SugestaoErroEvt {
  type: 'sugestaoErro'
  mensagem: string
}
export interface GeneratingEvt {
  type: 'generating'
  generating: boolean
}
export interface ResumoProntoEvt {
  type: 'resumoPronto'
  resumo: Omit<ResumoChamada, 'geradoEm'>
}
export interface ResumoErroEvt {
  type: 'resumoErro'
  mensagem: string
}
export type OffscreenParaSidePanelMsg =
  | StatusEvt
  | OuvindoEvt
  | BlocoEvt
  | ChamadaIdEvt
  | ErroCapturaEvt
  | SemAudioClienteEvt
  | SugestaoChunkEvt
  | SugestaoFinalEvt
  | SugestaoErroEvt
  | GeneratingEvt
  | ResumoProntoEvt
  | ResumoErroEvt

export interface EnsureOffscreenMsg {
  type: 'ensureOffscreen'
}
export type ParaBackgroundMsg = EnsureOffscreenMsg

export function enviar(msg: SidePanelParaOffscreenMsg | OffscreenParaSidePanelMsg | ParaBackgroundMsg) {
  chrome.runtime.sendMessage(msg).catch(() => {
    /* sem listener do outro lado ainda (ex: offscreen fechando) — ignora */
  })
}
