/** Valor de uma resposta de formulário na ficha do lead: mantém as quebras de
 *  linha (listas) e vira link clicável quando a resposta é um endereço de site. */
export function FormAnswerValue({ value }: { value: string }) {
  if (/^https?:\/\/\S+$/.test(value.trim())) {
    return (
      <a href={value.trim()} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-brand-600 underline underline-offset-2">
        {value.trim()}
      </a>
    )
  }
  return <p className="whitespace-pre-line text-sm text-slate-700">{value}</p>
}

