import { useEffect, useRef } from 'react'
import { Sparkles, Minus, X, Send } from 'lucide-react'
import type { AiChatMessage } from '../../types/ai'

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
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
          <Sparkles size={12} />
        </span>
      )}
      <div
        className={`max-w-[78%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-900'
        }`}
      >
        {message.content}
      </div>
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
      <style>{`@keyframes ai-panel-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      <div className="flex shrink-0 items-center justify-between bg-[#0F172A] px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-white" />
          <div>
            <p className="text-[15px] font-bold leading-tight text-white">Quiver AI</p>
            <p className="text-[11px] leading-tight text-[#64748B]">Assistente de marketing</p>
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
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-white">
              <Sparkles size={20} />
            </span>
            <p className="text-sm text-slate-500">Pergunte sobre campanhas, clientes ou métricas.</p>
            {suggestedQuestions.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5">
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
