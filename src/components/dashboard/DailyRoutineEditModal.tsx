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
  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-lg"
      title={
        <div>
          <p>Editar rotina diária — {userName}</p>
          <p className="mt-0.5 text-xs font-normal text-slate-400">Esses itens aparecem no seu Dashboard todos os dias</p>
        </div>
      }
    >
      <DailyRoutineEditor userId={userId} userName={userName} initialItems={items} onDone={onClose} />
    </Modal>
  )
}
