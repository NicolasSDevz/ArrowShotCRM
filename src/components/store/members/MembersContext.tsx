import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInWithCustomToken, signOut, type User } from 'firebase/auth'
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore'
import { membersAuth, membersDb } from '../../../firebase/membersApp'
import { defaultMembersTheme, membersBasePath, type StoreEnrollment, type StoreMember, type StoreMembersTheme, type StoreProduct } from '../../../types/store'
import { fetchMembersTheme } from '../../../services/storeApi'

interface MembersValue {
  user: User | null
  member: StoreMember | null
  enrollments: StoreEnrollment[]
  products: StoreProduct[]
  loading: boolean
  signInWithToken: (token: string) => Promise<void>
  logout: () => Promise<void>
  theme: StoreMembersTheme
  /** Endereço da área aberta: /membros (principal) ou /m/{slug}. Todos os links usam isto. */
  base: string
  /** slug da área (null = principal). */
  area: string | null
}

const Ctx = createContext<MembersValue | undefined>(undefined)

/** Sessão do aluno (app Firebase "members", separado do CRM) + produtos que ele comprou.
 *  Cada área de membros (/membros ou /m/{slug}) mostra só os cursos dela: o login é o
 *  mesmo, mas quem comprou flores e marketing vê cada um na sua área. */
export function MembersProvider({ area = null, children }: { area?: string | null; children: ReactNode }) {
  const cacheKey = area ? `members-theme:${area}` : 'members-theme'
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [member, setMember] = useState<StoreMember | null>(null)
  const [enrollments, setEnrollments] = useState<StoreEnrollment[]>([])
  const [allProducts, setAllProducts] = useState<StoreProduct[]>([])
  const [dataReady, setDataReady] = useState(false)
  // Tema: guardado no navegador para a tela já abrir com a cara certa, e atualizado pela API.
  const [theme, setTheme] = useState<StoreMembersTheme & { areaId?: string | null }>(() => {
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) return { ...defaultMembersTheme(), ...JSON.parse(cached) }
    } catch {
      /* segue com o padrão */
    }
    return defaultMembersTheme()
  })
  // Área extra: o id dela vem com o tema (sem ele não dá pra saber quais cursos mostrar).
  const [areaReady, setAreaReady] = useState(() => !area || theme.areaId !== undefined)

  useEffect(() => {
    fetchMembersTheme(area)
      .then((t) => {
        const full = { ...defaultMembersTheme(), ...t }
        setTheme(full)
        setAreaReady(true)
        try {
          localStorage.setItem(cacheKey, JSON.stringify(full))
        } catch {
          /* sem cache */
        }
      })
      .catch(() => setAreaReady(true))
  }, [area, cacheKey])

  useEffect(
    () =>
      onAuthStateChanged(membersAuth, (u) => {
        setUser(u)
        setAuthReady(true)
      }),
    []
  )

  useEffect(() => {
    if (!user) {
      setMember(null)
      setEnrollments([])
      setAllProducts([])
      setDataReady(true)
      return
    }
    setDataReady(false)
    const stopMember = onSnapshot(
      doc(membersDb, 'storeMembers', user.uid),
      (s) => setMember(s.exists() ? ({ id: s.id, ...s.data() } as StoreMember) : null),
      () => setMember(null)
    )
    const stopEnroll = onSnapshot(
      query(collection(membersDb, 'storeEnrollments'), where('uid', '==', user.uid)),
      async (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StoreEnrollment).filter((e) => e.active)
        setEnrollments(list)
        const loaded = await Promise.all(
          list.map(async (e) => {
            const p = await getDoc(doc(membersDb, 'storeProducts', e.productId)).catch(() => null)
            return p?.exists() ? ({ id: p.id, ...p.data() } as StoreProduct) : null
          })
        )
        setAllProducts(loaded.filter((p): p is StoreProduct => !!p))
        setDataReady(true)
      },
      () => setDataReady(true)
    )
    return () => {
      stopMember()
      stopEnroll()
    }
  }, [user])

  // Só os cursos desta área (principal = os sem área).
  const areaId = area ? theme.areaId ?? '__carregando__' : null
  const products = useMemo(() => allProducts.filter((p) => (p.membersAreaId || null) === areaId), [allProducts, areaId])

  const value: MembersValue = {
    user,
    member,
    enrollments,
    products,
    loading: !authReady || !dataReady || !areaReady,
    signInWithToken: async (token) => {
      await signInWithCustomToken(membersAuth, token)
    },
    logout: () => signOut(membersAuth),
    theme,
    base: membersBasePath(area),
    area,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useMembers() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMembers fora do MembersProvider')
  return v
}

/** Cor de destaque de um curso: a do produto, se foi trocada; senão a do tema. */
export function useAccent(product?: StoreProduct | null) {
  const { theme } = useMembers()
  const own = product?.members?.primaryColor
  return own && own.toLowerCase() !== '#2563eb' ? own : theme.primaryColor || '#2563eb'
}

/** Data em que um conteúdo com "libera N dias após a compra" abre para este aluno. */
export function releaseDate(enrollment: StoreEnrollment | undefined, releaseDays: number) {
  if (!releaseDays || !enrollment) return null
  const d = new Date(enrollment.createdAt)
  d.setDate(d.getDate() + releaseDays)
  return d.getTime() > Date.now() ? d : null
}
