import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { memberEnter, memberLogin, memberSetPassword } from '../../../services/storeApi'
import { useMembers } from '../../../components/store/members/MembersContext'
import { Spinner } from '../../../components/ui/FullPageSpinner'

const inputCls = 'h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none placeholder:text-neutral-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4" style={{ colorScheme: 'dark' }}>
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-7 text-neutral-100">
        <h1 className="mb-5 text-xl font-bold">{title}</h1>
        {children}
      </div>
    </main>
  )
}

/** /membros/login — e-mail e senha (a senha é criada pelo aluno no primeiro acesso). */
export function MembersLoginPage() {
  const { user, loading, signInWithToken } = useMembers()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to="/membros" replace />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { token } = await memberLogin(email, password)
      await signInWithToken(token)
      navigate('/membros', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Acessar área de membros">
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block text-sm text-neutral-400">
          E-mail usado na compra
          <input className={`${inputCls} mt-1`} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="block text-sm text-neutral-400">
          Senha
          <input className={`${inputCls} mt-1`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <button disabled={busy} className="h-11 w-full rounded-lg bg-blue-600 font-semibold text-white hover:bg-blue-500 disabled:opacity-60">
          {busy ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
      <p className="mt-5 text-sm text-neutral-400">
        Primeiro acesso? Use o botão <strong>Acessar a área de membros</strong> que aparece depois da compra (e no e-mail). Lá dentro você cria a sua senha.
      </p>
    </AuthCard>
  )
}

/** /membros/entrar?code= — link de acesso que sai na compra ou que a equipe gera no CRM. */
export function MembersEnterPage() {
  const [params] = useSearchParams()
  const { signInWithToken } = useMembers()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const code = params.get('code') || ''
    memberEnter(code)
      .then(async ({ token, hasPassword }) => {
        await signInWithToken(token)
        navigate(hasPassword ? '/membros' : '/membros?bemvindo=1', { replace: true })
      })
      .catch((err: Error) => setError(err.message))
  }, [params, signInWithToken, navigate])

  return (
    <AuthCard title={error ? 'Não deu certo' : 'Entrando...'}>
      {error ? (
        <>
          <p role="alert" className="text-sm text-red-400">{error}</p>
          <Link to="/membros/login" className="mt-4 inline-block text-sm text-blue-400 hover:underline">Entrar com e-mail e senha</Link>
        </>
      ) : (
        <p className="flex items-center gap-2 text-sm text-neutral-400" aria-live="polite"><Spinner className="h-4 w-4" /> Liberando o seu acesso</p>
      )}
    </AuthCard>
  )
}

/** /membros/perfil — dados do aluno e criação/troca de senha. */
export function MembersProfilePage() {
  const { member } = useMembers()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setMsg('')
    setError('')
    if (password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.')
    if (password !== password2) return setError('As senhas não são iguais.')
    setBusy(true)
    try {
      await memberSetPassword(password)
      setPassword('')
      setPassword2('')
      setMsg('Senha salva. Agora você pode entrar com o seu e-mail e essa senha.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-bold">Meu perfil</h1>
      <dl className="mt-5 space-y-2 rounded-xl border border-white/10 bg-neutral-900 p-5 text-sm">
        <div><dt className="text-neutral-500">Nome</dt><dd>{member?.name}</dd></div>
        <div><dt className="text-neutral-500">E-mail</dt><dd>{member?.email}</dd></div>
      </dl>
      <form onSubmit={onSubmit} className="mt-6 space-y-3 rounded-xl border border-white/10 bg-neutral-900 p-5">
        <h2 className="font-semibold">{member?.hasPassword ? 'Trocar senha' : 'Criar senha'}</h2>
        <label className="block text-sm text-neutral-400">
          Nova senha
          <input className={`${inputCls} mt-1`} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="block text-sm text-neutral-400">
          Repita a senha
          <input className={`${inputCls} mt-1`} type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        {msg && <p role="status" className="text-sm text-emerald-400">{msg}</p>}
        <button disabled={busy} className="h-11 rounded-lg bg-blue-600 px-5 font-semibold text-white hover:bg-blue-500 disabled:opacity-60">
          {busy ? 'Salvando...' : 'Salvar senha'}
        </button>
      </form>
    </main>
  )
}
