import { useCallback, useState } from 'react'
import { Modal } from '../ui/Modal'
import { DailyRoutineEditor } from '../team/DailyRoutineEditor'
import type { RoutineItem } from '../../services/dailyRoutineTemplates'

export function DailyRoutineEditModal({
  open,
  onClose,
  userId,
  userName,
  items,
}: {
  open: boolean
  onClose: () => void
  userId: string
  userName: string
  items: RoutineItem[]
}) {
  const [dirty, setDirty] = useState(false)
  const handleDirtyChange = useCallback((d: boolean) => setDirty(d), [])

  // Fechar pelo X/fundo/Esc com algo não salvo descartava em silêncio — o
  // item "criado" sumia. Salvar/Cancelar do editor chamam onClose direto.
  const handleClose = () => {
    if (dirty && !confirm('Você tem alterações não salvas na rotina. Fechar e descartar?')) return
    setDirty(false)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      width="max-w-lg"
      title={
        <div>
          <p>Editar rotina diária — {userName}</p>
          <p className="mt-0.5 text-xs font-normal text-slate-400">Esses itens aparecem no seu Dashboard todos os dias</p>
        </div>
      }
    >
      <DailyRoutineEditor
        userId={userId}
        userName={userName}
        initialItems={items}
        onDone={() => {
          setDirty(false)
          onClose()
        }}
        onDirtyChange={handleDirtyChange}
      />
    </Modal>
  )
}
