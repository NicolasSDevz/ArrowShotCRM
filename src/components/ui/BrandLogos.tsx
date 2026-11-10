/** Logos das plataformas de anúncio (Google e Meta), em SVG, para os cards
 *  da carteira de tráfego. Só decoração: o nome vem escrito ao lado. */

export function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  )
}

export function MetaLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size * 1.5} height={size} viewBox="0 0 36 24" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="meta-logo-grad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#0064E1" />
          <stop offset="55%" stopColor="#0082FB" />
          <stop offset="100%" stopColor="#3FA3FF" />
        </linearGradient>
      </defs>
      <path
        d="M4.5 15.2c0-5.6 2.7-10 6.3-10 2.6 0 4.6 2.2 7.2 6.8 2.6 4.6 4.6 7.6 7.4 7.6 2.5 0 4.1-2.4 4.1-5.6 0-4.9-2.5-8.8-5.7-8.8-2.7 0-4.8 2.6-7 6.6-2.5 4.5-4.4 7.8-7.4 7.8-2.9 0-4.9-2-4.9-4.4z"
        fill="none"
        stroke="url(#meta-logo-grad)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
