import type { ReactNode } from 'react'
import { usePrivacy } from '../../context/PrivacyContext'
import { formatBRL } from '../../utils/pricing'

/** Mostra `value` normalmente, ou `mask` quando o "Modo apresentação"
 *  (ver PrivacyContext) estiver ativo. Usado pra qualquer dado sensível de
 *  texto — WhatsApp, CNPJ, e-mail, endereço, métricas — cada chamada passa a
 *  máscara certa pro tipo de dado (ex: "••• •••••-••••" pra WhatsApp). */
export function PrivateData({
  value,
  mask = '••••••••',
  className,
}: {
  value: ReactNode
  mask?: string
  className?: string
}) {
  const { isPrivacyMode } = usePrivacy()
  if (!isPrivacyMode) return <>{value}</>
  return <span className={className}>{mask}</span>
}

/** Variante pra valores monetários — formata em BRL quando visível, evitando
 *  repetir `formatBRL` em toda tela que usa PrivateData pra dinheiro. */
export function PrivateMoney({
  value,
  mask = 'R$ •.•••,••',
  className,
}: {
  value: number | null | undefined
  mask?: string
  className?: string
}) {
  const { isPrivacyMode } = usePrivacy()
  if (!isPrivacyMode) return <>{formatBRL(value ?? 0)}</>
  return <span className={className}>{mask}</span>
}
