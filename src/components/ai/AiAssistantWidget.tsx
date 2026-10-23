import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAiPageContext } from '../../hooks/useAiPageContext'
import { sendAiChatMessage, getAiQuota, AiUsageLimitError, type AiQuota } from '../../services/aiChatService'
import {
  deleteArcherChat,
  listArcherChats,
  newArcherChatId,
  saveArcherChat,
  watchArcherChat,
  type ArcherChat,
} from '../../services/archerChatStore'
import { AiChatPanel } from './AiChatPanel'
import type { AiChatMessage } from '../../types/ai'

/** Depois disso sem resposta, para de mostrar "digitando" (o servidor corta em ~100s). */
const PENDING_MAX_MS = 130_000

function readStore(storage: 'local' | 'session', key: string): string | null {
  try {
    return (storage === 'local' ? localStorage : sessionStorage).getItem(key)
  } catch {
    return null
  }
}
function writeStore(storage: 'local' | 'session', key: string, value: string | null) {
  try {
    const s = storage === 'local' ? localStorage : sessionStorage
    if (value === null) s.removeItem(key)
    else s.setItem(key, value)
  } catch {
    /* sem storage: só não lembra depois do F5 */
  }
}

/** Botão flutuante + painel do assistente de IA — montado uma vez em
 *  AppLayout, então fica disponível em toda a plataforma. Cada conversa é
 *  salva no Firestore (aiChats, ver services/archerChatStore.ts): o F5 traz
 *  de volta a conversa aberta e o Histórico lista as antigas. Fechar (×)
 *  começa uma conversa nova na próxima vez; a anterior fica no Histórico.
 *  O contexto da página atual (useAiPageContext) é recalculado a cada
 *  mensagem, então sempre reflete onde o usuário está no momento do envio. */
