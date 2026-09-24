import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAiPageContext } from '../../hooks/useAiPageContext'
import { sendAiChatMessage, AiUsageLimitError } from '../../services/aiChatService'
import { AiChatPanel } from './AiChatPanel'
import type { AiChatMessage } from '../../types/ai'

/** Botão flutuante + painel do assistente de IA — montado uma vez em
 *  AppLayout, então fica disponível em toda a plataforma. O histórico da
 *  conversa vive só em memória (useState): fechar o painel (×) reinicia a
 *  conversa; minimizar (—) só esconde o painel, a conversa continua ao
 *  reabrir. O contexto da página atual (useAiPageContext) é recalculado a
 *  cada mensagem, então sempre reflete onde o usuário está no momento do
 *  envio, não de quando o painel foi aberto. */
export function AiAssistantWidget() {
  const { profile } = useAuth()
  const { context, resolveContext } = useAiPageContext()
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [unread, setUnread] = useState(0)

  // Só equipe interna logada — a mesma tela de login já barra o resto.
  if (!profile) return null

  const visible = open && !minimized

  const handleToggleButton = () => {
    if (visible) {
      setMinimized(true)
      return
    }
    setOpen(true)
    setMinimized(false)
    setUnread(0)
  }

  const handleSend = async (text: string) => {
    const content = text.trim()
    if (!content || sending) return
    setInput('')
    const nextMessages: AiChatMessage[] = [...messages, { role: 'user', content }]
    setMessages(nextMessages)
    setSending(true)
    try {
      const fullContext = await resolveContext()
      const reply = await sendAiChatMessage(content, fullContext, messages)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
      if (!open || minimized) setUnread((n) => n + 1)
    } catch (err) {
      const message = err instanceof AiUsageLimitError ? err.message : 'Não consegui responder agora — tenta de novo em instantes.'
      setMessages((prev) => [...prev, { role: 'assistant', content: message }])
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {visible && (
        <AiChatPanel
          messages={messages}
          sending={sending}
          input={input}
          onInputChange={setInput}
          onSend={() => handleSend(input)}
          suggestedQuestions={context.suggestedQuestions}
          onSuggestedClick={(q) => handleSend(q)}
          onMinimize={() => setMinimized(true)}
          onClose={() => {
            setOpen(false)
            setMinimized(false)
            setMessages([])
          }}
        />
      )}

      <button
        onClick={handleToggleButton}
        aria-label="Assistente de IA"
        title="Falar com Archer"
        className="fixed bottom-6 right-6 z-50 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-brand-600 text-2xl text-white transition-transform duration-150 ease-in-out hover:scale-105 hover:bg-[#1D4ED8]"
        style={{ boxShadow: '0 4px 12px rgba(37,99,235,0.4)' }}
      >
        🏹
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </>
  )
}
