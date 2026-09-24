import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  type User as FirebaseUser,
} from 'firebase/auth'
import { auth } from '../firebase/config'
import { ensureUserProfile, getUserProfile } from '../services/userService'
import { usePresenceHeartbeat } from '../hooks/usePresenceHeartbeat'
import type { AppUser } from '../types'

interface AuthContextValue {
  firebaseUser: FirebaseUser | null
  profile: AppUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [profile, setProfile] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user)
      if (user) {
        try {
          let p = await getUserProfile(user.uid)
          if (!p) {
            p = await ensureUserProfile(user.uid, user.email ?? '', user.displayName ?? user.email ?? 'Usuário', user.photoURL ?? undefined)
          }
          setProfile(p)
        } catch (err) {
          console.error('Failed to load user profile', err)
          setProfile(null)
        }
      } else {
        setProfile(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  // Só a equipe interna aparece como "online" — usuários-cliente do portal não.
  usePresenceHeartbeat(profile && profile.role !== 'client' ? profile.id : null)

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const signOut = async () => {
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
