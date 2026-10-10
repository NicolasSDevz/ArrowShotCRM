/** O CRM aberto pelo ícone na tela de início do celular (Android ou iPhone).
 *  Nesse caso ele vira o app da Loja (/app); no computador, segue o CRM completo. */
export function isStoreApp() {
  if (typeof window === 'undefined') return false
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  return standalone && window.matchMedia('(pointer: coarse)').matches
}
