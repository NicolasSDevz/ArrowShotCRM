import { useMemo, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { TriangleAlert, UserCheck } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, Input, Select } from '../ui/Field'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { useClients } from '../../hooks/useClients'
import { convertLeadToClient, linkLeadToClient, markLeadAsClientContact } from '../../services/leadService'
import { findClientMatch, MATCH_REASON_LABEL } from '../../utils/leadDuplicates'
import type { Lead } from '../../types'

/** Converter lead em cliente — usado pelo Kanban (ao arrastar pra etapa de
 *  ganho) e pela ficha do lead. Três saídas:
 *  - "É pessoa do cliente": o contato é de um cliente que já existe (dona,
 *    sócio, gerente). Vai pros contatos do cliente e o card sai do funil —
 *    não conta como venda.
 *  - "Venda nova para X": cliente que já existe comprou algo novo (vincula,
 *    conta como venda).
 *  - "Converter em cliente": cliente novo. */
export function ConvertLeadModal({
  lead,
  onClose,
  onDone,
  intro,
  contactOnly,
}: {
  lead: Lead | null
  onClose: () => void
  onDone: (clientId: string) => void
  /** Frase de abertura (ex: "X foi movido para Fechado."). */
  intro?: ReactNode
  /** Aberto pelo botão "Já é cliente": mostra só a escolha do cliente. */
  contactOnly?: boolean
}) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const { data: clients } = useClients()
  const [busy, setBusy] = useState<'link' | 'create' | 'contact' | null>(null)
  const [pickedId, setPickedId] = useState('')
  const [role, setRole] = useState('')

  const match = lead ? findClientMatch(lead, clients) : null
  const name = lead?.companyName?.trim() || lead?.contactName
  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => Number(a.status === 'churned') - Number(b.status === 'churned') || a.companyName.localeCompare(b.companyName, 'pt-BR')),
    [clients]
  )
  const contactClient = clients.find((c) => c.id === (pickedId || match?.client.id))

  const close = () => {
    setPickedId('')
    setRole('')
    onClose()
  }

  const run = async (kind: 'link' | 'create' | 'contact') => {
    if (!profile || !lead) return
    setBusy(kind)
    try {
      if (kind === 'contact' && contactClient) {
        await markLeadAsClientContact(lead, contactClient, role, profile.id, profile.name)
        toast.success(`${lead.contactName} agora é contato de ${contactClient.companyName} (não contou como venda)`)
        setPickedId('')
        setRole('')
        onDone(contactClient.id)
      } else if (kind === 'link' && match) {
        await linkLeadToClient(lead, match.client, profile.id, profile.name)
        toast.success(`Venda vinculada a ${match.client.companyName}`)
        onDone(match.client.id)
      } else {
        const clientId = await convertLeadToClient(lead, profile.id, profile.name, users)
        toast.success('Lead convertido em cliente')
        onDone(clientId)
      }
    } catch (err) {
      console.error(err)
      toast.error(kind === 'create' ? 'Erro ao converter lead' : 'Erro ao vincular o lead')
    } finally {
      setBusy(null)
    }
  }

  const roleField = (
    <Field label="Cargo da pessoa (opcional)">
      <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ex: proprietária, sócio, gerente" />
    </Field>
  )

  // Escolher o cliente na mão (quando o CRM não achou sozinho).
  const picker = (
    <div className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        <UserCheck size={15} /> Já é cliente?
      </p>
      <p className="text-xs text-slate-500">
        Se essa pessoa é de um cliente que já temos (dona, sócio, gerente), escolha o cliente. Ela entra nos contatos dele, o card sai do funil e{' '}
        <span className="font-semibold">não conta como venda</span>.
      </p>
      <Field label="Cliente">
        <Select value={pickedId} onChange={(e) => setPickedId(e.target.value)}>
          <option value="">Escolha o cliente...</option>
          {sortedClients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.companyName}
              {c.status === 'churned' ? ' (ex-cliente)' : ''}
            </option>
          ))}
        </Select>
      </Field>
      {pickedId && roleField}
      <div className="flex justify-end">
        <Button onClick={() => void run('contact')} loading={busy === 'contact'} disabled={!!busy || !pickedId}>
          É pessoa desse cliente (não é venda)
        </Button>
      </div>
    </div>
  )

  return (
    <Modal open={!!lead} onClose={close} title={contactOnly ? 'Já é cliente' : 'Converter em cliente'}>
      <div className="flex flex-col gap-4">
        {intro && <p className="text-sm text-slate-500">{intro}</p>}
        {match ? (
          <>
            <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <p>
                Parece que já é cliente: <span className="font-semibold">{match.client.companyName}</span> ({MATCH_REASON_LABEL[match.reason]}). Se for alguém de
                lá chamando, marque como pessoa do cliente: <span className="font-semibold">não conta como venda</span>.
              </p>
            </div>
            {!pickedId && roleField}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={close} disabled={!!busy}>
                Agora não
              </Button>
              {!contactOnly && (
                <>
                  <Button variant="secondary" onClick={() => void run('create')} loading={busy === 'create'} disabled={!!busy}>
                    Criar outro cliente
                  </Button>
                  <Button variant="secondary" onClick={() => void run('link')} loading={busy === 'link'} disabled={!!busy}>
                    Venda nova para {match.client.companyName}
                  </Button>
                </>
              )}
              <Button onClick={() => void run('contact')} loading={busy === 'contact'} disabled={!!busy || !!pickedId} className="bg-emerald-600 hover:bg-emerald-700">
                É pessoa da {match.client.companyName} (não é venda)
              </Button>
            </div>
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer">É de outro cliente?</summary>
              <div className="mt-2">{picker}</div>
            </details>
          </>
        ) : (
          <>
            {!contactOnly && (
              <>
                <p className="text-sm text-slate-500">
                  Criar o cliente <span className="font-semibold text-slate-700">{name}</span> com os dados deste lead? As tarefas de onboarding serão geradas
                  automaticamente.
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={close} disabled={!!busy}>
                    Agora não
                  </Button>
                  <Button onClick={() => void run('create')} loading={busy === 'create'} disabled={!!busy} className="bg-emerald-600 hover:bg-emerald-700">
                    Converter em cliente (venda nova)
                  </Button>
                </div>
              </>
            )}
            {picker}
          </>
        )}
      </div>
    </Modal>
  )
}
