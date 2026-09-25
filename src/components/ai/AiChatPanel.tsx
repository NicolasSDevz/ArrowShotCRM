import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Minus, X, Send } from 'lucide-react'
import type { AiChatMessage } from '../../types/ai'
import type { AiQuota } from '../../services/aiChatService'

const WELCOME_MESSAGE = `Olá! Sou o **Archer**, assistente de IA do Quiver. 🏹

Posso te ajudar com análise de campanhas, performance dos clientes, sugestões de otimização e muito mais.

O que você precisa hoje?`

// Todo o painel usa cor fixa (nunca a paleta que muda com o tema do CRM,
// ver src/dark-families.css) — sempre que uma classe Tailwind normal
// (bg-white, text-slate-400, border-slate-200...) é usada aqui, o modo
// escuro do resto do site a reescreve, mas as poucas regras de CSS puro
// deste arquivo (.ai-md strong, .ai-md h1...) não mudam junto — o texto
// ficava escuro sobre um fundo que virava escuro também, ilegível. Cor
// aqui sempre via `style` (nunca via classe bg-*/text-*/border-*) resolve
// isso de uma vez: o widget sempre parece igual, claro, não importa o tema.
const C = {
  brand: '#2563EB',
  brandDark: '#1D4ED8',
  border: '#E2E8F0',
  muted: '#64748B',
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate600: '#475569',
  dark: '#0F172A',
  red: '#EF4444',
  white: '#FFFFFF',
  panelBg: '#F8FAFC',
}

/** remark-gfm exige uma linha em branco separando uma tabela do texto
 *  seguinte — sem isso, a linha logo após a tabela é silenciosamente
 *  descartada (não vira parágrafo, some) em vez de gerar erro. O Claude nem
 *  sempre deixa essa linha em branco (ex: tabela de métricas seguida direto
 *  da recomendação), e o resultado era o Archer "responder" só com a tabela,
 *  sem nenhuma conclusão — o texto existia na resposta, só não renderizava.
 *  Insere a linha em branco que falta antes de passar pro ReactMarkdown. */
function ensureBlankLineAfterTables(markdown: string): string {
  const lines = markdown.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i])
    const isTableRow = lines[i].trim().startsWith('|')
    const next = lines[i + 1]
    if (isTableRow && next !== undefined && next.trim() !== '' && !next.trim().startsWith('|')) {
      out.push('')
    }
  }
  return out.join('\n')
}

