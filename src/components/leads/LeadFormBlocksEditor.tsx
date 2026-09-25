import type { ReactNode } from 'react'
import {
  Heading,
  Text,
  Image as ImageIcon,
  Video,
  MousePointerClick,
  Minus,
  MoveVertical,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronUp,
  ChevronDown,
  Trash2,
  Bold,
  Plus,
  type LucideIcon,
} from 'lucide-react'
import { Input, Textarea } from '../ui/Field'
import { ImageUploadField, VideoField } from './LeadFormBuilderParts'
import type { LeadFormAlign, LeadFormBlock, LeadFormBlockType } from '../../types/leadForm'

const BLOCK_META: Record<LeadFormBlockType, { icon: LucideIcon; label: string; hint: string }> = {
  heading: { icon: Heading, label: 'Título', hint: 'Frase grande em destaque' },
  text: { icon: Text, label: 'Texto', hint: 'Parágrafos com quebra de linha' },
  image: { icon: ImageIcon, label: 'Imagem', hint: 'Foto, banner ou print' },
  video: { icon: Video, label: 'Vídeo', hint: 'Link do YouTube' },
  button: { icon: MousePointerClick, label: 'Botão', hint: 'Botão com link' },
  spacer: { icon: MoveVertical, label: 'Espaço', hint: 'Respiro entre blocos' },
  divider: { icon: Minus, label: 'Divisor', hint: 'Linha separadora' },
}

function newBlock(type: LeadFormBlockType): LeadFormBlock {
  const id = crypto.randomUUID()
  switch (type) {
    case 'heading':
      return { id, type, text: '', align: 'center', size: 'lg' }
    case 'text':
      return { id, type, text: '', align: 'center', size: 'md', color: 'default' }
    case 'image':
      return { id, type, url: null, align: 'center', width: 'full' }
    case 'video':
      return { id, type, url: '' }
    case 'button':
      return { id, type, label: '', url: '', align: 'center', width: 'sm' }
    case 'spacer':
      return { id, type, size: 'md' }
    default:
      return { id, type }
  }
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; content: ReactNode; title: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium text-slate-400">{label}</span>
      <div className="flex rounded-lg bg-slate-100 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`flex h-7 min-w-8 flex-1 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors ${
              value === o.value ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {o.content}
          </button>
        ))}
      </div>
    </div>
  )
}

export function AlignControl({ value, onChange, label = 'Alinhamento' }: { value: LeadFormAlign; onChange: (v: LeadFormAlign) => void; label?: string }) {
  return (
    <Segmented
      label={label}
      value={value}
      onChange={onChange}
      options={[
        { value: 'left', content: <AlignLeft size={14} />, title: 'Esquerda' },
        { value: 'center', content: <AlignCenter size={14} />, title: 'Centro' },
        { value: 'right', content: <AlignRight size={14} />, title: 'Direita' },
      ]}
    />
  )
}

const SIZE_OPTIONS = [
  { value: 'sm', content: 'P', title: 'Pequeno' },
  { value: 'md', content: 'M', title: 'Médio' },
  { value: 'lg', content: 'G', title: 'Grande' },
  { value: 'xl', content: 'GG', title: 'Extra grande' },
] as const

/** Editor da pilha de blocos de uma tela final — a tela vira uma página
 *  montada bloco a bloco (título, texto, imagem, vídeo, botão…), cada um com
 *  o próprio alinhamento e tamanho, no estilo de uma página de checkout. */
