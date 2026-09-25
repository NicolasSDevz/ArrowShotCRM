import { useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { contactError, type ContactKind } from '../../utils/validation'

const baseInput =
  'w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-all duration-150 ease-in-out placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100'

const fixedHeightInput = `${baseInput} h-[38px]`

export function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </span>
      {children}
    </label>
  )
}

/** `validate` = confere se é um WhatsApp (com DDD) ou e-mail válido e mostra um
 *  aviso vermelho embaixo depois que a pessoa sai do campo. */
export function Input({ validate, ...props }: InputHTMLAttributes<HTMLInputElement> & { validate?: ContactKind }) {
  const [touched, setTouched] = useState(false)
  if (!validate) return <input {...props} className={`${fixedHeightInput} ${props.className ?? ''}`} />
  const message = touched ? contactError(validate, typeof props.value === 'string' ? props.value : '') : null
  return (
    <>
      <input
        {...props}
        inputMode={props.inputMode ?? (validate === 'phone' ? 'tel' : 'email')}
        onBlur={(e) => {
          setTouched(true)
          props.onBlur?.(e)
        }}
        className={`${fixedHeightInput} ${message ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''} ${props.className ?? ''}`}
      />
      {message && <span className="mt-1 block text-xs text-red-500">{message}</span>}
    </>
  )
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${baseInput} resize-none py-2 ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fixedHeightInput} ${props.className ?? ''}`} />
}
