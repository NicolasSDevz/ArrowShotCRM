import { Fragment } from 'react'

const TOKEN_RE = /(\*\*[^*\n]+\*\*|https?:\/\/[^\s]+|www\.[^\s]+)/g

/** Texto escrito no construtor, mostrado do jeito que foi digitado: quebras
 *  de linha e espaços mantidos, **negrito** entre dois asteriscos e links
 *  (https://… ou www.…) viram clicáveis, abrindo em outra aba. */
export function LeadFormRichText({ text, linkColor }: { text: string; linkColor?: string }) {
  const parts = text.split(TOKEN_RE)
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          )
        }
        if (/^(https?:\/\/|www\.)/.test(part)) {
          // Pontuação no fim da frase ("…veja em site.com.") não faz parte do link.
          const trail = /[.,;:!?)]+$/.exec(part)?.[0] ?? ''
          const url = trail ? part.slice(0, -trail.length) : part
          return (
            <Fragment key={i}>
              <a
                href={url.startsWith('www.') ? `https://${url}` : url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all underline underline-offset-2"
                style={linkColor ? { color: linkColor } : undefined}
              >
                {url}
              </a>
              {trail}
            </Fragment>
          )
        }
        return <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}