export function LeadFormBlocksEditor({
  blocks,
  onChange,
  formId,
  canUpload,
}: {
  blocks: LeadFormBlock[]
  onChange: (next: LeadFormBlock[]) => void
  formId: string
  canUpload: boolean
}) {
  const update = (id: string, patch: Partial<LeadFormBlock>) => onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  const remove = (id: string) => onChange(blocks.filter((b) => b.id !== id))
  const move = (index: number, dir: -1 | 1) => {
    const to = index + dir
    if (to < 0 || to >= blocks.length) return
    const next = [...blocks]
    ;[next[index], next[to]] = [next[to], next[index]]
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-2.5">
      {blocks.length === 0 && <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-400">Tela vazia — adicione blocos abaixo pra montar o conteúdo.</p>}

      {blocks.map((b, i) => {
        const meta = BLOCK_META[b.type]
        const Icon = meta.icon
        const align = b.align ?? 'center'
        return (
          <div key={b.id} className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-1.5 border-b border-slate-100 px-2.5 py-1.5">
              <Icon size={13} className="text-brand-600" />
              <span className="flex-1 text-xs font-semibold text-slate-600">{meta.label}</span>
              <button type="button" title="Subir" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
                <ChevronUp size={13} />
              </button>
              <button type="button" title="Descer" disabled={i === blocks.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
                <ChevronDown size={13} />
              </button>
              <button type="button" title="Excluir bloco" onClick={() => remove(b.id)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500">
                <Trash2 size={13} />
              </button>
            </div>

            <div className="flex flex-col gap-2.5 p-2.5">
              {(b.type === 'heading' || b.type === 'text') && (
                <>
                  <Textarea
                    rows={b.type === 'heading' ? 2 : 4}
                    value={b.text ?? ''}
                    onChange={(e) => update(b.id, { text: e.target.value })}
                    placeholder={b.type === 'heading' ? 'Ex: Tudo certo, recebemos seus dados!' : 'Escreva o texto. Enter cria uma nova linha.'}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <AlignControl value={align} onChange={(v) => update(b.id, { align: v })} />
                    <Segmented label="Tamanho" value={b.size ?? (b.type === 'heading' ? 'lg' : 'md')} onChange={(v) => update(b.id, { size: v })} options={[...SIZE_OPTIONS]} />
                  </div>
                  {b.type === 'text' && (
                    <div className="grid grid-cols-2 gap-2">
                      <Segmented
                        label="Estilo"
                        value={b.bold ? 'bold' : 'normal'}
                        onChange={(v) => update(b.id, { bold: v === 'bold' })}
                        options={[
                          { value: 'normal', content: 'Normal', title: 'Texto normal' },
                          { value: 'bold', content: <Bold size={13} />, title: 'Negrito' },
                        ]}
                      />
                      <Segmented
                        label="Cor"
                        value={b.color ?? 'default'}
                        onChange={(v) => update(b.id, { color: v })}
                        options={[
                          { value: 'default', content: 'Normal', title: 'Cor padrão' },
                          { value: 'muted', content: 'Suave', title: 'Cinza suave' },
                          { value: 'primary', content: 'Destaque', title: 'Cor de destaque do formulário' },
                        ]}
                      />
                    </div>
                  )}
                </>
              )}

              {b.type === 'image' && (
                <>
                  <ImageUploadField label="Imagem" url={b.url} formId={formId} assetKey={`block-${b.id}`} sizeHint="banner" canUpload={canUpload} onChange={(url) => update(b.id, { url })} />
                  <div className="grid grid-cols-2 gap-2">
                    <AlignControl value={align} onChange={(v) => update(b.id, { align: v })} />
                    <Segmented
                      label="Largura"
                      value={b.width ?? 'full'}
                      onChange={(v) => update(b.id, { width: v })}
                      options={[
                        { value: 'sm', content: 'P', title: 'Pequena' },
                        { value: 'md', content: 'M', title: 'Média' },
                        { value: 'full', content: 'Total', title: 'Largura total' },
                      ]}
                    />
                  </div>
                  <Segmented
                    label="Formato"
                    value={b.shape === 'circle' ? 'square' : (b.ratio ?? 'original')}
                    onChange={(v) => update(b.id, { ratio: v, shape: v !== 'square' && b.shape === 'circle' ? 'rounded' : b.shape })}
                    options={[
                      { value: 'original', content: 'Original', title: 'Do jeito que a imagem é, sem cortar' },
                      { value: 'square', content: 'Quadrado', title: '1:1' },
                      { value: 'post', content: 'Post', title: '4:5, estilo Instagram' },
                      { value: 'banner', content: 'Banner', title: 'Faixa larga 3:1' },
                    ]}
                  />
                  <Segmented
                    label="Cantos"
                    value={b.shape ?? 'rounded'}
                    onChange={(v) => update(b.id, { shape: v, ratio: v === 'circle' ? 'square' : b.ratio })}
                    options={[
                      { value: 'rounded', content: 'Arredondado', title: 'Cantos arredondados' },
                      { value: 'square', content: 'Reto', title: 'Cantos retos' },
                      { value: 'circle', content: 'Círculo', title: 'Foto redonda (fica quadrada)' },
                    ]}
                  />
                </>
              )}

              {b.type === 'video' && <VideoField label="Link do YouTube" value={b.url ?? ''} onChange={(v) => update(b.id, { url: v })} />}

              {b.type === 'button' && (
                <>
                  <Input value={b.label ?? ''} onChange={(e) => update(b.id, { label: e.target.value })} placeholder="Texto do botão (ex: Falar no WhatsApp)" />
                  <Input value={b.url ?? ''} onChange={(e) => update(b.id, { url: e.target.value })} placeholder="Link (ex: https://wa.me/5511999999999)" />
                  <div className="grid grid-cols-2 gap-2">
                    <AlignControl value={align} onChange={(v) => update(b.id, { align: v })} />
                    <Segmented
                      label="Largura"
                      value={b.width === 'full' ? 'full' : 'sm'}
                      onChange={(v) => update(b.id, { width: v })}
                      options={[
                        { value: 'sm', content: 'Automática', title: 'Do tamanho do texto' },
                        { value: 'full', content: 'Total', title: 'Largura total' },
                      ]}
                    />
                  </div>
                </>
              )}

              {b.type === 'spacer' && <Segmented label="Altura do espaço" value={b.size ?? 'md'} onChange={(v) => update(b.id, { size: v })} options={[...SIZE_OPTIONS]} />}

              {b.type === 'divider' && <p className="text-xs text-slate-400">Uma linha fina separando o conteúdo acima do abaixo.</p>}
            </div>
          </div>
        )
      })}

      <div className="rounded-xl border border-dashed border-slate-300 p-2.5">
        <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-500">
          <Plus size={12} /> Adicionar bloco
        </p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {(Object.keys(BLOCK_META) as LeadFormBlockType[]).map((type) => {
            const m = BLOCK_META[type]
            const Icon = m.icon
            return (
              <button
                key={type}
                type="button"
                title={m.hint}
                onClick={() => onChange([...blocks, newBlock(type)])}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              >
                <Icon size={13} className="shrink-0 text-brand-600" />
                {m.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