export function AiAssistantWidget() {
  const { profile, firebaseUser } = useAuth()
  const uid = firebaseUser?.uid ?? null
  const chatKey = uid ? `archer.chat.${uid}` : ''
  const { context, resolveContext } = useAiPageContext()
  const [open, setOpen] = useState(() => readStore('session', 'archer.open') === '1')
  const [minimized, setMinimized] = useState(false)
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [chatId, setChatId] = useState<string | null>(null)
  const [remotePending, setRemotePending] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [unread, setUnread] = useState(0)
  const [quota, setQuota] = useState<AiQuota | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<ArcherChat[] | null>(null)
  const createdAtRef = useRef<number | null>(null)

  // Conversa que estava aberta antes do F5.
  useEffect(() => {
    if (!chatKey) return
    setChatId(readStore('local', chatKey))
  }, [chatKey])

  // Acompanha a conversa aberta: a resposta chega por aqui mesmo depois de um F5.
  useEffect(() => {
    if (!chatId) return
    return watchArcherChat(chatId, (chat) => {
      if (!chat) return
      createdAtRef.current = chat.createdAt || null
      const saved = Array.isArray(chat.messages) ? chat.messages : []
      // Nunca encolhe a conversa (a gravação local pode estar à frente).
      setMessages((prev) => (saved.length >= prev.length ? saved : prev))
      setRemotePending(!!chat.pending && Date.now() - (chat.pendingAt || 0) < PENDING_MAX_MS)
    })
  }, [chatId])

  useEffect(() => {
    writeStore('session', 'archer.open', open && !minimized ? '1' : null)
  }, [open, minimized])

  // Lê o uso de hoje sempre que o painel abre (pode ter mudado em outra aba/outro dia).
  const panelVisible = open && !minimized
  useEffect(() => {
    if (!panelVisible || !profile) return
    let cancelled = false
    void getAiQuota().then((q) => {
      if (!cancelled && q) setQuota(q)
    })
    return () => {
      cancelled = true
    }
  }, [panelVisible, profile])

  const loadHistory = useCallback(async () => {
    if (!uid) return
    setHistory(null)
    try {
      setHistory(await listArcherChats(uid))
    } catch {
      setHistory([])
    }
  }, [uid])

  // Só equipe interna logada — a mesma tela de login já barra o resto.
  if (!profile || !uid) return null

  const visible = open && !minimized
  const busy = sending || remotePending

  const selectChat = (id: string | null) => {
    setChatId(id)
    setMessages([])
    setRemotePending(false)
    createdAtRef.current = null
    if (chatKey) writeStore('local', chatKey, id)
  }

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
    if (!content || busy) return
    setInput('')
    setHistoryOpen(false)
    let id = chatId
    if (!id) {
      id = newArcherChatId()
      createdAtRef.current = Date.now()
      setChatId(id)
      if (chatKey) writeStore('local', chatKey, id)
    }
    const previous = messages
    const nextMessages: AiChatMessage[] = [...previous, { role: 'user', content }]
    setMessages(nextMessages)
    setSending(true)
    try {
      // Grava a pergunta antes de chamar o servidor — ele acrescenta a resposta no mesmo documento.
      await saveArcherChat(id, uid, nextMessages, true, createdAtRef.current ?? Date.now()).catch((err) =>
        console.warn('[archer] não salvou a conversa', err)
      )
      const fullContext = await resolveContext()
      const reply = await sendAiChatMessage(content, fullContext, previous, id)
      if (reply.quota) setQuota(reply.quota)
      setMessages((prev) =>
        prev.length > nextMessages.length ? prev : [...nextMessages, { role: 'assistant', content: reply.text, sources: reply.sources }]
      )
      if (!open || minimized) setUnread((n) => n + 1)
    } catch (err) {
      if (err instanceof AiUsageLimitError && err.quota) setQuota(err.quota)
      const message = err instanceof AiUsageLimitError ? err.message : 'Não consegui responder agora — tenta de novo em instantes.'
      setMessages((prev) => [...prev, { role: 'assistant', content: message }])
      setRemotePending(false)
      void saveArcherChat(id, uid, nextMessages, false).catch(() => {})
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {visible && (
        <AiChatPanel
          messages={messages}
          quota={quota}
          sending={busy}
          input={input}
          onInputChange={setInput}
          onSend={() => handleSend(input)}
          suggestedQuestions={context.suggestedQuestions}
          onSuggestedClick={(q) => handleSend(q)}
          onMinimize={() => setMinimized(true)}
          onClose={() => {
            setOpen(false)
            setMinimized(false)
            setHistoryOpen(false)
            if (!sending) selectChat(null)
          }}
          historyOpen={historyOpen}
          history={history}
          currentChatId={chatId}
          onOpenHistory={() => {
            setHistoryOpen(true)
            void loadHistory()
          }}
          onCloseHistory={() => setHistoryOpen(false)}
          onPickChat={(id) => {
            if (sending) return
            if (id !== chatId) selectChat(id)
            setHistoryOpen(false)
          }}
          onNewChat={() => {
            if (sending) return
            selectChat(null)
            setHistoryOpen(false)
          }}
          onDeleteChat={async (id) => {
            try {
              await deleteArcherChat(id)
              setHistory((h) => (h ? h.filter((c) => c.id !== id) : h))
              if (id === chatId) selectChat(null)
            } catch {
              /* sem permissão ou offline: a lista continua como estava */
            }
          }}
        />
      )}

      {/* Cor sempre fixa via style, nunca via classe bg- ou text- — essas
          classes mudam de valor no modo escuro do resto do site (ver
          dark-families.css), o que já deixou o texto "Archer" ilegível uma
          vez; o botão flutuante usa o mesmo tratamento por segurança. */}
      <style>{`.ai-fab:hover { transform: scale(1.05); background-color: #1D4ED8 !important; }`}</style>
      <button
        onClick={handleToggleButton}
        aria-label="Assistente de IA"
        title="Falar com Archer"
        className="ai-fab fixed bottom-6 right-6 z-30 flex h-[52px] w-[52px] items-center justify-center rounded-full text-2xl transition-transform duration-150 ease-in-out"
        style={{ backgroundColor: '#2563EB', color: '#FFFFFF', boxShadow: '0 4px 12px rgba(37,99,235,0.4)' }}
      >
        🏹
        {unread > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold"
            style={{ backgroundColor: '#EF4444', color: '#FFFFFF' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </>
  )
}
