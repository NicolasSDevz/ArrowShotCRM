import { StoreMpAccountsSection } from './StoreMpAccountsSection'

/** Loja > Recebimento: as contas de recebimento (Pix e cartão). O Pix direto no banco
 *  fica dentro de cada conta, em "Avançado". */
export function StorePaymentSettingsPanel({ principalReady, principalEmail, principalInvalid }: { principalReady: boolean; principalEmail?: string | null; principalInvalid?: boolean }) {
  return <StoreMpAccountsSection principalReady={principalReady} principalEmail={principalEmail} principalInvalid={principalInvalid} />
}
