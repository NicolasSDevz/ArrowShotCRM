import type { LeadForm } from '../../types/leadForm'

/** Cores pra identificar de qual formulário veio cada lead no pipeline. Tons
 *  médios: legíveis como texto em fundo claro e escuro, e bem diferentes
 *  entre si. */
export const LEAD_FORM_COLORS = ['#7C3AED', '#DB2777', '#EA580C', '#059669', '#0284C7', '#D97706', '#E11D48', '#4F46E5'] as const

/** Cor do formulário: a escolhida no construtor ou, sem escolha, uma fixa
 *  tirada do próprio id (o mesmo formulário sempre com a mesma cor). */
export function leadFormColor(form: Pick<LeadForm, 'id' | 'color'>): string {
  if (form.color) return form.color
  let h = 0
  for (const ch of form.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return LEAD_FORM_COLORS[h % LEAD_FORM_COLORS.length]
}

/** O que o cartão do lead mostra sobre o formulário de origem. */
export interface LeadFormTag {
  name: string
  color: string
}
