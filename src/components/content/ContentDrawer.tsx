import { useState } from 'react'
import toast from 'react-hot-toast'
import { Trash2, ThumbsUp, RotateCcw, Link2, Copy, XCircle } from 'lucide-react'
import { Drawer } from '../ui/Drawer'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Tabs } from '../ui/Tabs'
import { Button } from '../ui/Button'
import { CommentsPanel } from '../comments/CommentsPanel'
import { ActivityPanel } from '../activity/ActivityPanel'
import { FilesPanel } from '../files/FilesPanel'
import { useAuth } from '../../context/AuthContext'
import { useClients } from '../../hooks/useClients'
import { useUsers } from '../../hooks/useUsers'
import { updateContent, deleteContent } from '../../services/contentService'
import { approveContent, requestContentChange, generateApprovalLink, revokeApprovalLink } from '../../services/approvalService'
import { resolveAdminIds } from '../../utils/userLookup'
import { dateInputToTimestamp, timestampToDateInput } from '../../utils/dateInput'
import {
  CONTENT_PILLAR_LABEL,
  CONTENT_PLATFORM_LABEL,
  CONTENT_STATUS_LABEL,
  CONTENT_STATUS_ORDER,
  CONTENT_TYPE_LABEL,
  type Content,
} from '../../types/content'

const toDateInputValue = timestampToDateInput

