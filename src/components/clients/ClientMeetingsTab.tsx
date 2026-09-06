import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useClientMeetings } from '../../hooks/useMeetings'
import { useUsers } from '../../hooks/useUsers'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { MeetingFormModal } from '../meetings/MeetingFormModal'
import { MeetingDrawer } from '../meetings/MeetingDrawer'
import { MeetingRow } from '../meetings/MeetingRow'
import type { Client } from '../../types'

/** Aba "Reuniões" da ficha do cliente — só as reuniões vinculadas a este
 *  cliente (clientId === client.id, ver isClientMeetingType). */
export function ClientMeetingsTab({ client }: { client: Client }) {
  const { data: meetings } = useClientMeetings(client.id)
  const { data: users } = useUsers()
  const [creating, setCreating] = useState(false)
  const [openMeetingId, setOpenMeetingId] = useState<string | null>(null)

  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))
  const openMeeting = meetings.find((m) => m.id === openMeetingId) ?? null

  return (
    <div className="flex flex-col gap-3">
      <Button size="sm" icon={<Plus size={13} />} onClick={() => setCreating(true)} className="self-start">
        Registrar reunião
      </Button>

      {meetings.length === 0 ? (
        <EmptyState title="Nenhuma reunião registrada para este cliente" />
      ) : (
        <div className="flex flex-col gap-2">
          {meetings.map((m) => (
            <MeetingRow
              key={m.id}
              meeting={m}
              participants={(m.participantIds ?? []).map((id) => userMap[id]).filter((u): u is NonNullable<typeof u> => !!u)}
              onClick={() => setOpenMeetingId(m.id)}
            />
          ))}
        </div>
      )}

      <MeetingFormModal open={creating} onClose={() => setCreating(false)} defaultClientId={client.id} />
      <MeetingDrawer key={`meeting-${openMeetingId ?? 'none'}`} meeting={openMeeting} onClose={() => setOpenMeetingId(null)} />
    </div>
  )
}
