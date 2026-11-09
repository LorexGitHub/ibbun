/** The logo: 文 in four strokes on an accent seal, like a name stamp (ADR 0014). It takes the Learner's look. */
export const Mark = ({ size = 32 }: { size?: number }) => (
  <svg className="mark" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
    <rect width="100" height="100" rx="22" fill="var(--color-accent)" />
    <g fill="none" stroke="var(--color-accent-ink)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M48 17L54 28" />
      <path d="M22 39H78" />
      <path d="M35 39C43 61 58 74 79 81" />
      <path d="M65 39C58 59 44 73 21 81" />
    </g>
  </svg>
);
