import { useEffect, useState } from 'react'
import { resolveRoutinePersonKey, materializeDefaultRoutine, type RoutineItem } from '../services/dailyRoutineTemplates'
import { subscribeDailyRoutineItems, saveDailyRoutineItems } from '../services/dailyRoutineItemsService'

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
      const defaults = materializeDefaultRoutine(personKey)
      setItems(defaults)
      saveDailyRoutineItems(userId, defaults).catch(console.error)
    })
  }, [userId, userName])

  return items
}
