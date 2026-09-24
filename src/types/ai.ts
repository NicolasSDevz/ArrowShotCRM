/** Mensagem de chat — só role+content, o suficiente pra reenviar como
 *  histórico pra API da Anthropic (ver services/aiChatService.ts). Guardado
 *  só em memória (useState) enquanto o painel do assistente está aberto —
 *  nunca persistido no Firebase (ver AiAssistantWidget). */
export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type AiPageContextType = 'client' | 'meta_ads' | 'google_ads' | 'dashboard' | 'generic'

/** Contexto automático da página atual, montado por useAiPageContext e
 *  mandado junto de cada mensagem pro /api/ai/chat — o backend serializa
 *  `data` como JSON dentro do system prompt (ver buildSystemPrompt). */
export interface AiPageContext {
  type: AiPageContextType
  label: string
  data: Record<string, unknown>
  suggestedQuestions: string[]
}
