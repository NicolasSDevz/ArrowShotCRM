import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'arrowshot-theme'

/** Páginas públicas (checkout, área de membros, formulário de captura...) têm cores
 *  próprias: o modo escuro do CRM não vale nelas (recolorava campos e cartões). */
const PUBLIC_PAGE = /^\/(pay|membros|m|captura|aprovar|relatorio|acessos|privacidade|termos)(\/|$)/
const CHECKOUT_HOST = typeof window !== 'undefined' && /^(pay|checkout|compra|loja)\./i.test(window.location.hostname)

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* private mode / storage bloqueado — usa o padrão */
  }
  return 'light'
}

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/** Tema claro/escuro. A preferência é por navegador (localStorage
 *  'arrowshot-theme'), não fica no Firebase — cada usuário tem a sua. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStored)

  // O atributo data-theme é posto pelo ThemeApplier (precisa saber a página aberta).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* ignora */
    }
  }, [theme])

  const value: ThemeContextValue = {
    theme,
    setTheme: setThemeState,
    toggleTheme: () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')),
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** Liga o modo escuro só nas telas internas do CRM. Fica dentro do <BrowserRouter>. */
export function ThemeApplier() {
  const { theme } = useTheme()
  const { pathname } = useLocation()
  const publicPage = CHECKOUT_HOST || PUBLIC_PAGE.test(pathname)
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark' && !publicPage) root.setAttribute('data-theme', 'dark')
    else root.removeAttribute('data-theme')
  }, [theme, publicPage])
  return null
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>')
  return ctx
}
