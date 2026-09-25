import { createContext, useContext, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'arrowshot-privacy-mode'

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    /* private mode / storage bloqueado — usa o padrão */
    return false
  }
}

interface PrivacyContextValue {
  isPrivacyMode: boolean
  togglePrivacyMode: () => void
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null)

/** "Modo apresentação" — oculta dados sensíveis (nomes, valores, contatos) pra
 *  mostrar o sistema pra alguém sem vazar informação real. Preferência por
 *  navegador (localStorage), não fica no Firebase — mesmo padrão do
 *  ThemeContext. */
export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(readStored)

  const togglePrivacyMode = () => {
    setIsPrivacyMode((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* ignora */
      }
      return next
    })
  }

  return <PrivacyContext.Provider value={{ isPrivacyMode, togglePrivacyMode }}>{children}</PrivacyContext.Provider>
}

export function usePrivacy(): PrivacyContextValue {
  const ctx = useContext(PrivacyContext)
  if (!ctx) throw new Error('usePrivacy deve ser usado dentro de <PrivacyProvider>')
  return ctx
}
