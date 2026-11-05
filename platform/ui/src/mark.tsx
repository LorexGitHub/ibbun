/** The logo: 文 in four ink strokes on a pear card-stock tile, with an off-centre coral dot (ADR 0011). */
export const Mark = ({ size = 40 }: { size?: number }) => (
  <svg className="mark" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
    <rect width="100" height="100" rx="26" fill="var(--color-accent)" />
    <g fill="none" stroke="var(--color-ink)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M24 38H76" />
      <path d="M36 38C44 60 58 73 78 80" />
      <path d="M64 38C58 58 44 72 22 80" />
    </g>
    <circle cx="54" cy="22" r="6.5" fill="var(--color-accent-3)" />
  </svg>
);
