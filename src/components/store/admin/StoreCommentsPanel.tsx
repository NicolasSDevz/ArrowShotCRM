import { useState } from 'react'
import toast from 'react-hot-toast'
import { Check, MessageSquareReply, Trash2 } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { Button } from '../../ui/Button'
import { Badge } from '../../ui/Badge'
import { Input } from '../../ui/Field'
import { EmptyState } from '../../ui/EmptyState'
import { approveStoreComment, deleteStoreComment, replyAsProducer } from '../../../services/storeService'
import type { StoreComment, StoreProduct } from '../../../types/store'

/** Comentários das aulas: aprovar, responder como produtor e excluir. */
export function StoreCommentsPanel({ comments, products }: { comments: StoreComment[]; products: StoreProduct[] }) {
  const { profile } = useAuth()
  const [onlyPending, setOnlyPending] = useState(false)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [reply, setReply] = useState('')

  const list = comments.filter((c) => !onlyPending || c.status === 'pending')
  const pendingCount = comments.filter((c) => c.status === 'pending').length
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? 'Produto'

  const sendReply = async (c: StoreComment) => {
    if (!profile || !reply.trim()) return
    await replyAsProducer(c, reply.trim(), products.find((p) => p.id === c.productId)?.members?.producerName || profile.name, profile.id)
    if (c.status === 'pending') await approveStoreComment(c.id)
    setReply('')
    setReplyTo(null)
    toast.success('Resposta publicada')
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
        Só os que aguardam aprovação ({pendingCount})
      </label>
      {list.length === 0 ? (
        <EmptyState title="Nenhum comentário" />
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800">
                    {c.authorName}
                    {c.isProducer && <Badge className="ml-2 bg-brand-50 text-brand-700">produtor</Badge>}
                    {c.status === 'pending' && <Badge className="ml-2 bg-amber-50 text-amber-700">aguardando aprovação</Badge>}
                  </p>
                  <p className="text-xs text-slate-400">{productName(c.productId)}, aula {c.lessonTitle || ''}{c.parentId ? ', resposta' : ''}</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-slate-700">{c.text}</p>
                </div>
                <div className="flex gap-1">
                  {c.status === 'pending' && <Button size="sm" variant="secondary" icon={<Check size={14} />} onClick={() => approveStoreComment(c.id)} aria-label={`Aprovar comentário de ${c.authorName}`}>Aprovar</Button>}
                  {!c.isProducer && <Button size="sm" variant="ghost" icon={<MessageSquareReply size={14} />} onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} aria-label={`Responder ${c.authorName}`}>Responder</Button>}
                  <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => deleteStoreComment(c.id)} aria-label={`Excluir comentário de ${c.authorName}`} />
                </div>
              </div>
              {replyTo === c.id && (
                <div className="mt-3 flex gap-2">
                  <Input aria-label={`Resposta para ${c.authorName}`} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Sua resposta como produtor" />
                  <Button onClick={() => sendReply(c)}>Publicar</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
