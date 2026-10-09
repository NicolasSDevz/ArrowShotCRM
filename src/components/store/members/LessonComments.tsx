import { useEffect, useState, type FormEvent } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore'
import { membersDb } from '../../../firebase/membersApp'
import { useMembers } from './MembersContext'
import type { StoreComment } from '../../../types/store'

/** Comentários de uma aula: os aprovados de todos + os meus (mesmo pendentes). */
export function LessonComments({ productId, lessonId, lessonTitle, needApproval, color }: { productId: string; lessonId: string; lessonTitle: string; needApproval: boolean; color: string }) {
  const { user, member } = useMembers()
  const [approved, setApproved] = useState<StoreComment[]>([])
  const [mine, setMine] = useState<StoreComment[]>([])
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    const base = collection(membersDb, 'storeComments')
    const a = onSnapshot(
      query(base, where('productId', '==', productId), where('lessonId', '==', lessonId), where('status', '==', 'approved')),
      (s) => setApproved(s.docs.map((d) => ({ id: d.id, ...d.data() }) as StoreComment)),
      (err) => console.error(err)
    )
    const b = user
      ? onSnapshot(
          query(base, where('productId', '==', productId), where('lessonId', '==', lessonId), where('uid', '==', user.uid)),
          (s) => setMine(s.docs.map((d) => ({ id: d.id, ...d.data() }) as StoreComment)),
          (err) => console.error(err)
        )
      : () => {}
    return () => {
      a()
      b()
    }
  }, [productId, lessonId, user])

  const all = new Map<string, StoreComment>()
  ;[...approved, ...mine].forEach((c) => all.set(c.id, c))
  const sorted = [...all.values()].sort((x, y) => (x.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER) - (y.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER))
  const roots = sorted.filter((c) => !c.parentId).reverse()
  const replies = (id: string) => sorted.filter((c) => c.parentId === id)

  const send = async (body: string, parentId: string | null) => {
    if (!user || !body.trim()) return
    await addDoc(collection(membersDb, 'storeComments'), {
      productId,
      lessonId,
      lessonTitle,
      uid: user.uid,
      authorName: member?.name || 'Aluno',
      text: body.trim().slice(0, 2000),
      status: needApproval ? 'pending' : 'approved',
      isProducer: false,
      parentId,
      createdAt: serverTimestamp(),
    })
    setStatus(needApproval ? 'Seu comentário foi enviado para aprovação.' : 'Comentário publicado.')
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    await send(text, null)
    setText('')
  }

  const remove = async (id: string) => {
    await deleteDoc(doc(membersDb, 'storeComments', id))
    setStatus('Comentário excluído.')
  }

  const item = (c: StoreComment) => (
    <div className="flex gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--m-card2)] text-sm font-semibold" aria-hidden="true">
        {c.authorName.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {c.authorName}
          {c.isProducer && <span className="ml-2 rounded px-1.5 py-0.5 text-[11px] font-medium text-white" style={{ background: color }}>Produtor</span>}
          {c.status === 'pending' && <span className="ml-2 text-xs font-normal text-amber-400">aguardando aprovação</span>}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-[var(--m-text2)]">{c.text}</p>
        <div className="mt-1 flex gap-3 text-xs text-[var(--m-faint)]">
          {!c.parentId && <button onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} className="hover:text-[var(--m-text)]">Responder</button>}
          {c.uid === user?.uid && <button onClick={() => remove(c.id)} className="hover:text-red-400">Excluir</button>}
        </div>
      </div>
    </div>
  )

  return (
    <section aria-labelledby="comments-title" className="mt-8">
      <h2 id="comments-title" className="mb-3 text-lg font-bold">Comentários ({roots.length})</h2>
      <form onSubmit={onSubmit} className="mb-6">
        <label className="sr-only" htmlFor="new-comment">Adicione um comentário</label>
        <textarea id="new-comment" value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Adicione um comentário..." className="w-full resize-none rounded-lg border border-[var(--m-border)] bg-[var(--m-soft)] p-3 text-sm text-[var(--m-text)] outline-none focus:border-[var(--m-primary)]" />
        <button disabled={!text.trim()} className="mt-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: color }}>Comentar</button>
        <p className="mt-1 text-sm text-[var(--m-muted)]" aria-live="polite">{status}</p>
      </form>
      <ul className="space-y-5">
        {roots.map((c) => (
          <li key={c.id}>
            {item(c)}
            <ul className="ml-12 mt-3 space-y-3 border-l border-[var(--m-border)] pl-4">
              {replies(c.id).map((r) => <li key={r.id}>{item(r)}</li>)}
            </ul>
            {replyTo === c.id && (
              <form
                className="ml-12 mt-2 flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault()
                  await send(replyText, c.id)
                  setReplyText('')
                  setReplyTo(null)
                }}
              >
                <input aria-label={`Responder a ${c.authorName}`} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Adicione uma resposta..." className="h-9 flex-1 rounded-lg border border-[var(--m-border)] bg-[var(--m-soft)] px-3 text-sm text-[var(--m-text)] outline-none" />
                <button className="rounded-lg px-3 text-sm font-semibold text-white" style={{ background: color }}>Responder</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
