import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../state/store';
import { Icon, popoverPlacement } from './ui';

const KEYS: Array<{ label: string; keys: string[] }> = [
  { label: 'Search places, events, dates', keys: ['/'] },
  { label: 'Play / pause time', keys: ['Space'] },
  { label: 'Step one unit', keys: ['←', '→'] },
  { label: 'Step ten units', keys: ['Shift', '←/→'] },
  { label: 'Coarser / finer resolution', keys: ['PgUp', 'PgDn'] },
  { label: 'Jump to 1800 / Live', keys: ['Home', 'End'] },
  { label: 'Zoom resolution', keys: ['+', '−'] },
  { label: 'Developer diagnostics', keys: ['Shift', 'D'] },
  { label: 'Close a panel or popover', keys: ['Esc'] },
];

const TIPS = [
  'Drag the timeline to scrub; scroll or swipe to step; pinch or ⌘/Ctrl+scroll to zoom.',
  'Click a marker or an event row to open it. Country names in search open their borders of the day.',
  'Ask AI can fly the camera, set the date and open events — every action is validated first.',
];

export function HelpSheet() {
  const [open, setOpen] = useState(false);
  const cardOpen = useAppStore((s) => s.cardOpen);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable === true;
      if (typing) return;
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new Event('worldlens:chrome'));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    // pointerdown: the globe cancels it, which suppresses mousedown (see LayerMenu).
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div className="relative hidden md:block" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Keyboard shortcuts and help"
        title="Help (?)"
        onClick={() => setOpen(!open)}
        className={`grid h-9 w-9 place-items-center rounded-full transition-colors md:w-10 ${
          open
            ? 'bg-white/[0.12] text-white'
            : 'text-white/55 hover:bg-white/[0.08] hover:text-white'
        }`}
        data-testid="help-button"
      >
        <Icon name="help" className="h-4 w-4 md:h-5 md:w-5" />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            data-label-occluder
            className={`glass scroll-thin w-[340px] overflow-y-auto rounded-[var(--radius-outer)] p-3.5 ${popoverPlacement(cardOpen)}`}
            role="dialog"
            aria-label="Keyboard shortcuts and help"
            data-testid="help-sheet"
          >
            <div className="flex items-center gap-2 px-1 pb-2">
              <h2 className="text-[12px] text-white/55">Keyboard</h2>
              <span className="ml-auto text-[10px] text-white/30">Press ? anytime</span>
            </div>
            <dl className="space-y-0.5">
              {KEYS.map((row) => (
                <div key={row.label} className="flex items-center gap-3 px-1 py-1">
                  <dt className="min-w-0 flex-1 truncate text-[11.5px] text-white/65">
                    {row.label}
                  </dt>
                  <dd className="m-0 flex shrink-0 items-center gap-1">
                    {row.keys.map((k) => (
                      <kbd
                        key={k}
                        className="rounded-[6px] border border-white/15 bg-white/[0.06] px-1.5 py-0.5 font-sans text-[9.5px] text-white/70"
                      >
                        {k}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-2 border-t border-white/[0.07] pt-2">
              <h2 className="px-1 pb-1 text-[12px] text-white/55">Pointer</h2>
              <ul className="space-y-1.5 px-1">
                {TIPS.map((tip) => (
                  <li key={tip} className="text-[10.5px] leading-relaxed text-white/40">
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
