import { usePrivacy } from '../../context/PrivacyContext'

/** Aviso fixo abaixo do header enquanto o "Modo apresentação" está ativo —
 *  pra ninguém esquecer que os dados na tela estão ocultos (ou, pior,
 *  esquecer de desativar antes de voltar a trabalhar de verdade). */
export function PrivacyModeBanner() {
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy()
  if (!isPrivacyMode) return null

  return (
    <div
      className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2 text-sm sm:px-5"
      style={{ backgroundColor: '#FEF3C7', borderColor: '#F59E0B', color: '#92400E' }}
    >
      <span>🙈 Modo apresentação ativo — dados sensíveis estão ocultos</span>
      <button
        onClick={togglePrivacyMode}
        className="shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold hover:bg-amber-200/60"
        style={{ color: '#92400E' }}
      >
        Desativar
      </button>
    </div>
  )
}
