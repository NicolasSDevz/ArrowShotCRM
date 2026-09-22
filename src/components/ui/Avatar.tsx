import { useState } from 'react'

const COLORS = [
  'bg-brand-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-lime-600',
]

function colorFor(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  return COLORS[Math.abs(hash) % COLORS.length]
}

export function Avatar({
  name,
  photoURL,
  size = 'md',
}: {
  name: string
  photoURL?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}) {
  // Tracks which URL failed to load, so a broken photo falls back to initials
  // — but a later change to a working URL is retried (failedUrl !== photoURL).
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  const dims = {
    xs: 'h-5 w-5 text-[9px]',
    sm: 'h-7 w-7 text-xs',
    md: 'h-9 w-9 text-sm',
    lg: 'h-10 w-10 text-sm',
    xl: 'h-20 w-20 text-xl',
  }[size]
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

  if (photoURL && failedUrl !== photoURL) {
    // A logo/foto quase nunca é quadrada (wordmark, PNG com fundo
    // transparente etc). O corte pro círculo não pode depender do <img>
    // respeitar h-*/w-* sozinho — por isso o tamanho fixo e o
    // arredondamento ficam num wrapper com overflow-hidden, e a imagem só
    // preenche esse wrapper (h-full w-full). Mesmo que o <img> tente
    // renderizar nas proporções originais, o wrapper corta fora do
    // círculo — nunca vira oval.
    return (
      <span className={`${dims} inline-block shrink-0 overflow-hidden rounded-full`}>
        <img
          src={photoURL}
          alt={name}
          onError={() => setFailedUrl(photoURL)}
          className="block h-full w-full object-cover"
        />
      </span>
    )
  }

  return (
    <div
      title={name}
      className={`avatar-initials ${dims} ${colorFor(name)} flex shrink-0 items-center justify-center rounded-full font-medium text-white`}
    >
      {initials || '?'}
    </div>
  )
}
