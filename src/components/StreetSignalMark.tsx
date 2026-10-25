interface StreetSignalMarkProps {
  className?: string
}

export function StreetSignalMark({ className = '' }: StreetSignalMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={`street-signal-mark ${className}`.trim()}
      viewBox="0 0 48 48"
    >
      <g
        fill="none"
        stroke="var(--street-signal-grid, #0B2D5B)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      >
        <path d="M7 13h13a7 7 0 0 1 7 7v21" />
        <path d="M18 7v14a7 7 0 0 1-7 7H7" />
        <path d="M7 37h11a7 7 0 0 0 7-7v-3" />
      </g>
      <path
        d="M24 14a7 7 0 0 1 14 0c0 5.6-7 12.4-7 12.4S24 19.6 24 14Z"
        fill="#2563EB"
      />
      <circle cx="31" cy="14" r="2.5" fill="#FAF9F6" />
      <g
        fill="none"
        stroke="#22C55E"
        strokeLinecap="round"
        strokeWidth="2.4"
      >
        <path d="M33 31a5 5 0 0 1 5 5" />
        <path d="M33 26a10 10 0 0 1 10 10" />
      </g>
    </svg>
  )
}
