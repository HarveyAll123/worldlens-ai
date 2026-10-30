import type { ReactNode } from 'react';

type Tone = 'demo' | 'news' | 'history' | 'neutral' | 'sandbox' | 'warn' | 'ok' | 'danger';

/**
 * Monochrome chips: hierarchy comes from brightness, not hue. Only `danger` uses the single
 * semantic accent (LIVE red) and only as a hairline.
 */
const TONES: Record<Tone, string> = {
  demo: 'border-white/30 text-white/90',
  news: 'border-white/12 text-white/65',
  history: 'border-white/12 text-white/65',
  neutral: 'border-white/12 text-white/55',
  sandbox: 'border-white/30 text-white/85',
  warn: 'border-white/25 bg-white/[0.06] text-white/85',
  ok: 'border-white/15 text-white/70',
  danger: 'border-live/45 text-white/85',
};

export function Badge({
  tone = 'neutral',
  children,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-[2px] text-[10px] font-normal tracking-[0.02em] ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Section({
  title,
  children,
  testId,
  actions,
  id,
}: {
  title: string;
  children: ReactNode;
  testId?: string;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="border-t border-white/[0.07] px-4 py-4" data-testid={testId}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[10.5px] font-normal tracking-[0.08em] text-white/40">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Notice({
  tone = 'warn',
  children,
  testId,
}: {
  tone?: 'warn' | 'info' | 'danger' | 'demo';
  children: ReactNode;
  testId?: string;
}) {
  const cls =
    tone === 'info' || tone === 'demo'
      ? 'border-white/10 bg-white/[0.04] text-white/70'
      : tone === 'danger'
        ? 'border-live/35 bg-white/[0.03] text-white/85'
        : 'border-white/20 bg-white/[0.05] text-white/80';
  return (
    <div
      role="note"
      className={`rounded-[var(--radius-inner)] border px-3 py-2 text-[12px] leading-relaxed ${cls}`}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export function ExternalLink({
  href,
  children,
  className = '',
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-white/80 underline-offset-2 hover:text-white hover:underline ${className}`}
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-[11px] text-white/45">
      <span
        className="h-3 w-3 animate-spin rounded-full border border-white/20 border-t-white/80"
        aria-hidden
      />
      {label}
    </span>
  );
}

export type IconName =
  | 'search'
  | 'sparkle'
  | 'layers'
  | 'close'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevrons-left'
  | 'chevrons-right'
  | 'play'
  | 'pause'
  | 'calendar'
  | 'arrow-left'
  | 'check'
  | 'globe'
  | 'help'
  | 'panel'
  | 'clock'
  | 'plus'
  | 'pin'
  | 'pencil'
  | 'trash'
  | 'dots';

const PATHS: Record<IconName, ReactNode> = {
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3 21 8l-9 5-9-5 9-5Z" />
      <path d="M3 12.5 12 17.5l9-5" />
      <path d="M3 16.5 12 21.5l9-5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  'chevron-left': <path d="M15 5l-7 7 7 7" />,
  'chevron-right': <path d="M9 5l7 7-7 7" />,
  'chevrons-left': <path d="M13 5l-7 7 7 7M20 5l-7 7 7 7" />,
  'chevrons-right': <path d="M11 5l7 7-7 7M4 5l7 7-7 7" />,
  play: <path d="M8 5.5 18.5 12 8 18.5Z" />,
  pause: <path d="M9.5 5.5v13M14.5 5.5v13" />,
  calendar: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
      <path d="M8 3.5v4M16 3.5v4M3.5 10.5h17" />
    </>
  ),
  'arrow-left': <path d="M19.5 12H5M11 6l-6 6 6 6" />,
  check: <path d="M4.5 12.5 9.5 17.5 20 6.5" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.4 9.2a2.8 2.8 0 1 1 4.1 2.5c-.9.5-1.5 1-1.5 2" />
      <path d="M12 17.2v.1" />
    </>
  ),
  panel: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3.5" />
      <path d="M14.5 4.5v15" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  pin: (
    <>
      <path d="M9.5 3h5M11 3v5.6L8.5 11v1.2h7V11L13 8.6V3" />
      <path d="M12 12.2V21" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h3.6l10-10-3.6-3.6-10 10z" />
      <path d="M14.4 4.4 16.2 2.6l3.6 3.6-1.8 1.8" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V4.5h5V7" />
      <path d="M6.5 7l1 13h9l1-13" />
    </>
  ),
  dots: (
    <>
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </>
  ),
};

export function Icon({
  name,
  className = 'h-4 w-4',
  filled = false,
}: {
  name: IconName;
  className?: string;
  filled?: boolean;
}) {
  const fillIcons = name === 'play' || name === 'sparkle' || name === 'dots';
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled || fillIcons ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