function TypingDots() {
  return (
    <div className="ai-bubble flex w-fit items-center gap-2 rounded-2xl px-3.5 py-2.5" style={{ border: `1px solid ${C.border}`, backgroundColor: C.white }}>
      <span className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full"
            style={{ backgroundColor: C.slate300, animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
      <span className="text-xs" style={{ color: C.muted }}>
        Analisando os dados…
      </span>
    </div>
  )
}

function MessageBubble({ message }: { message: AiChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm" style={{ backgroundColor: C.brand, color: C.white }}>
          🏹
        </span>
      )}
      {isUser ? (
        <div className="max-w-[78%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed" style={{ backgroundColor: C.brand, color: C.white }}>
          {message.content}
        </div>
      ) : (
        <div
          className="ai-md ai-bubble max-w-[92%] overflow-x-auto rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed"
          style={{ border: `1px solid ${C.border}`, backgroundColor: C.white, color: C.dark }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{ensureBlankLineAfterTables(message.content)}</ReactMarkdown>
          {message.sources && message.sources.length > 0 && (
            <p className="mt-2 border-t pt-1.5 text-[11px]" style={{ borderColor: C.border, color: C.slate400 }}>
              Consultou: {message.sources.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Painel de chat do assistente de IA — 380x520, header escuro, mensagens
 *  num fundo #F8FAFC-equivalente, chips de pergunta sugerida no estado
 *  vazio. Puramente apresentacional; todo o estado (mensagens, envio,
 *  contexto) vive em AiAssistantWidget. */
/** Contador "12/50 hoje" no topo do painel — verde, amarelo quando faltam
 *  10 ou menos, vermelho quando acabou. Cores fixas (ver comentário de C). */
function QuotaBadge({ quota }: { quota: AiQuota }) {
  const left = quota.limit - quota.used
  const color = left <= 0 ? '#FCA5A5' : left <= 10 ? '#FCD34D' : '#86EFAC'
  return (
    <span
      title={`Você usou ${quota.used} de ${quota.limit} mensagens do Archer hoje. O limite volta amanhã.`}
      className="mr-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color, backgroundColor: 'rgba(255,255,255,0.08)' }}
    >
      {quota.used}/{quota.limit} hoje
    </span>
  )
}

export function AiChatPanel({
  messages,
  quota,
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
  /** Mensagens usadas hoje / limite diário (null = ainda carregando). */
  quota: AiQuota | null
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
      className="fixed bottom-[92px] right-6 z-50 flex w-[380px] flex-col overflow-hidden rounded-2xl shadow-2xl"
      style={{ height: 520, backgroundColor: C.white, animation: 'ai-panel-in 180ms ease-out' }}
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
        .ai-md code { background: #F1F5F9; border-radius: 4px; padding: 1px 4px; font-size: 12px; color: #0F172A; }
        .ai-md table { border-collapse: collapse; width: 100%; margin: 6px 0 10px; font-size: 12px; }
        .ai-md th, .ai-md td { border: 1px solid #E2E8F0; padding: 4px 7px; text-align: left; }
        .ai-md th { background: #F8FAFC; font-weight: 700; color: #0F172A; }
        .ai-md hr { border: none; border-top: 1px solid #E2E8F0; margin: 10px 0; }
        /* Modo escuro: o painel inteiro ganha cores escuras próprias, fixas
           (com !important pra vencer o style inline e as regras genéricas de
           index.css). Antes só parte do painel escurecia, e negrito/título/
           link ficavam escuro sobre escuro. */
        :root[data-theme="dark"] .ai-body { background-color: #111113 !important; }
        :root[data-theme="dark"] .ai-footer { background-color: #151516 !important; border-top-color: #2a2a2e !important; }
        :root[data-theme="dark"] .ai-bubble { background-color: #1c1c1f !important; border-color: #2e2e33 !important; color: #d6d7db !important; }
        :root[data-theme="dark"] .ai-md p, :root[data-theme="dark"] .ai-md li, :root[data-theme="dark"] .ai-md td { color: #d6d7db !important; }
        :root[data-theme="dark"] .ai-input { background-color: #1c1c1f !important; border-color: #2e2e33 !important; color: #e8e8ea !important; }
        :root[data-theme="dark"] .ai-md strong,
        :root[data-theme="dark"] .ai-md h1,
        :root[data-theme="dark"] .ai-md h2,
        :root[data-theme="dark"] .ai-md h3,
        :root[data-theme="dark"] .ai-md th { color: #f1f1f3 !important; }
        :root[data-theme="dark"] .ai-md a { color: #86adf2 !important; }
        :root[data-theme="dark"] .ai-md code { background: #2a2a2f; color: #f1f1f3 !important; }
        :root[data-theme="dark"] .ai-md th { background: #232327; }
        :root[data-theme="dark"] .ai-md th,
        :root[data-theme="dark"] .ai-md td { border-color: #34343a !important; }
        :root[data-theme="dark"] .ai-md hr { border-top-color: #34343a !important; }
        .ai-chip { transition: color 120ms, border-color 120ms; }
        .ai-chip:hover { border-color: ${C.brand} !important; color: ${C.brandDark} !important; }
        .ai-icon-btn { transition: color 120ms, background-color 120ms; }
        .ai-icon-btn:hover { background-color: rgba(255,255,255,0.1); color: ${C.white} !important; }
        .ai-input:focus { outline: none; border-color: ${C.brand} !important; box-shadow: 0 0 0 2px rgba(37,99,235,0.15); }
      `}</style>

      <div className="flex shrink-0 items-center justify-between px-4 py-3.5" style={{ backgroundColor: C.dark }}>
        <div className="flex items-center gap-2">
          <span className="text-base">🏹</span>
          <div>
            <p className="text-[15px] font-bold leading-tight" style={{ color: C.white }}>Archer</p>
            <p className="text-[11px] leading-tight" style={{ color: C.muted }}>Assistente Quiver</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {quota && <QuotaBadge quota={quota} />}
          <button onClick={onMinimize} aria-label="Minimizar" className="ai-icon-btn rounded-md p-1.5" style={{ color: C.slate400 }}>
            <Minus size={15} />
          </button>
          <button onClick={onClose} aria-label="Fechar" className="ai-icon-btn rounded-md p-1.5" style={{ color: C.slate400 }}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="ai-body flex-1 overflow-y-auto px-4 py-4" style={{ backgroundColor: C.panelBg }}>
        {messages.length === 0 ? (
          <div className="flex flex-col gap-4">
            <MessageBubble message={{ role: 'assistant', content: WELCOME_MESSAGE }} />
            {suggestedQuestions.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 px-1">
                {suggestedQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => onSuggestedClick(q)}
                    className="ai-chip ai-bubble rounded-full px-3 py-1.5 text-xs font-medium"
                    style={{ border: `1px solid ${C.border}`, backgroundColor: C.white, color: C.slate600 }}
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

      <div className="ai-footer flex shrink-0 items-center gap-2 px-3 py-3" style={{ borderTop: `1px solid ${C.border}`, backgroundColor: C.white }}>
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
          className="ai-input h-9 flex-1 rounded-lg px-3 text-sm"
          style={{ border: `1px solid ${C.border}`, color: C.dark, backgroundColor: C.white }}
        />
        <button
          onClick={onSend}
          disabled={!input.trim() || sending}
          aria-label="Enviar"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: C.brand, color: C.white }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  )
}
