import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  type User as FirebaseUser,
} from 'firebase/auth'
import { auth } from '../firebase/config'
import { ensureUserProfile, subscribeUserProfile } from '../services/userService'
import { usePresenceHeartbeat } from '../hooks/usePresenceHeartbeat'
import { clearSharedSubscriptions } from '../hooks/useCollectionSubscription'
import {
  checkServerSession,
  markManualSignOut,
  noteAuthError,
  noteAuthOk,
  noteDbBlocked,
  noteSignedIn,
  noteSignedOut,
} from '../services/sessionDiagnostics'
import type { AppUser } from '../types'

interface AuthContextValue {
  firebaseUser: FirebaseUser | null
  profile: AppUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
}

/** Igual ignorando a presença: touchPresence grava lastSeenAt/presenceState no
 *  doc do perfil (ao mudar de estado e a cada 4 min), e isso não pode virar um "perfil novo" que faz o
 *  app inteiro renderizar de novo. */
function sameProfile(a: AppUser, b: AppUser): boolean {
  const strip = ({ lastSeenAt: _l, presenceState: _p, session: _s, lastSessionIssue: _i, ...rest }: AppUser) => rest
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b))
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [profile, setProfile] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let stopProfile: (() => void) | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let tokenTimer: ReturnType<typeof setInterval> | null = null
    // Falhas seguidas do perfil e se a sessão já foi conferida neste login (diagnóstico de queda).
    let profileFailures = 0
    let sessionCheckedFor: string | null = null
    const clearProfileWatch = () => {
      stopProfile?.()
      stopProfile = null
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = null
    }

    // Perfil em tempo real em vez de um getDoc só: se a conexão com o
    // Firestore cair bem na hora do login (antivírus/extensão derrubando a
    // conexão), antes o perfil ficava null e a tela travava em "Preparando
    // seu acesso" — parecia que a pessoa tinha sido desconectada. Agora, se
    // o listener falhar, ele tenta de novo sozinho, e um perfil que já
    // carregou nunca é apagado por erro de rede.
    const watchProfile = (user: FirebaseUser) => {
      clearProfileWatch()
      stopProfile = subscribeUserProfile(
        user.uid,
        async (p, fromCache) => {
          profileFailures = 0
          if (p) {
            if (!fromCache && sessionCheckedFor !== user.uid) {
              sessionCheckedFor = user.uid
              void checkServerSession(user.uid, p.session ?? undefined)
            }
            setProfile((prev) => (prev && sameProfile(prev, p) ? prev : p))
            setLoading(false)
            return
          }
          if (fromCache) return // ainda sem resposta do servidor
          try {
            setProfile(
              await ensureUserProfile(user.uid, user.email ?? '', user.displayName ?? user.email ?? 'Usuário', user.photoURL ?? undefined)
            )
          } catch (err) {
            console.error('Failed to create user profile', err)
          }
          setLoading(false)
        },
        (err) => {
          console.error('Falha ao carregar o perfil, tentando de novo', err)
          profileFailures += 1
          if (profileFailures === 3) noteDbBlocked(err.code)
          setLoading(false)
          clearProfileWatch()
          retryTimer = setTimeout(() => watchProfile(user), 3000)
        }
      )
    }

    // Renovar o login de tempos em tempos expõe quando algo (extensão,
    // antivírus) bloqueia o securetoken.googleapis.com — ver sessionDiagnostics.
    const checkToken = (user: FirebaseUser) =>
      user
        .getIdToken()
        .then(noteAuthOk)
        .catch((err: { code?: string }) => noteAuthError(err?.code ?? 'desconhecido'))

    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user)
      if (tokenTimer) clearInterval(tokenTimer)
      tokenTimer = null
      if (user) {
        noteSignedIn(user.uid)
        tokenTimer = setInterval(() => void checkToken(user), 5 * 60_000)
        watchProfile(user)
      } else {
        noteSignedOut()
        clearSharedSubscriptions()
        sessionCheckedFor = null
        clearProfileWatch()
        setProfile(null)
        setLoading(false)
      }
    })
    return () => {
      unsub()
      if (tokenTimer) clearInterval(tokenTimer)
      clearProfileWatch()
    }
  }, [])

  // Só a equipe interna aparece como "online" — usuários-cliente do portal não.
  usePresenceHeartbeat(profile && profile.role !== 'client' ? profile.id : null)

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const signOut = async () => {
    await markManualSignOut(auth.currentUser?.uid)
    await fbSignOut(auth)
  }

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email)
  }

  return (
    <AuthContext.Provider value={{ firebaseUser, profile, loading, signIn, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
