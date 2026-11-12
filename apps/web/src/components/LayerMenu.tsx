import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LayerId } from '@worldlens/shared';
import { useIsMobile } from '../hooks/useMedia';
import type { QualityPreference } from '../perf/tiers';
import { sheetTabOpen, useAppStore } from '../state/store';
import { Icon, popoverPlacement } from './ui';

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
    id: 'territories',
    label: 'Territories',
    hint: 'On a past date: countries filled with their colours, and in a war the ground each side holds (reconstructed; approximate). Coastline © OpenStreetMap contributors',
  },
  {
    id: 'frontlines',
    label: 'Frontlines / ceasefire lines',
    hint: 'Fronts of past wars, moving day by day (reconstructed from when places changed hands; approximate), and ceasefire lines (Natural Earth). No live war frontlines',
  },
  { id: 'labels', label: 'Event names', hint: 'Titles beside event markers' },
  {
    id: 'places',
    label: 'Place names',
    hint: 'Cities, rivers, lakes, seas, mountains and deserts (Natural Earth); never over events',
  },
];

function ToggleRow({
  checked,
  onChange,
  label,
  hint,
  testId,
  disabled = false,
  divided = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  testId: string;
  disabled?: boolean;
  /** Rows of the mobile sheet: separated by hairlines, like the events list. */
  divided?: boolean;
}) {
  const row = (
    <label
      className={`group flex cursor-pointer items-center gap-3 px-2.5 transition-colors ${
        divided ? 'rounded-[10px] py-2.5' : 'rounded-[var(--radius-inner)] py-2'
      } ${disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-white/[0.05]'}`}
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
  return divided ? <div className="border-b border-white/[0.05] last:border-0">{row}</div> : row;
}

function Group({
  title,
  children,
  first = false,
}: {
  title?: string;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <fieldset className={first ? '' : 'mt-2 border-t border-white/[0.07] pt-2'}>
      {title && (
        <legend className="px-2.5 pb-1 pt-1 text-[10.5px] tracking-[0.08em] text-white/35">
          {title}
        </legend>
      )}
      {children}
    </fieldset>
  );
}

/** Layer toggles and display settings: the desktop popover and the mobile sheet's tab. */
function LayerSettings({ sheet = false }: { sheet?: boolean }) {
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
  return (
    <>
      {/* The sheet's header already names the list. */}
      <Group title={sheet ? undefined : 'Layers'} first>
        {LAYERS.map((l) => (
          <ToggleRow
            key={l.id}
            checked={!!layers[l.id]}
            onChange={(next) => setLayer(l.id, next)}
            label={l.label}
            hint={l.hint}
            testId={`layer-${l.id}`}
            divided={sheet}
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
          divided={sheet}
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
          divided={sheet}
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
          divided={sheet}
        />
      </div>
    </>
  );
}

/** Phones: the Layers tab of the bottom sheet, laid out like the events list. */
export function LayersPanel() {
  const layers = useAppStore((s) => s.layers);
  const shown = LAYERS.filter((l) => layers[l.id]).length;
  return (
    <div
      className="flex h-full min-h-0 flex-col"
      role="group"
      aria-label="Layers and settings"
      data-testid="layers-panel"
    >
      <div className="flex items-center gap-2 px-3.5 pb-2 pt-3">
        <h2 className="text-[12px] text-white/55">
          On the globe
          <span className="tabular ml-1.5 text-white/30">{shown}</span>
        </h2>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        <LayerSettings sheet />
      </div>
    </div>
  );
}

export function LayerMenu() {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  const layers = useAppStore((s) => s.layers);
  const cardOpen = useAppStore((s) => s.cardOpen);
  // Phones open the Layers tab of the bottom sheet (like Search and Ask AI) instead of a popover.
  const sheetOpen = useAppStore((s) => sheetTabOpen(s, 'layers'));
  const toggleSheetTab = useAppStore((s) => s.toggleSheetTab);
  const shown = mobile ? sheetOpen : open;
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.dispatchEvent(new Event('worldlens:chrome'));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    // pointerdown, not mousedown: the globe cancels pointerdown, which suppresses mousedown, so
    // tapping or clicking the globe never closed the menu.
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const activeCount = LAYERS.filter((l) => layers[l.id]).length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-expanded={shown}
        aria-haspopup={mobile ? undefined : 'true'}
        aria-controls={mobile ? 'bottom-sheet' : undefined}
        aria-pressed={shown}
        aria-label="Layers"
        onClick={() => (mobile ? toggleSheetTab('layers') : setOpen(!open))}
        className={`flex h-9 items-center gap-1.5 rounded-full px-2 text-[12.5px] transition-colors sm:px-3 ${
          shown
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
        !mobile &&
        createPortal(
          <div
            ref={panelRef}
            data-label-occluder
            className={`glass scroll-thin w-[320px] overflow-y-auto rounded-[var(--radius-outer)] p-2 ${popoverPlacement(cardOpen)}`}
            role="dialog"
            aria-label="Layers and settings"
          >
            <LayerSettings />
          </div>,
          document.body,
        )}
    </div>
  );
}
