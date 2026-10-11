import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { KeyRound, Lock, Play, ShoppingCart, X } from 'lucide-react'
import { membersDb } from '../../../firebase/membersApp'
import { useAccent, useMembers } from '../../../components/store/members/MembersContext'
import { formatCents, productImages, type StoreMembersTheme, type StoreProgress } from '../../../types/store'
import { fetchMembersCatalog, type MembersCatalogItem } from '../../../services/storeApi'

const SHAPE: Record<NonNullable<StoreMembersTheme['cardShape']>, string> = {
  portrait: 'aspect-[2/3]',
  square: 'aspect-square',
  landscape: 'aspect-video',
}
const GRID: Record<NonNullable<StoreMembersTheme['cardShape']>, string> = {
  portrait: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
  square: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
  landscape: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
}
const HEIGHT = { small: 'min-h-[240px] sm:min-h-[300px]', medium: 'min-h-[340px] sm:min-h-[420px]', large: 'min-h-[440px] sm:min-h-[560px]' }

/** Banner da área no celular ou no computador (cada um pode ter o seu). */
function useBannerFor(desktop?: string | null, mobile?: string | null) {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return (narrow && mobile) || desktop || null
}

/** Início da área de membros: banner da área, "Continuar assistindo", os cursos do aluno e os bloqueados. */
export function MembersHomePage() {
  const { user, member, products, theme, base, area } = useMembers()
  const [progress, setProgress] = useState<Record<string, StoreProgress>>({})
  const [hidePasswordTip, setHidePasswordTip] = useState(false)
  const [catalog, setCatalog] = useState<MembersCatalogItem[]>([])
  // O banner principal é da área (Loja > Área de membros). Sem ele, usa o do primeiro curso, como antes.
  const hero = products.find((p) => productImages(p).banner) ?? products[0]
  const areaBanner = useBannerFor(theme.homeBannerUrl, theme.homeBannerMobileUrl)
  const heroBanner = areaBanner || (hero ? productImages(hero).banner : null)
  const heroColor = useAccent(hero)
  const shape = theme.cardShape ?? 'portrait'
  const showCardProgress = theme.cardProgress !== false
  const overlay = Math.min(80, Math.max(0, theme.homeOverlay ?? 0)) / 100
  const center = theme.homeAlign === 'center'

  useEffect(() => {
    if (!user) return
    Promise.all(
      products.map(async (p) => {
        const s = await getDoc(doc(membersDb, 'storeProgress', `${user.uid}_${p.id}`)).catch(() => null)
        return [p.id, s?.exists() ? (s.data() as StoreProgress) : null] as const
      })
    ).then((rows) => setProgress(Object.fromEntries(rows.filter(([, v]) => v)) as Record<string, StoreProgress>))
  }, [user, products])

  // Outros cursos no ar desta área: aparecem bloqueados, com botão de comprar.
  useEffect(() => {
    if (theme.showCatalog === false) return setCatalog([])
    fetchMembersCatalog(area)
      .then((r) => setCatalog(r.products))
      .catch(() => setCatalog([]))
  }, [area, theme.showCatalog])
  const owned = new Set(products.map((p) => p.id))
  const locked = catalog.filter((p) => !owned.has(p.id))

  const continuing = products.filter((p) => progress[p.id]?.lastLessonId)
  const showPasswordTip = !hidePasswordTip && member && !member.hasPassword
  const pct = (productId: string, total?: number) => {
    const done = progress[productId]?.completed?.length ?? 0
    return total ? Math.min(100, Math.round((done / total) * 100)) : 0
  }
  const title = theme.homeTitle || hero?.members?.welcomeTitle || hero?.name
  const text = theme.homeText || hero?.members?.welcomeText
  const showHero = !!hero || !!areaBanner

  return (
    <main className="pb-16">
      {showHero && (
        <section
          className={`relative flex items-end bg-[var(--m-card)] bg-cover bg-center ${HEIGHT[theme.homeBannerHeight ?? 'medium']}`}
          style={heroBanner ? { backgroundImage: `url(${heroBanner})` } : undefined}
        >
          {overlay > 0 && <div className="absolute inset-0 bg-black" style={{ opacity: overlay }} aria-hidden="true" />}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--m-bg)] via-[color-mix(in_srgb,var(--m-bg)_50%,transparent)] to-transparent" aria-hidden="true" />
          <div className={`relative mx-auto w-full max-w-7xl px-4 pb-10 ${center ? 'flex flex-col items-center text-center' : ''}`}>
            {theme.homeGreeting !== false && <p className="text-sm text-[var(--m-text2)]">Olá, {member?.name?.split(' ')[0] || 'aluno'}!</p>}
            {title && <h1 className="mt-1 max-w-2xl text-3xl font-extrabold sm:text-5xl">{title}</h1>}
            {text && <p className="mt-3 max-w-xl whitespace-pre-line text-[var(--m-text2)]">{text}</p>}
            {hero && (
              <Link
                to={`${base}/curso/${hero.id}`}
                className="mt-5 inline-flex items-center gap-2 px-6 py-3 font-semibold text-white"
                style={{ background: heroColor, borderRadius: 'var(--m-radius)' }}
              >
                <Play size={18} fill="currentColor" aria-hidden="true" /> {theme.homeButtonText || (progress[hero.id]?.lastLessonId ? 'Continuar' : 'Começar')}
              </Link>
            )}
          </div>
        </section>
      )}

      <div className={`mx-auto max-w-7xl space-y-10 px-4 ${showHero ? 'pt-8' : 'pt-10'}`}>
        {showPasswordTip && (
          <div className="flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--m-primary)_30%,transparent)] bg-[color-mix(in_srgb,var(--m-primary)_10%,transparent)] p-4 text-sm" role="status">
            <KeyRound size={20} className="mt-0.5 shrink-0 text-[var(--m-primary)]" aria-hidden="true" />
            <p className="flex-1">
              Crie uma senha para entrar depois só com o seu e-mail.{' '}
              <Link to={`${base}/perfil`} className="font-semibold text-[var(--m-primary)] hover:underline">Criar senha agora</Link>
            </p>
            <button onClick={() => setHidePasswordTip(true)} aria-label="Fechar aviso" className="text-[var(--m-muted)] hover:text-[var(--m-text)]"><X size={18} /></button>
          </div>
        )}

        {continuing.length > 0 && (
          <section aria-labelledby="continue-title">
            <h2 id="continue-title" className="mb-3 text-xl font-bold">{theme.continueTitle || 'Continuar assistindo'}</h2>
            <ul className="flex gap-4 overflow-x-auto pb-2">
              {continuing.map((p) => (
                <li key={p.id} className="w-72 shrink-0">
                  <Link to={`${base}/curso/${p.id}/aula/${progress[p.id].lastLessonId}`} className="group block overflow-hidden bg-[var(--m-card)]" style={{ borderRadius: 'var(--m-radius)' }}>
                    <div className="aspect-video bg-[var(--m-card2)] bg-cover bg-center" style={{ backgroundImage: `url(${productImages(p).banner || ''})` }} />
                    <div className="p-3">
                      <p className="truncate font-semibold group-hover:underline">{p.name}</p>
                      <p className="text-xs text-[var(--m-muted)]">{progress[p.id].completed?.length ?? 0} aulas concluídas</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="courses-title">
          <h2 id="courses-title" className="mb-3 text-xl font-bold">{theme.coursesTitle || 'Meus cursos'}</h2>
          {products.length === 0 ? (
            <p className="text-[var(--m-muted)]">Você ainda não tem cursos liberados neste e-mail. Se acabou de comprar, aguarde a confirmação do pagamento.</p>
          ) : (
            <ul className={`grid gap-4 ${GRID[shape]}`}>
              {products.map((p) => {
                const img = shape === 'landscape' ? productImages(p).banner : productImages(p).cover
                const done = pct(p.id, p.lessonCount)
                return (
                  <li key={p.id}>
                    <Link to={`${base}/curso/${p.id}`} className="group block">
                      <div
                        className={`${SHAPE[shape]} overflow-hidden bg-[var(--m-card2)] bg-cover bg-center ring-[var(--m-border)] transition group-hover:scale-[1.03] group-hover:ring-2`}
                        style={{ backgroundImage: `url(${img || ''})`, borderRadius: 'var(--m-radius)' }}
                      >
                        {!img && <span className="flex h-full items-center justify-center p-3 text-center font-semibold">{p.name}</span>}
                      </div>
                      {showCardProgress && (p.lessonCount ?? 0) > 0 && (
                        <div className="mt-2 h-1 rounded-full bg-[var(--m-soft2)]" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.name}: ${done}% concluído`}>
                          <div className="h-1 rounded-full bg-[var(--m-primary)]" style={{ width: `${done}%` }} />
                        </div>
                      )}
                      <p className="mt-2 truncate text-sm font-medium">{p.name}</p>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {locked.length > 0 && (
          <section aria-labelledby="more-title">
            <h2 id="more-title" className="mb-1 text-xl font-bold">{theme.catalogTitle || 'Mais conteúdos para você'}</h2>
            <p className="mb-3 text-sm text-[var(--m-muted)]">Você ainda não tem acesso a estes. Compre e eles aparecem aqui em {theme.coursesTitle || 'Meus cursos'}, no mesmo e-mail.</p>
            <ul className={`grid gap-4 ${GRID[shape]}`}>
              {locked.map((p) => (
                <li key={p.id} className="flex flex-col">
                  <a href={p.buyUrl} target="_blank" rel="noreferrer" className="group block" aria-label={`${p.name}: bloqueado. Comprar por ${formatCents(p.price)}`}>
                    <div
                      className={`relative ${SHAPE[shape]} overflow-hidden bg-[var(--m-card2)] bg-cover bg-center ring-[var(--m-border)] transition group-hover:ring-2`}
                      style={{ ...(p.coverUrl ? { backgroundImage: `url(${p.coverUrl})` } : {}), borderRadius: 'var(--m-radius)' }}
                    >
                      {!p.coverUrl && <span className="flex h-full items-center justify-center p-3 text-center font-semibold">{p.name}</span>}
                      <span className="absolute inset-0 bg-black/45 transition group-hover:bg-black/30" aria-hidden="true" />
                      <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white" aria-hidden="true">
                        <Lock size={15} />
                      </span>
                    </div>
                  </a>
                  <p className="mt-2 truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-[var(--m-muted)]">
                    {p.comparePrice && p.comparePrice > p.price && <span className="mr-1.5 line-through">{formatCents(p.comparePrice)}</span>}
                    {formatCents(p.price)}
                  </p>
                  <a
                    href={p.buyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
                    style={{ background: heroColor, borderRadius: 'var(--m-radius)' }}
                  >
                    <ShoppingCart size={15} aria-hidden="true" /> Comprar
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}
