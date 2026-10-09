import { useCallback, useEffect, useState } from 'react'
import { arrayRemove, arrayUnion, collection, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { membersDb } from '../../../firebase/membersApp'
import { useMembers } from './MembersContext'
import type { StoreLesson, StoreModule, StoreProgress } from '../../../types/store'

/** Conteúdo de um curso (módulos + aulas) e o progresso do aluno nele. */
export function useCourse(productId: string | undefined) {
  const { user, products, enrollments } = useMembers()
  const product = products.find((p) => p.id === productId) ?? null
  const enrollment = enrollments.find((e) => e.productId === productId)
  const [modules, setModules] = useState<StoreModule[]>([])
  const [lessons, setLessons] = useState<StoreLesson[]>([])
  const [progress, setProgress] = useState<StoreProgress | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!productId || !product) return
    let alive = true
    setLoading(true)
    Promise.all([
      getDocs(query(collection(membersDb, 'storeProducts', productId, 'modules'), orderBy('order', 'asc'))),
      getDocs(query(collection(membersDb, 'storeProducts', productId, 'lessons'), orderBy('order', 'asc'))),
    ])
      .then(([m, l]) => {
        if (!alive) return
        setModules(m.docs.map((d) => ({ id: d.id, ...d.data() }) as StoreModule))
        setLessons(l.docs.map((d) => ({ id: d.id, ...d.data() }) as StoreLesson))
      })
      .catch((err) => console.error('Erro ao carregar o curso', err))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [productId, product])

  useEffect(() => {
    if (!user || !productId) return
    return onSnapshot(
      doc(membersDb, 'storeProgress', `${user.uid}_${productId}`),
      (s) => setProgress(s.exists() ? ({ id: s.id, ...s.data() } as StoreProgress) : null),
      () => setProgress(null)
    )
  }, [user, productId])

  const progressRef = user && productId ? doc(membersDb, 'storeProgress', `${user.uid}_${productId}`) : null
  const base = user && productId ? { uid: user.uid, productId, updatedAt: serverTimestamp() } : null

  const setCompleted = useCallback(
    async (lessonId: string, done: boolean) => {
      if (!progressRef || !base) return
      await setDoc(progressRef, { ...base, completed: done ? arrayUnion(lessonId) : arrayRemove(lessonId) }, { merge: true })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.uid, productId]
  )

  const setLastLesson = useCallback(
    async (lessonId: string) => {
      if (!progressRef || !base) return
      await setDoc(progressRef, { ...base, lastLessonId: lessonId }, { merge: true }).catch(() => {})
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.uid, productId]
  )

  const rate = useCallback(
    async (lessonId: string, stars: number) => {
      if (!progressRef || !base) return
      await setDoc(progressRef, { ...base, ratings: { [lessonId]: stars } }, { merge: true })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.uid, productId]
  )

  const completed = new Set(progress?.completed ?? [])
  const percent = lessons.length ? Math.round((lessons.filter((l) => completed.has(l.id)).length / lessons.length) * 100) : 0

  return { product, enrollment, modules, lessons, progress, completed, percent, loading: loading && !!product, setCompleted, setLastLesson, rate }
}

/** Converte link de YouTube, Vimeo, Panda, Bunny etc. em algo que dá pra tocar. */
export function videoSource(url?: string | null): { kind: 'iframe' | 'video'; src: string } | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (/\.(mp4|webm|m3u8)$/i.test(u.pathname)) return { kind: 'video', src: url }
    if (host === 'youtu.be') return { kind: 'iframe', src: `https://www.youtube.com/embed/${u.pathname.slice(1)}?rel=0&modestbranding=1` }
    if (host.endsWith('youtube.com')) {
      const id = u.searchParams.get('v') || u.pathname.split('/').filter(Boolean).pop()
      return id ? { kind: 'iframe', src: `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1` } : null
    }
    if (host === 'vimeo.com') {
      const [id, hash] = u.pathname.split('/').filter(Boolean)
      return { kind: 'iframe', src: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ''}` }
    }
    return { kind: 'iframe', src: url } // player.vimeo.com, Panda, Bunny, Loom já vêm como embed
  } catch {
    return null
  }
}
