import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LayerId } from '@worldlens/shared';
import type { QualityPreference } from '../perf/tiers';
import { useAppStore } from '../state/store';
import { Icon } from './ui';

const LAYERS: Array<{ id: LayerId; label: string; hint: string }> = [
  { id: 'news', label: 'Current events', hint: 'Live news clusters' },
  { id: 'history', label: 'Historical events', hint: 'Curated, Wikipedia-referenced' },
  {
    id: 'battles',
    label: 'Battles since 1800',
    hint: 'About 5,100 battles and sieges from Wikidata (CC0); shown with historical events',
  },
  { id: 'demo', label: 'Demo scenarios', hint: 'Synthetic, always labelled DEMO' },
  {
    id: 'borders',
    label: 'Borders',
    hint: 'Change on the exact day (OpenHistoricalMap); today’s from Natural Earth',
  },
  {
    id: 'frontlines',
    label: 'Frontlines / ceasefire lines',
    hint: 'Dated ceasefire and control lines (Natural Earth); no live war frontlines',
  },
  { id: 'labels', label: 'Labels', hint: 'Event names on the globe' },
];

function ToggleRow({
  checked,
  onChange,
  label,
  hint,
  testId,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  testId: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`group flex cursor-pointer items-center gap-3 rounded-[var(--radius-inner)] px-2.5 py-2 transition-colors ${
        disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-white/[0.05]'
      }`}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[12.5px] ${checked ? 'text-white/90' : 'text-white/60'}`}
        >
          {label}
        </span>
        {hint && (
          <span className="mt-0.5 block text-[10.5px] leading-snug text-white/35">{hint}</span>
        )}
      </span>
      <span
        className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border transition-colors ${
          checked
            ? 'border-transparent bg-[var(--active-bg)] text-[var(--active-fg)]'
            : 'border-white/25'
        }`}
        aria-hidden
      >
        {checked && <Icon name="check" className="h-2.5 w-2.5" />}
      </span>
    </label>
  );
}

function Group({
  title,
  children,
  first = false,
}: {
  title: string;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <fieldset className={first ? '' : 'mt-2 border-t border-white/[0.07] pt-2'}>
      <legend className="px-2.5 pb-1 pt-1 text-[10.5px] tracking-[0.08em] text-white/35">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

export function LayerMenu() {
  const [open, setOpen] = useState(false);
  const layers = useAppStore((s) => s.layers);
  const setLayer = useAppStore((s) => s.setLayer);
  const quality = useAppStore((s) => s.quality);
  const tier = useAppStore((s) => s.qualityTier);
  const setQuality = useAppStore((s) => s.setQuality);
  const dayNight = useAppStore((s) => s.dayNight);
  const setDayNight = useAppStore((s) => s.setDayNight);
  const nightLights = useAppStore((s) => s.nightLights);
  const setNightLights = useAppStore((s) => s.setNightLights);
  const setDiagnostics = useAppStore((s) => s.setDiagnostics);
  const diagnostics = useAppStore((s) => s.diagnosticsOpen);
  const cardOpen = useAppStore((s) => s.cardOpen);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.dispatchEvent(new Event('worldlens:chrome'));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const activeCount = LAYERS.filter((l) => layers[l.id]).length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-pressed={open}
        onClick={() => setOpen(!open)}
        className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors ${
          open
            ? 'bg-white/[0.12] text-white'
            : 'text-white/70 hover:bg-white/[0.08] hover:text-white'
        }`}
        data-testid="layers-button"
      >
        <Icon name="layers" className="h-4 w-4 md:h-5 md:w-5" />
        <span className="hidden lg:inline">Layers</span>
        <span className="tabular hidden text-[10.5px] text-white/35 lg:inline">{activeCount}</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            data-label-occluder
            className={`glass scroll-thin fixed top-[68px] z-50 max-h-[calc(100dvh-12rem)] w-[320px] overflow-y-auto rounded-[var(--radius-outer)] p-2 ${cardOpen ? 'right-[400px]' : 'right-3'}`}
            role="dialog"
            aria-label="Layers and settings"
          >
            <Group title="Layers" first>
              {LAYERS.map((l) => (
                <ToggleRow
                  key={l.id}
                  checked={!!layers[l.id]}
                  onChange={(next) => setLayer(l.id, next)}
                  label={l.label}
                  hint={l.hint}
                  testId={`layer-${l.id}`}
                />
              ))}
            </Group>
            <Group title="Day and night">
              <ToggleRow
                checked={dayNight}
                onChange={setDayNight}
                label="Night time"
                hint={
                  tier === 'LOW'
                    ? 'Not drawn at LOW graphics quality.'
                    : 'Darkens where the sun has set. Off: evenly lit.'
                }
                testId="setting-day-night"
              />
              <ToggleRow
                checked={dayNight && nightLights}
                onChange={setNightLights}
                label="City lights at night"
                hint={
                  dayNight
                    ? 'From 1880, when electric street lighting began (NASA, 2016 data).'
                    : 'Needs night time on.'
                }
                testId="setting-night-lights"
                disabled={!dayNight}
              />
            </Group>
            <Group title="Graphics quality">
              <div className="grid grid-cols-4 gap-1 px-1">
                {(['AUTO', 'LOW', 'MEDIUM', 'HIGH'] as QualityPreference[]).map((q) => (
                  <button
                    key={q}
                    type="button"
                    aria-pressed={quality === q}
                    onClick={() => setQuality(q)}
                    className={`rounded-full py-1.5 text-[11px] transition-colors ${
                      quality === q
                        ? 'bg-[var(--active-bg)] text-[var(--active-fg)]'
                        : 'text-white/55 hover:bg-white/[0.06] hover:text-white/90'
                    }`}
                    data-testid={`quality-${q}`}
                  >
                    {q === 'MEDIUM' ? 'MED' : q}
                  </button>
                ))}
              </div>
              <p className="px-2.5 pb-1 pt-2 text-[10.5px] text-white/35">
                {quality === 'AUTO'
                  ? `Adaptive — currently ${tier}. Adjusts to keep motion smooth.`
                  : `Fixed at ${quality}.`}
              </p>
            </Group>
            <div className="mt-2 border-t border-white/[0.07] pt-2">
              <ToggleRow
                checked={diagnostics}
                onChange={setDiagnostics}
                label="Developer diagnostics"
                hint="Shift+D"
                testId="setting-diagnostics"
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
