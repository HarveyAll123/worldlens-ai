import type { ReactNode } from 'react';

type Tone = 'demo' | 'news' | 'history' | 'neutral' | 'sandbox' | 'warn' | 'ok' | 'danger';
const TONES: Record<Tone, string> = {
  demo: 'border-demo/50 text-demo bg-demo/10',
  news: 'border-news/40 text-news bg-news/10',
  history: 'border-history/40 text-history bg-history/10',
  neutral: 'border-white/15 text-slate-300 bg-white/5',
  sandbox: 'border-sandbox/60 text-sandbox bg-sandbox/10',
  warn: 'border-amber-300/40 text-amber-200 bg-amber-300/10',
  ok: 'border-emerald-300/40 text-emerald-200 bg-emerald-300/10',
  danger: 'border-rose-300/40 text-rose-200 bg-rose-300/10',
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
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-px text-[10px] font-bold uppercase tracking-wider ${TONES[tone]}`}
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
}: {
  title: string;
  children: ReactNode;
  testId?: string;
  actions?: ReactNode;
}) {
  return (
    <section className="border-t border-white/[0.07] px-4 py-3.5" data-testid={testId}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {title}
        </h3>
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
    tone === 'danger'
      ? 'border-rose-400/30 bg-rose-400/10 text-rose-100'
      : tone === 'info'
        ? 'border-sky-300/25 bg-sky-300/10 text-sky-100'
        : tone === 'demo'
          ? 'border-demo/40 bg-demo/10 text-violet-100'
          : 'border-amber-300/30 bg-amber-300/10 text-amber-100';
  return (
    <div
      role="note"
      className={`rounded-lg border px-3 py-2 text-[12.5px] leading-snug ${cls}`}
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
      className={`text-sky-300 underline-offset-2 hover:underline ${className}`}
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-[12px] text-slate-400">
      <span
        className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white/70"
        aria-hidden
      />
      {label}
    </span>
  );
}
