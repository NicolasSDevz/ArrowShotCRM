import { StoreMpAccountsSection } from './StoreMpAccountsSection'

/** Loja > Recebimento: as contas de recebimento (Pix e cartão). O Pix direto no banco
 *  fica dentro de cada conta, em "Avançado". */
export function StorePaymentSettingsPanel({ principalReady }: { principalReady: boolean }) {
  return <StoreMpAccountsSection principalReady={principalReady} />
}
