import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Minus, X, Send } from 'lucide-react'
import type { AiChatMessage } from '../../types/ai'

const WELCOME_MESSAGE = `Olá! Sou o **Archer**, assistente de IA do Quiver. 🏹

Posso te ajudar com análise de campanhas, performance dos clientes, sugestões de otimização e muito mais.

O que você precisa hoje?`

function TypingDots() {
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
}

function MessageBubble({ message }: { message: AiChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm text-white">
          🏹
        </span>
      )}
      {isUser ? (
        <div className="max-w-[78%] whitespace-pre-wrap rounded-2xl bg-brand-600 px-3.5 py-2.5 text-sm leading-relaxed text-white">
          {message.content}
        </div>
      ) : (
        <div className="ai-md max-w-[92%] overflow-x-auto rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-900">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}

/** Painel de chat do assistente de IA — 380x520, header escuro, mensagens
 *  num fundo #F8FAFC-equivalente, chips de pergunta sugerida no estado
 *  vazio. Puramente apresentacional; todo o estado (mensagens, envio,
 *  contexto) vive em AiAssistantWidget. */
export function AiChatPanel({
  messages,
  sending,
  input,
  onInputChange,
  onSend,
  suggestedQuestions,
  onSuggestedClick,
  onMinimize,
  onClose,
}: {
  messages: AiChatMessage[]
  sending: boolean
  input: string
  onInputChange: (v: string) => void
  onSend: () => void
  suggestedQuestions: string[]
  onSuggestedClick: (question: string) => void
  onMinimize: () => void
  onClose: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  return (
    <div
      className="fixed bottom-[92px] right-6 z-50 flex w-[380px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      style={{ height: 520, animation: 'ai-panel-in 180ms ease-out' }}
    >
      <style>{`
        @keyframes ai-panel-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .ai-md > *:first-child { margin-top: 0; }
        .ai-md > *:last-child { margin-bottom: 0; }
        .ai-md p { margin: 0 0 8px; }
        .ai-md h1, .ai-md h2, .ai-md h3 { font-size: 13.5px; font-weight: 700; margin: 10px 0 6px; color: #0F172A; }
        .ai-md strong { font-weight: 700; color: #0F172A; }
        .ai-md ul, .ai-md ol { margin: 0 0 8px; padding-left: 18px; }
        .ai-md li { margin: 2px 0; }
        .ai-md a { color: #2563EB; text-decoration: underline; }
        .ai-md code { background: #F1F5F9; border-radius: 4px; padding: 1px 4px; font-size: 12px; }
        .ai-md table { border-collapse: collapse; width: 100%; margin: 6px 0 10px; font-size: 12px; }
        .ai-md th, .ai-md td { border: 1px solid #E2E8F0; padding: 4px 7px; text-align: left; }
        .ai-md th { background: #F8FAFC; font-weight: 700; }
        .ai-md hr { border: none; border-top: 1px solid #E2E8F0; margin: 10px 0; }
      `}</style>

      <div className="flex shrink-0 items-center justify-between bg-[#0F172A] px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="text-base">🏹</span>
          <div>
            <p className="text-[15px] font-bold leading-tight text-white">Archer</p>
            <p className="text-[11px] leading-tight text-[#64748B]">Assistente Quiver</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onMinimize} aria-label="Minimizar" className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <Minus size={15} />
          </button>
          <button onClick={onClose} aria-label="Fechar" className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <X size={16} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#F8FAFC] px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-4">
            <MessageBubble message={{ role: 'assistant', content: WELCOME_MESSAGE }} />
            {suggestedQuestions.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 px-1">
                {suggestedQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => onSuggestedClick(q)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} />
            ))}
            {sending && <TypingDots />}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 bg-white px-3 py-3">
        <input
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
          placeholder="Pergunte sobre campanhas, clientes, métricas..."
          className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <button
          onClick={onSend}
          disabled={!input.trim() || sending}
          aria-label="Enviar"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  )
}
