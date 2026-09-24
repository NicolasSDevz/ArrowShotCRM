import type { LeadFormQuestion, LeadFormSubfield, LeadFormSubfieldType } from '../../types/leadForm'

export const SUBFIELD_TYPE_LABEL: Record<LeadFormSubfieldType, string> = {
  text: 'Texto',
  number: 'Número',
  time: 'Horário',
  date: 'Data',
  phone: 'Telefone',
  email: 'E-mail',
  cep: 'CEP (preenche o endereço)',
}

export const SUBFIELD_WIDTH_LABEL: Record<NonNullable<LeadFormSubfield['width']>, string> = {
  full: 'Linha inteira',
  half: 'Metade',
  third: 'Um terço',
}

export const CEP_FILL_LABEL: Record<NonNullable<LeadFormSubfield['fill']>, string> = {
  street: 'Rua',
  neighborhood: 'Bairro',
  city: 'Cidade',
  state: 'Estado',
}

const sf = (label: string, type: LeadFormSubfieldType, extra: Partial<LeadFormSubfield> = {}): LeadFormSubfield => ({
  id: crypto.randomUUID(),
  label,
  type,
  required: true,
  width: 'full',
  ...extra,
})

/** Modelos prontos pra pergunta de "vários campos" — depois de aplicar, dá
 *  pra renomear, tirar e acrescentar campos à vontade. */
export const FIELD_GROUP_PRESETS: { key: string; name: string; question: string; make: () => LeadFormSubfield[] }[] = [
  {
    key: 'address',
    name: 'Endereço',
    question: 'Qual é o endereço?',
    make: () => [
      sf('CEP', 'cep', { width: 'half' }),
      sf('Rua', 'text', { fill: 'street' }),
      sf('Número', 'text', { width: 'third' }),
      sf('Complemento', 'text', { width: 'half', required: false, placeholder: 'Apto, bloco… (opcional)' }),
      sf('Bairro', 'text', { width: 'half', fill: 'neighborhood' }),
      sf('Cidade', 'text', { width: 'half', fill: 'city' }),
      sf('Estado', 'text', { width: 'third', fill: 'state', placeholder: 'UF' }),
    ],
  },
  {
    key: 'hours',
    name: 'Horário de funcionamento',
    question: 'Qual é o horário de funcionamento?',
    make: () => [
      sf('Dias', 'text', { placeholder: 'Ex: Segunda a sexta' }),
      sf('Abre às', 'time', { width: 'half' }),
      sf('Fecha às', 'time', { width: 'half' }),
      sf('Sábado', 'text', { required: false, placeholder: 'Ex: 8h às 12h (opcional)' }),
    ],
  },
  {
    key: 'company',
    name: 'Dados da empresa',
    question: 'Conte um pouco sobre a sua empresa',
    make: () => [
      sf('Nome da empresa', 'text'),
      sf('CNPJ', 'text', { width: 'half', required: false }),
      sf('Nº de funcionários', 'number', { width: 'half', required: false }),
    ],
  },
  {
    key: 'custom',
    name: 'Em branco (monte do zero)',
    question: '',
    make: () => [sf('Campo 1', 'text')],
  },
]

export function newSubfield(): LeadFormSubfield {
  return sf('', 'text')
}

/** "Abre às: 08:00 · Fecha às: 18:00" — como a resposta aparece na ficha do lead. */
export function formatFieldsAnswer(q: Pick<LeadFormQuestion, 'subfields'>, values: string[]): string {
  return (q.subfields ?? [])
    .map((f, i) => ({ f, v: (values[i] ?? '').trim() }))
    .filter((x) => x.v)
    .map((x) => `${x.f.label}: ${x.v}`)
    .join(' · ')
}

/** Campos obrigatórios que ficaram em branco (vazio = tudo certo). */
export function missingSubfields(q: Pick<LeadFormQuestion, 'subfields' | 'required'>, values: string[]): LeadFormSubfield[] {
  const subs = q.subfields ?? []
  const missing = subs.filter((f, i) => f.required && !(values[i] ?? '').trim())
  // Pergunta obrigatória sem nenhum campo marcado como obrigatório: pelo menos um preenchido.
  if (q.required && !subs.some((f) => f.required) && !values.some((v) => (v ?? '').trim())) return subs.slice(0, 1)
  return missing
}
