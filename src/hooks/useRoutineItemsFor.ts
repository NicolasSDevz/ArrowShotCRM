import { useEffect, useState } from 'react'
import { resolveRoutinePersonKey, materializeDefaultRoutine, type RoutineItem } from '../services/dailyRoutineTemplates'
import { subscribeDailyRoutineItems, createDailyRoutineIfMissing } from '../services/dailyRoutineItemsService'

/** Itens de /dailyRoutines/{userId} de qualquer usuário — não só o logado
 *  (ver useDailyRoutine, que é o caso "próprio usuário" deste hook). Cria o
 *  documento com o padrão do cargo na primeira vez que alguém abre essa
 *  rotina (widget do Dashboard ou ficha do membro em Equipe). */
export function useRoutineItemsFor(userId: string | undefined, userName: string | undefined) {
  const [items, setItems] = useState<RoutineItem[]>([])

  useEffect(() => {
    if (!userId || !userName) {
      setItems([])
      return
    }
    return subscribeDailyRoutineItems(userId, (loaded) => {
      if (loaded != null) {
        setItems(loaded)
        return
      }
      const personKey = resolveRoutinePersonKey(userName)
      if (!personKey) {
        setItems([])
        return
      }
      // Não mostra o padrão antes de gravar: o snapshot do documento criado
      // chega em seguida com os IDs que de fato ficaram salvos.
      const defaults = materializeDefaultRoutine(personKey)
      createDailyRoutineIfMissing(userId, defaults).catch(console.error)
    })
  }, [userId, userName])

  return items
}
