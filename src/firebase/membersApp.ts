import { initializeApp, getApps } from 'firebase/app'
import { browserLocalPersistence, initializeAuth, getAuth, type Auth } from 'firebase/auth'
import { initializeFirestore, getFirestore, type Firestore } from 'firebase/firestore'
import { app as crmApp } from './config'

/** App Firebase separado para os ALUNOS da área de membros.
 *
 *  Mesmo projeto, mas outra instância com nome próprio: a sessão do aluno fica
 *  guardada à parte e nunca aparece no AuthProvider do CRM (que criaria um
 *  perfil de funcionário em users/ para quem logasse). Se alguém da equipe
 *  abrir a área de membros, continua logado no CRM normalmente. */
const NAME = 'members'

const membersApp = getApps().find((a) => a.name === NAME) ?? initializeApp(crmApp.options, NAME)

function initAuth(): Auth {
  try {
    return initializeAuth(membersApp, { persistence: browserLocalPersistence })
  } catch {
    return getAuth(membersApp)
  }
}

function initDb(): Firestore {
  try {
    return initializeFirestore(membersApp, { ignoreUndefinedProperties: true, experimentalForceLongPolling: true })
  } catch {
    return getFirestore(membersApp)
  }
}

export const membersAuth = initAuth()
export const membersDb = initDb()
