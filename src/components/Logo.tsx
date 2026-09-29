export function LogoMark({ size = 40, bg = '#F5EFE2' }: { size?: number; bg?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label="Q-Locate">
      <path fill="#2E5B3C" fillRule="evenodd" d="M100 188C72 152 40 126 40 88A60 60 0 1 1 160 88C160 126 128 152 100 188ZM74 88A26 26 0 1 0 126 88A26 26 0 1 0 74 88Z" />
      <line x1="112" y1="100" x2="164" y2="152" stroke={bg} strokeWidth="32" strokeLinecap="round" />
      <line x1="112" y1="100" x2="164" y2="152" stroke="#D27A14" strokeWidth="18" strokeLinecap="round" />
    </svg>
  )
}
