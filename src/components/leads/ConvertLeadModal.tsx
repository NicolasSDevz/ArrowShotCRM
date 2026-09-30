import { useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { TriangleAlert } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { useClients } from '../../hooks/useClients'
import { convertLeadToClient, linkLeadToClient } from '../../services/leadService'
import { findClientMatch, MATCH_REASON_LABEL } from '../../utils/leadDuplicates'
import type { Lead } from '../../types'

/** Converter lead em cliente — usado pelo Kanban (ao arrastar pra etapa de
 *  ganho) e pela ficha do lead. Se o contato já é cliente (mesmo WhatsApp,
 *  e-mail ou nome de empresa), oferece vincular ao cadastro existente em vez
 *  de criar um duplicado. */
export function ConvertLeadModal({
  lead,
  onClose,
  onDone,
  intro,
}: {
  lead: Lead | null
  onClose: () => void
  onDone: (clientId: string) => void
  /** Frase de abertura (ex: "X foi movido para Fechado."). */
  intro?: ReactNode
}) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const { data: clients } = useClients()
  const [busy, setBusy] = useState<'link' | 'create' | null>(null)

  const match = lead ? findClientMatch(lead, clients) : null
  const name = lead?.companyName?.trim() || lead?.contactName

  const run = async (kind: 'link' | 'create') => {
    if (!profile || !lead) return
    setBusy(kind)
    try {
      if (kind === 'link' && match) {
        await linkLeadToClient(lead, match.client, profile.id, profile.name)
        toast.success(`Lead vinculado a ${match.client.companyName}`)
        onDone(match.client.id)
      } else {
        const clientId = await convertLeadToClient(lead, profile.id, profile.name, users)
        toast.success('Lead convertido em cliente')
        onDone(clientId)
      }
    } catch (err) {
      console.error(err)
      toast.error(kind === 'link' ? 'Erro ao vincular o lead' : 'Erro ao converter lead')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={!!lead} onClose={onClose} title="Converter em cliente">
      <div className="flex flex-col gap-4">
        {intro && <p className="text-sm text-slate-500">{intro}</p>}
        {match ? (
          <>
            <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <p>
                Já existe o cliente <span className="font-semibold">{match.client.companyName}</span> com o {MATCH_REASON_LABEL[match.reason]} deste lead.
                Vincule o lead a ele para não criar um cadastro duplicado.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={onClose} disabled={!!busy}>
                Agora não
              </Button>
              <Button variant="secondary" onClick={() => void run('create')} loading={busy === 'create'} disabled={!!busy}>
                Criar outro cliente mesmo assim
              </Button>
              <Button onClick={() => void run('link')} loading={busy === 'link'} disabled={!!busy} className="bg-emerald-600 hover:bg-emerald-700">
                Vincular a {match.client.companyName}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-500">
              Criar o cliente <span className="font-semibold text-slate-700">{name}</span> com os dados deste lead? As tarefas de onboarding serão geradas
              automaticamente.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose} disabled={!!busy}>
                Agora não
              </Button>
              <Button onClick={() => void run('create')} loading={busy === 'create'} disabled={!!busy} className="bg-emerald-600 hover:bg-emerald-700">
                Converter em cliente
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
