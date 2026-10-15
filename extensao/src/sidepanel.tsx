import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from '../../src/context/AuthContext'
import { SidePanelApp } from './SidePanelApp'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <SidePanelApp />
    </AuthProvider>
  </StrictMode>
)
