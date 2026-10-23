import { lazy, type ComponentType } from 'react'

const RELOAD_KEY = 'arrowshot-chunk-reload'

/** Carrega uma tela só quando ela abre (o checkout não baixa o CRM inteiro).
 *  Depois de um deploy, quem estava com o site aberto pede um arquivo que não
 *  existe mais; aí recarrega a página uma vez para pegar a versão nova. */
export function lazyPage<M extends Record<string, unknown>, K extends keyof M>(
  load: () => Promise<M>,
  name: K,
) {
  return lazy(async () => {
    try {
      const mod = await load()
      try {
        sessionStorage.removeItem(RELOAD_KEY)
      } catch {
        /* ignora */
      }
      return { default: mod[name] as ComponentType<any> }
    } catch (err) {
      let alreadyReloaded = false
      try {
        alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === '1'
        sessionStorage.setItem(RELOAD_KEY, '1')
      } catch {
        alreadyReloaded = true
      }
      if (!alreadyReloaded) {
        window.location.reload()
        return new Promise<never>(() => {})
      }
      throw err
    }
  })
}
