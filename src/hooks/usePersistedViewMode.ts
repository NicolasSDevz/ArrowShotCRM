import { useState } from 'react'

/** Preferência de visualização (lista/blocos) lembrada por navegador via
 *  localStorage — cada tela usa sua própria `key` (ex: "clientsView",
 *  "leadsView") pra não misturar a escolha de uma página com a outra.
 *  Puramente por conveniência do dispositivo: não sincroniza entre
 *  computadores nem é lido pelo servidor. */
export function usePersistedViewMode<T extends string>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T) || defaultValue
    } catch {
      return defaultValue
    }
  })

  const set = (v: T) => {
    setValue(v)
    try {
      localStorage.setItem(key, v)
    } catch {
      // localStorage indisponível (modo privado etc.) — só não persiste
    }
  }

  return [value, set]
}