export function ContentDrawer({ content, onClose }: { content: Content | null; onClose: () => void }) {
  const { profile } = useAuth()
  const { data: clients } = useClients()
  const { data: users } = useUsers()
  const [title, setTitle] = useState(content?.title ?? '')
  const [changeComment, setChangeComment] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)

  if (!content || !profile) return null

  const approvalUrl = content.approvalToken
    ? `${window.location.origin}/aprovar/${content.id}/${content.approvalToken}`
    : null

  const handleGenerateLink = async () => {
    setLinkLoading(true)
    try {
      const url = await generateApprovalLink(content, profile.id, profile.name, resolveAdminIds(users))
      await navigator.clipboard.writeText(url)
      toast.success('Link gerado e copiado')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao gerar link')
    } finally {
      setLinkLoading(false)
    }
  }

  const handleCopyLink = async () => {
    if (!approvalUrl) return
    await navigator.clipboard.writeText(approvalUrl)
    toast.success('Link copiado')
  }

  const handleRevokeLink = async () => {
    setLinkLoading(true)
    try {
      await revokeApprovalLink(content, profile.id, profile.name)
      toast.success('Link revogado')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao revogar link')
    } finally {
      setLinkLoading(false)
    }
  }

  const client = clients.find((c) => c.id === content.clientId)
  const save = (data: Partial<Content>) => updateContent(content.id, data, profile.id, profile.name)

  const handleDelete = async () => {
    if (!confirm(`Excluir o conteúdo "${content.title}"?`)) return
    await deleteContent(content, profile.id, profile.name)
    onClose()
  }

  const handleApprove = async () => {
    await approveContent(content, profile.id, profile.name)
    toast.success('Conteúdo aprovado')
  }

  const handleRequestChange = async () => {
    if (!changeComment.trim()) {
      toast.error('Descreva o que precisa mudar')
      return
    }
    await requestContentChange(content, profile.id, profile.name, changeComment.trim())
    setChangeComment('')
    toast.success('Alteração solicitada')
  }

  return (
    <Drawer
      open={!!content}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== content.title && save({ title: title.trim() })}
            className="w-full border-none bg-transparent text-base font-semibold text-slate-800 outline-none"
          />
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        {client && <p className="-mt-2 text-xs font-medium text-brand-500">{client.companyName}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Status">
            <Select value={content.status} onChange={(e) => save({ status: e.target.value as Content['status'] })}>
              {CONTENT_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {CONTENT_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Responsável">
            <Select
              value={content.assignedTo ?? ''}
              onChange={(e) => save({ assignedTo: e.target.value || undefined })}
            >
              <option value="">Sem responsável</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Tipo">
            <Select value={content.type} onChange={(e) => save({ type: e.target.value as Content['type'] })}>
              {Object.entries(CONTENT_TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Plataforma">
            <Select value={content.platform} onChange={(e) => save({ platform: e.target.value as Content['platform'] })}>
              {Object.entries(CONTENT_PLATFORM_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Pilar">
            <Select
              value={content.pillar ?? ''}
              onChange={(e) => save({ pillar: (e.target.value || undefined) as Content['pillar'] })}
            >
              <option value="">Nenhum</option>
              {Object.entries(CONTENT_PILLAR_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Data de publicação">
            <Input
              type="date"
              value={toDateInputValue(content.scheduledDate)}
              onChange={(e) =>
                save({ scheduledDate: dateInputToTimestamp(e.target.value) })
              }
            />
          </Field>

          <Field label="Horário">
            <Input
              type="time"
              value={content.scheduledTime ?? ''}
              onChange={(e) => save({ scheduledTime: e.target.value })}
            />
          </Field>
        </div>

        {content.type === 'reels' && (
          <Field label="Roteiro (hook → desenvolvimento → CTA)">
            <Textarea
              rows={3}
              placeholder="Ex: 0–3s hook · 3–15s processo · 15–25s resultado · 25–30s logo + CTA"
              defaultValue={content.script ?? ''}
              onBlur={(e) => e.target.value !== (content.script ?? '') && save({ script: e.target.value })}
            />
          </Field>
        )}

        <Field label="Legenda">
          <Textarea
            rows={3}
            defaultValue={content.caption ?? ''}
            onBlur={(e) => e.target.value !== (content.caption ?? '') && save({ caption: e.target.value })}
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="CTA">
            <Input
              defaultValue={content.cta ?? ''}
              onBlur={(e) => e.target.value !== (content.cta ?? '') && save({ cta: e.target.value })}
            />
          </Field>
          <Field label="Hashtags">
            <Input
              defaultValue={(content.hashtags ?? []).join(' ')}
              placeholder="#marketing #arrowshot"
              onBlur={(e) => {
                const tags = e.target.value.split(/\s+/).filter(Boolean)
                save({ hashtags: tags })
              }}
            />
          </Field>
          <Field label="Link do Canva">
            <Input
              defaultValue={content.canvaLink ?? ''}
              placeholder="https://canva.com/..."
              onBlur={(e) => e.target.value !== (content.canvaLink ?? '') && save({ canvaLink: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Observações">
          <Textarea
            rows={2}
            defaultValue={content.notes ?? ''}
            onBlur={(e) => e.target.value !== (content.notes ?? '') && save({ notes: e.target.value })}
          />
        </Field>

        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Link de aprovação do cliente</p>
          {approvalUrl ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
                <Link2 size={13} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{approvalUrl}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" icon={<Copy size={13} />} onClick={handleCopyLink}>
                  Copiar
                </Button>
                <Button size="sm" variant="danger" icon={<XCircle size={13} />} onClick={handleRevokeLink} loading={linkLoading}>
                  Revogar
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="secondary" icon={<Link2 size={13} />} onClick={handleGenerateLink} loading={linkLoading}>
              Gerar link de aprovação
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Aprovação</p>
          <div className="flex gap-2">
            <Button size="sm" icon={<ThumbsUp size={13} />} onClick={handleApprove}>
              Aprovar
            </Button>
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={changeComment}
              onChange={(e) => setChangeComment(e.target.value)}
              placeholder="O que precisa ser alterado?"
              className="flex-1"
            />
            <Button size="sm" variant="secondary" icon={<RotateCcw size={13} />} onClick={handleRequestChange}>
              Solicitar alteração
            </Button>
          </div>
        </div>

        <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={handleDelete} className="self-start">
          Excluir conteúdo
        </Button>
      </div>

      <Tabs
        tabs={[
          { label: 'Comentários', content: <CommentsPanel entityType="content" entityId={content.id} clientId={content.clientId} /> },
          {
            label: 'Arquivos',
            content: <FilesPanel clientId={content.clientId} category="social-media" relatedType="content" relatedId={content.id} />,
          },
          { label: 'Histórico', content: <ActivityPanel entityType="content" entityId={content.id} /> },
        ]}
      />
    </Drawer>
  )
}
