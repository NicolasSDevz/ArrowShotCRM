import { youTubeEmbedUrl } from '../../utils/youtube'
import { normalizeUrl } from './leadFormUtils'
import type { LeadFormAlign, LeadFormBlock } from '../../types/leadForm'

export const TEXT_ALIGN_CLASS: Record<LeadFormAlign, string> = { left: 'text-left', center: 'text-center', right: 'text-right' }
export const JUSTIFY_CLASS: Record<LeadFormAlign, string> = { left: 'justify-start', center: 'justify-center', right: 'justify-end' }

export function VideoEmbed({ url }: { url?: string | null }) {
  const src = youTubeEmbedUrl(url)
  if (!src) return null
  return (
    <div className="my-4 aspect-video w-full overflow-hidden rounded-xl bg-black">
      <iframe
        src={src}
        title="Vídeo"
        className="h-full w-full"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        loading="lazy"
      />
    </div>
  )
}

const HEADING_SIZE = { sm: 'text-base', md: 'text-lg', lg: 'text-xl', xl: 'text-2xl' }
const TEXT_SIZE = { sm: 'text-sm', md: 'text-[15px]', lg: 'text-lg', xl: 'text-xl' }
const SPACER_HEIGHT = { sm: 8, md: 16, lg: 32, xl: 56 }
const IMAGE_WIDTH = { sm: 'w-1/3', md: 'w-3/5', full: 'w-full' }

/** Renderiza a pilha de blocos de uma tela final (título, texto, imagem,
 *  vídeo, botão, espaço, divisor). `interactive` = false no preview do
 *  construtor: o botão aparece igual mas não navega. */
export function LeadFormBlocksView({ blocks, primaryColor, interactive }: { blocks: LeadFormBlock[]; primaryColor: string; interactive: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b) => {
        const align = b.align ?? 'center'
        switch (b.type) {
          case 'heading':
            return b.text?.trim() ? (
              <h2 key={b.id} className={`whitespace-pre-wrap font-bold text-slate-900 ${HEADING_SIZE[b.size ?? 'lg']} ${TEXT_ALIGN_CLASS[align]}`}>
                {b.text}
              </h2>
            ) : null
          case 'text':
            return b.text?.trim() ? (
              <p
                key={b.id}
                className={`whitespace-pre-wrap ${TEXT_SIZE[b.size ?? 'md']} ${b.bold ? 'font-semibold' : ''} ${TEXT_ALIGN_CLASS[align]} ${
                  b.color === 'muted' ? 'text-slate-500' : b.color === 'primary' ? '' : 'text-slate-700'
                }`}
                style={b.color === 'primary' ? { color: primaryColor } : undefined}
              >
                {b.text}
              </p>
            ) : null
          case 'image':
            return b.url ? (
              <div key={b.id} className={`flex ${JUSTIFY_CLASS[align]}`}>
                <img src={b.url} alt="" className={`h-auto max-w-full rounded-xl ${IMAGE_WIDTH[b.width ?? 'full']}`} />
              </div>
            ) : null
          case 'video':
            return <VideoEmbed key={b.id} url={b.url} />
          case 'button': {
            const href = normalizeUrl(b.url)
            if (!b.label?.trim() || !href) return null
            return (
              <div key={b.id} className={`flex ${JUSTIFY_CLASS[align]}`}>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={interactive ? undefined : (e) => e.preventDefault()}
                  style={{ backgroundColor: primaryColor }}
                  className={`rounded-lg px-6 py-3 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90 ${b.width === 'full' ? 'w-full' : ''}`}
                >
                  {b.label}
                </a>
              </div>
            )
          }
          case 'divider':
            return <hr key={b.id} className="my-1 border-slate-200" />
          case 'spacer':
            return <div key={b.id} style={{ height: SPACER_HEIGHT[b.size ?? 'md'] }} />
          default:
            return null
        }
      })}
    </div>
  )
}
