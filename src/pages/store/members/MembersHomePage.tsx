import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { KeyRound, Lock, Play, ShoppingCart, X } from 'lucide-react'
import { membersDb } from '../../../firebase/membersApp'
import { useAccent, useMembers } from '../../../components/store/members/MembersContext'
import { formatCents, productImages, type StoreProgress } from '../../../types/store'
import { fetchMembersCatalog, type MembersCatalogItem } from '../../../services/storeApi'

/** /membros — vitrine: banner, "Continuar assistindo" e os cursos do aluno. */
export function MembersHomePage() {
  const { user, member, products } = useMembers()
  const [progress, setProgress] = useState<Record<string, StoreProgress>>({})
  const [hidePasswordTip, setHidePasswordTip] = useState(false)
  const [catalog, setCatalog] = useState<MembersCatalogItem[]>([])
  const hero = products.find((p) => productImages(p).banner) ?? products[0]
  const heroBanner = hero ? productImages(hero).banner : null
  const heroColor = useAccent(hero)

  useEffect(() => {
    if (!user) return
    Promise.all(
      products.map(async (p) => {
        const s = await getDoc(doc(membersDb, 'storeProgress', `${user.uid}_${p.id}`)).catch(() => null)
        return [p.id, s?.exists() ? (s.data() as StoreProgress) : null] as const
      })
    ).then((rows) => setProgress(Object.fromEntries(rows.filter(([, v]) => v)) as Record<string, StoreProgress>))
  }, [user, products])

  // Outros produtos no ar: aparecem bloqueados, com botão de comprar.
  useEffect(() => {
    fetchMembersCatalog()
      .then((r) => setCatalog(r.products))
      .catch(() => setCatalog([]))
  }, [])
  const owned = new Set(products.map((p) => p.id))
  const locked = catalog.filter((p) => !owned.has(p.id))

  const continuing = products.filter((p) => progress[p.id]?.lastLessonId)
  const showPasswordTip = !hidePasswordTip && member && !member.hasPassword

  return (
    <main className="pb-16">
      {hero && (
        <section
          className="relative flex min-h-[340px] items-end bg-[var(--m-card)] bg-cover bg-center sm:min-h-[420px]"
          style={heroBanner ? { backgroundImage: `url(${heroBanner})` } : undefined}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--m-bg)] via-[color-mix(in_srgb,var(--m-bg)_50%,transparent)] to-transparent" aria-hidden="true" />
          <div className="relative mx-auto w-full max-w-7xl px-4 pb-10">
            <p className="text-sm text-[var(--m-text2)]">Olá, {member?.name?.split(' ')[0] || 'aluno'}!</p>
            <h1 className="mt-1 max-w-2xl text-3xl font-extrabold sm:text-5xl">{hero.members?.welcomeTitle || hero.name}</h1>
            {hero.members?.welcomeText && <p className="mt-3 max-w-xl text-[var(--m-text2)]">{hero.members.welcomeText}</p>}
            <Link
              to={`/membros/curso/${hero.id}`}
              className="mt-5 inline-flex items-center gap-2 rounded-lg px-6 py-3 font-semibold text-white"
              style={{ background: heroColor }}
            >
              <Play size={18} fill="currentColor" aria-hidden="true" /> {progress[hero.id]?.lastLessonId ? 'Continuar' : 'Começar'}
            </Link>
          </div>
        </section>
      )}

      <div className="mx-auto max-w-7xl space-y-10 px-4 pt-8">
        {showPasswordTip && (
          <div className="flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--m-primary)_30%,transparent)] bg-[color-mix(in_srgb,var(--m-primary)_10%,transparent)] p-4 text-sm" role="status">
            <KeyRound size={20} className="mt-0.5 shrink-0 text-[var(--m-primary)]" aria-hidden="true" />
            <p className="flex-1">
              Crie uma senha para entrar depois só com o seu e-mail.{' '}
              <Link to="/membros/perfil" className="font-semibold text-[var(--m-primary)] hover:underline">Criar senha agora</Link>
            </p>
            <button onClick={() => setHidePasswordTip(true)} aria-label="Fechar aviso" className="text-[var(--m-muted)] hover:text-[var(--m-text)]"><X size={18} /></button>
          </div>
        )}

        {continuing.length > 0 && (
          <section aria-labelledby="continue-title">
            <h2 id="continue-title" className="mb-3 text-xl font-bold">Continuar assistindo</h2>
            <ul className="flex gap-4 overflow-x-auto pb-2">
              {continuing.map((p) => (
                <li key={p.id} className="w-72 shrink-0">
                  <Link to={`/membros/curso/${p.id}/aula/${progress[p.id].lastLessonId}`} className="group block overflow-hidden rounded-xl bg-[var(--m-card)]">
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
          <h2 id="courses-title" className="mb-3 text-xl font-bold">Meus cursos</h2>
          {products.length === 0 ? (
            <p className="text-[var(--m-muted)]">Você ainda não tem cursos liberados neste e-mail. Se acabou de comprar, aguarde a confirmação do pagamento.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {products.map((p) => (
                <li key={p.id}>
                  <Link to={`/membros/curso/${p.id}`} className="group block">
                    <div
                      className="aspect-[2/3] overflow-hidden rounded-xl bg-[var(--m-card2)] bg-cover bg-center ring-[var(--m-border)] transition group-hover:scale-[1.03] group-hover:ring-2"
                      style={{ backgroundImage: `url(${productImages(p).cover || ''})` }}
                    >
                      {!productImages(p).cover && <span className="flex h-full items-center justify-center p-3 text-center font-semibold">{p.name}</span>}
                    </div>
                    <p className="mt-2 truncate text-sm font-medium">{p.name}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {locked.length > 0 && (
          <section aria-labelledby="more-title">
            <h2 id="more-title" className="mb-1 text-xl font-bold">Mais conteúdos para você</h2>
            <p className="mb-3 text-sm text-[var(--m-muted)]">Você ainda não tem acesso a estes. Compre e eles aparecem aqui em Meus cursos, no mesmo e-mail.</p>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {locked.map((p) => (
                <li key={p.id} className="flex flex-col">
                  <a href={p.buyUrl} target="_blank" rel="noreferrer" className="group block" aria-label={`${p.name}: bloqueado. Comprar por ${formatCents(p.price)}`}>
                    <div
                      className="relative aspect-[2/3] overflow-hidden rounded-xl bg-[var(--m-card2)] bg-cover bg-center ring-[var(--m-border)] transition group-hover:ring-2"
                      style={p.coverUrl ? { backgroundImage: `url(${p.coverUrl})` } : undefined}
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
                    className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
                    style={{ background: heroColor }}
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
