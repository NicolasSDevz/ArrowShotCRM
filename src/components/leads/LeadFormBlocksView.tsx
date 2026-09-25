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
const IMAGE_RATIO = { original: 'h-auto', square: 'aspect-square object-cover', post: 'aspect-[4/5] object-cover', banner: 'aspect-[3/1] object-cover' }
const IMAGE_SHAPE = { rounded: 'rounded-xl', square: 'rounded-none', circle: 'rounded-full' }
/** Espaçamento em px da escala das telas finais. */
export const SPACE_PX = { none: 0, sm: 12, md: 24, lg: 40, xl: 64 }

/** Renderiza a pilha de blocos de uma tela final (título, texto, imagem,
 *  vídeo, botão, espaço, divisor). `interactive` = false no preview do
 *  construtor: o botão aparece igual mas não navega. */
export function LeadFormBlocksView({
  blocks,
  primaryColor,
  buttonTextColor = '#FFFFFF',
  textColor,
  interactive,
  gap,
}: {
  blocks: LeadFormBlock[]
  primaryColor: string
  buttonTextColor?: string
  /** Cor dos textos escolhida no tema (undefined = cinzas padrão). */
  textColor?: string
  interactive: boolean
  /** Espaço entre os itens em px (sem valor = 12). */
  gap?: number
}) {
  return (
    <div className="flex flex-col" style={{ gap: gap ?? 12 }}>
      {blocks.map((b) => {
        const align = b.align ?? 'center'
        switch (b.type) {
          case 'heading':
            return b.text?.trim() ? (
              <h2 key={b.id} className={`whitespace-pre-wrap font-bold text-slate-900 ${HEADING_SIZE[b.size ?? 'lg']} ${TEXT_ALIGN_CLASS[align]}`} style={textColor ? { color: textColor } : undefined}>
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
                style={
                  b.color === 'primary'
                    ? { color: primaryColor }
                    : textColor
                      ? { color: textColor, opacity: b.color === 'muted' ? 0.7 : 1 }
                      : undefined
                }
              >
                {b.text}
              </p>
            ) : null
          case 'image':
            return b.url ? (
              <div key={b.id} className={`flex ${JUSTIFY_CLASS[align]}`}>
                <img
                  src={b.url}
                  alt=""
                  className={`max-w-full ${IMAGE_WIDTH[b.width ?? 'full']} ${b.shape === 'circle' ? IMAGE_RATIO.square : IMAGE_RATIO[b.ratio ?? 'original']} ${IMAGE_SHAPE[b.shape ?? 'rounded']}`}
                />
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
                  style={{ background: primaryColor, color: buttonTextColor }}
                  className={`rounded-lg px-6 py-3 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90 ${b.width === 'full' ? 'w-full' : ''}`}
                >
                  {b.label}
                </a>
              </div>
            )
          }
          case 'divider':
            // Com cor de texto do tema (fundo escuro/colorido), a linha usa essa cor bem clarinha.
            return <hr key={b.id} className="my-1 border-slate-200" style={textColor ? { borderColor: `${textColor}33` } : undefined} />
          case 'spacer':
            return <div key={b.id} style={{ height: SPACER_HEIGHT[b.size ?? 'md'] }} />
          default:
            return null
        }
      })}
    </div>
  )
}
