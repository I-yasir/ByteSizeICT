/** Hero illustration (docs/03_UI_Spec.md §6): inline SVG in token colours, theme-aware, < 8 KB. */
export function HeroIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 280" role="img" aria-hidden className={className}>
      <rect x="70" y="16" width="180" height="248" rx="24" className="fill-surface stroke-border-strong" strokeWidth="2" />
      <rect x="86" y="40" width="148" height="28" rx="8" className="fill-primary-soft" />
      <rect x="96" y="50" width="70" height="8" rx="4" className="fill-primary" />
      <rect x="196" y="48" width="28" height="12" rx="6" className="fill-warning-soft" />
      {[0, 1, 2].map((row) => (
        <g key={row} transform={`translate(0 ${row * 58})`}>
          <rect x="86" y="82" width="148" height="48" rx="10" className="fill-surface-2" />
          <circle cx="104" cy="106" r="9" className={row === 1 ? 'fill-primary' : 'fill-surface stroke-border-strong'} strokeWidth="2" />
          <rect x="122" y="98" width={row === 1 ? 90 : 76} height="7" rx="3.5" className="fill-border-strong" />
          <rect x="122" y="110" width="52" height="6" rx="3" className="fill-border" />
        </g>
      ))}
      <circle cx="266" cy="70" r="30" className="fill-success-soft" />
      <path d="M252 70l10 10 18-20" className="stroke-success" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="46" cy="190" r="26" className="fill-warning-soft" />
      <path d="M46 176v15l9 6" className="stroke-warning" strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="276" cy="212" r="18" className="fill-teal-soft" />
      <text x="276" y="218" textAnchor="middle" className="fill-teal font-num text-sm font-bold">
        %
      </text>
    </svg>
  );
}
