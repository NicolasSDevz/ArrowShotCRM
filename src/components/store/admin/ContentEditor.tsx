import { useEffect, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, Video } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { useStoreLessons, useStoreModules } from '../../../hooks/useStore'
import {
  createStoreLesson,
  createStoreModule,
  deleteStoreLesson,
  deleteStoreModule,
  swapStoreOrder,
  updateStoreLesson,
  updateStoreModule,
  updateStoreProduct,
} from '../../../services/storeService'
import { askConfirm } from '../../../utils/confirmDialog'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { Field, Input, Textarea } from '../../ui/Field'
import { EmptyState } from '../../ui/EmptyState'
import { ImageField } from './ImageField'
import type { StoreAttachment, StoreLesson, StoreModule, StoreProduct } from '../../../types/store'

/** Conteúdo da área de membros: módulos (com capa e liberação programada) e aulas. */
export function ContentEditor({ product }: { product: StoreProduct }) {
  const { profile } = useAuth()
  const { data: modules } = useStoreModules(product.id)
  const { data: lessons, loading } = useStoreLessons(product.id)
  const [editModule, setEditModule] = useState<StoreModule | 'new' | null>(null)
  const [editLesson, setEditLesson] = useState<{ moduleId: string; lesson: StoreLesson | null } | null>(null)

  // Mantém o total de aulas no produto (a aba Alunos usa pra calcular o %).
  useEffect(() => {
    if (!loading && profile && product.lessonCount !== lessons.length) {
      updateStoreProduct(product.id, { lessonCount: lessons.length }, profile.id).catch(() => {})
    }
  }, [loading, lessons.length, product.id, product.lessonCount, profile])

  const move = async (sub: 'modules' | 'lessons', list: { id: string; order: number }[], i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= list.length) return
    await swapStoreOrder(product.id, sub, list[i], list[j])
  }

  const removeModule = async (m: StoreModule) => {
    const count = lessons.filter((l) => l.moduleId === m.id).length
    if (!(await askConfirm({ title: `Excluir o módulo "${m.title}"?`, message: count ? `As ${count} aulas dele também serão excluídas.` : undefined, confirmLabel: 'Excluir', danger: true }))) return
    await deleteStoreModule(product.id, m.id, lessons)
    toast.success('Módulo excluído')
  }

  const removeLesson = async (l: StoreLesson) => {
    if (!(await askConfirm({ title: `Excluir a aula "${l.title}"?`, confirmLabel: 'Excluir', danger: true }))) return
    await deleteStoreLesson(product.id, l.id)
    toast.success('Aula excluída')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{modules.length} módulos, {lessons.length} aulas</p>
        <Button icon={<Plus size={15} />} onClick={() => setEditModule('new')}>Novo módulo</Button>
      </div>

      {modules.length === 0 ? (
        <EmptyState icon={<Video size={36} />} title="Nenhum módulo ainda" description="Crie um módulo e adicione as aulas (vídeo do YouTube, Vimeo, Panda ou link de MP4)." />
      ) : (
        <ol className="space-y-3">
          {modules.map((m, mi) => {
            const modLessons = lessons.filter((l) => l.moduleId === m.id)
            return (
              <li key={m.id} className="rounded-2xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
                  <div className="aspect-[2/3] w-10 shrink-0 rounded bg-slate-100 bg-cover bg-center" style={m.coverUrl ? { backgroundImage: `url(${m.coverUrl})` } : undefined} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-800">Módulo {mi + 1}: {m.title}</h3>
                    <p className="text-xs text-slate-400">{modLessons.length} aulas{m.releaseDays ? `, libera ${m.releaseDays} dias após a compra` : ', liberado na hora'}</p>
                  </div>
                  <div className="flex gap-0.5">
                    <Button size="sm" variant="ghost" icon={<ArrowUp size={14} />} onClick={() => move('modules', modules, mi, -1)} disabled={mi === 0} aria-label={`Subir módulo ${m.title}`} />
                    <Button size="sm" variant="ghost" icon={<ArrowDown size={14} />} onClick={() => move('modules', modules, mi, 1)} disabled={mi === modules.length - 1} aria-label={`Descer módulo ${m.title}`} />
                    <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditModule(m)} aria-label={`Editar módulo ${m.title}`} />
                    <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => removeModule(m)} aria-label={`Excluir módulo ${m.title}`} />
                  </div>
                </div>
                <ol className="divide-y divide-slate-50">
                  {modLessons.map((l, li) => (
                    <li key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <Video size={15} className="shrink-0 text-slate-400" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-slate-700">{l.title}</span>
                      {!l.videoUrl && <span className="text-xs text-amber-600">sem vídeo</span>}
                      {l.releaseDays > 0 && <span className="text-xs text-slate-400">libera em {l.releaseDays} dias</span>}
                      <div className="flex gap-0.5">
                        <Button size="sm" variant="ghost" icon={<ArrowUp size={13} />} onClick={() => move('lessons', modLessons, li, -1)} disabled={li === 0} aria-label={`Subir aula ${l.title}`} />
                        <Button size="sm" variant="ghost" icon={<ArrowDown size={13} />} onClick={() => move('lessons', modLessons, li, 1)} disabled={li === modLessons.length - 1} aria-label={`Descer aula ${l.title}`} />
                        <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setEditLesson({ moduleId: m.id, lesson: l })} aria-label={`Editar aula ${l.title}`} />
                        <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => removeLesson(l)} aria-label={`Excluir aula ${l.title}`} />
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="p-3">
                  <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setEditLesson({ moduleId: m.id, lesson: null })}>Adicionar aula</Button>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {editModule && (
        <ModuleModal
          product={product}
          module={editModule === 'new' ? null : editModule}
          nextOrder={(modules.at(-1)?.order ?? 0) + 1}
          onClose={() => setEditModule(null)}
        />
      )}
      {editLesson && (
        <LessonModal
          productId={product.id}
          moduleId={editLesson.moduleId}
          lesson={editLesson.lesson}
          nextOrder={(lessons.filter((l) => l.moduleId === editLesson.moduleId).at(-1)?.order ?? 0) + 1}
          onClose={() => setEditLesson(null)}
        />
      )}
    </div>
  )
}

function ModuleModal({ product, module, nextOrder, onClose }: { product: StoreProduct; module: StoreModule | null; nextOrder: number; onClose: () => void }) {
  const [title, setTitle] = useState(module?.title ?? '')
  const [coverUrl, setCoverUrl] = useState<string | null>(module?.coverUrl ?? null)
  const [releaseDays, setReleaseDays] = useState(String(module?.releaseDays ?? 0))
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      const data = { title: title.trim(), coverUrl, releaseDays: Number(releaseDays) || 0 }
      if (module) await updateStoreModule(product.id, module.id, data)
      else await createStoreModule(product.id, { ...data, order: nextOrder })
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={module ? 'Editar módulo' : 'Novo módulo'}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nome do módulo" required><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
        <ImageField label="Capa (vertical)" value={coverUrl} onChange={setCoverUrl} productId={product.id} assetKey="module-cover" hint="Formato pôster, 600 x 900 px" aspect="aspect-[2/3]" />
        <Field label="Liberar quantos dias depois da compra? (0 = na hora)"><Input type="number" min={0} value={releaseDays} onChange={(e) => setReleaseDays(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}>Salvar</Button>
        </div>
      </form>
    </Modal>
  )
}

function LessonModal({ productId, moduleId, lesson, nextOrder, onClose }: { productId: string; moduleId: string; lesson: StoreLesson | null; nextOrder: number; onClose: () => void }) {
  const [title, setTitle] = useState(lesson?.title ?? '')
  const [videoUrl, setVideoUrl] = useState(lesson?.videoUrl ?? '')
  const [description, setDescription] = useState(lesson?.description ?? '')
  const [durationMin, setDurationMin] = useState(lesson?.durationMin ? String(lesson.durationMin) : '')
  const [releaseDays, setReleaseDays] = useState(String(lesson?.releaseDays ?? 0))
  const [attachments, setAttachments] = useState<StoreAttachment[]>(lesson?.attachments ?? [])
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      const data = {
        title: title.trim(),
        videoUrl: videoUrl.trim() || null,
        description,
        durationMin: durationMin ? Number(durationMin) : null,
        releaseDays: Number(releaseDays) || 0,
        attachments: attachments.filter((a) => a.url.trim()),
        moduleId,
      }
      if (lesson) await updateStoreLesson(productId, lesson.id, data)
      else await createStoreLesson(productId, { ...data, order: nextOrder })
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={lesson ? 'Editar aula' : 'Nova aula'} width="max-w-2xl">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Título da aula" required><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
        <Field label="Link do vídeo (YouTube não listado, Vimeo, Panda, Bunny ou .mp4)"><Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duração (minutos)"><Input type="number" min={0} value={durationMin} onChange={(e) => setDurationMin(e.target.value)} /></Field>
          <Field label="Liberar dias após a compra"><Input type="number" min={0} value={releaseDays} onChange={(e) => setReleaseDays(e.target.value)} /></Field>
        </div>
        <Field label="Descrição (aceita Markdown: **negrito**, listas, links)"><Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-slate-500">Anexos (PDF, planilha, link do Drive)</legend>
          <ul className="space-y-1.5">
            {attachments.map((a, i) => (
              <li key={i} className="flex gap-1.5">
                <Input aria-label={`Nome do anexo ${i + 1}`} placeholder="Nome" value={a.name} onChange={(e) => setAttachments(attachments.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="!w-40" />
                <Input aria-label={`Link do anexo ${i + 1}`} placeholder="https://" value={a.url} onChange={(e) => setAttachments(attachments.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                <button type="button" onClick={() => setAttachments(attachments.filter((_, j) => j !== i))} className="rounded-lg px-2 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label={`Remover anexo ${i + 1}`}><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setAttachments([...attachments, { name: '', url: '' }])} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"><Plus size={13} /> Adicionar anexo</button>
        </fieldset>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}>Salvar aula</Button>
        </div>
      </form>
    </Modal>
  )
}
