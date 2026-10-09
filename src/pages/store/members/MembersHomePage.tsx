import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { KeyRound, Play, X } from 'lucide-react'
import { membersDb } from '../../../firebase/membersApp'
import { useMembers } from '../../../components/store/members/MembersContext'
import type { StoreProgress } from '../../../types/store'

/** /membros — vitrine: banner, "Continuar assistindo" e os cursos do aluno. */
export function MembersHomePage() {
  const { user, member, products } = useMembers()
  const [progress, setProgress] = useState<Record<string, StoreProgress>>({})
  const [hidePasswordTip, setHidePasswordTip] = useState(false)
  const hero = products.find((p) => p.members?.bannerUrl) ?? products[0]

  useEffect(() => {
    if (!user) return
    Promise.all(
      products.map(async (p) => {
        const s = await getDoc(doc(membersDb, 'storeProgress', `${user.uid}_${p.id}`)).catch(() => null)
        return [p.id, s?.exists() ? (s.data() as StoreProgress) : null] as const
      })
    ).then((rows) => setProgress(Object.fromEntries(rows.filter(([, v]) => v)) as Record<string, StoreProgress>))
  }, [user, products])

  const continuing = products.filter((p) => progress[p.id]?.lastLessonId)
  const showPasswordTip = !hidePasswordTip && member && !member.hasPassword

  return (
    <main className="pb-16">
      {hero && (
        <section
          className="relative flex min-h-[340px] items-end bg-neutral-900 bg-cover bg-center sm:min-h-[420px]"
          style={hero.members?.bannerUrl ? { backgroundImage: `url(${hero.members.bannerUrl})` } : undefined}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/50 to-transparent" aria-hidden="true" />
          <div className="relative mx-auto w-full max-w-7xl px-4 pb-10">
            <p className="text-sm text-neutral-300">Olá, {member?.name?.split(' ')[0] || 'aluno'}!</p>
            <h1 className="mt-1 max-w-2xl text-3xl font-extrabold sm:text-5xl">{hero.members?.welcomeTitle || hero.name}</h1>
            {hero.members?.welcomeText && <p className="mt-3 max-w-xl text-neutral-300">{hero.members.welcomeText}</p>}
            <Link
              to={`/membros/curso/${hero.id}`}
              className="mt-5 inline-flex items-center gap-2 rounded-lg px-6 py-3 font-semibold text-white"
              style={{ background: hero.members?.primaryColor || '#2563eb' }}
            >
              <Play size={18} fill="currentColor" aria-hidden="true" /> {progress[hero.id]?.lastLessonId ? 'Continuar' : 'Começar'}
            </Link>
          </div>
        </section>
      )}

      <div className="mx-auto max-w-7xl space-y-10 px-4 pt-8">
        {showPasswordTip && (
          <div className="flex items-start gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm" role="status">
            <KeyRound size={20} className="mt-0.5 shrink-0 text-blue-400" aria-hidden="true" />
            <p className="flex-1">
              Crie uma senha para entrar depois só com o seu e-mail.{' '}
              <Link to="/membros/perfil" className="font-semibold text-blue-400 hover:underline">Criar senha agora</Link>
            </p>
            <button onClick={() => setHidePasswordTip(true)} aria-label="Fechar aviso" className="text-neutral-400 hover:text-white"><X size={18} /></button>
          </div>
        )}

        {continuing.length > 0 && (
          <section aria-labelledby="continue-title">
            <h2 id="continue-title" className="mb-3 text-xl font-bold">Continuar assistindo</h2>
            <ul className="flex gap-4 overflow-x-auto pb-2">
              {continuing.map((p) => (
                <li key={p.id} className="w-72 shrink-0">
                  <Link to={`/membros/curso/${p.id}/aula/${progress[p.id].lastLessonId}`} className="group block overflow-hidden rounded-xl bg-neutral-900">
                    <div className="aspect-video bg-neutral-800 bg-cover bg-center" style={{ backgroundImage: `url(${p.members?.bannerUrl || p.imageUrl || ''})` }} />
                    <div className="p-3">
                      <p className="truncate font-semibold group-hover:underline">{p.name}</p>
                      <p className="text-xs text-neutral-400">{progress[p.id].completed?.length ?? 0} aulas concluídas</p>
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
            <p className="text-neutral-400">Você ainda não tem cursos liberados neste e-mail. Se acabou de comprar, aguarde a confirmação do pagamento.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {products.map((p) => (
                <li key={p.id}>
                  <Link to={`/membros/curso/${p.id}`} className="group block">
                    <div
                      className="aspect-[2/3] overflow-hidden rounded-xl bg-neutral-800 bg-cover bg-center ring-white/40 transition group-hover:scale-[1.03] group-hover:ring-2"
                      style={{ backgroundImage: `url(${p.members?.coverUrl || p.imageUrl || ''})` }}
                    >
                      {!p.members?.coverUrl && !p.imageUrl && <span className="flex h-full items-center justify-center p-3 text-center font-semibold">{p.name}</span>}
                    </div>
                    <p className="mt-2 truncate text-sm font-medium">{p.name}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
