import { EyeOff } from 'lucide-react'
import { usePrivacy } from '../../context/PrivacyContext'

/** Aviso fixo abaixo do header enquanto o "Modo apresentação" está ativo —
 *  pra ninguém esquecer que os dados na tela estão ocultos (ou, pior,
 *  esquecer de desativar antes de voltar a trabalhar de verdade). Discreto de
 *  propósito: aparece na tela que está sendo apresentada. */
export function PrivacyModeBanner() {
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy()
  if (!isPrivacyMode) return null

  return (
    <div className="privacy-banner flex shrink-0 items-center justify-between gap-3 border-b px-4 py-1.5 text-xs sm:px-5">
      <span className="flex min-w-0 items-center gap-2">
        <EyeOff size={14} className="shrink-0" />
        <span className="truncate">
          <strong className="font-semibold">Modo apresentação</strong>
          <span className="hidden sm:inline"> · valores, contatos e dados sensíveis estão ocultos</span>
        </span>
      </span>
      <button onClick={togglePrivacyMode} className="privacy-banner-button shrink-0 rounded-md px-2.5 py-1 font-semibold transition-colors">
        Mostrar dados
      </button>
    </div>
  )
}
