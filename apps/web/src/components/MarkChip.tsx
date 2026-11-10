/**
 * What is marked on the globe — a place (the assistant's highlight_place: "Nile · river") or a
 * country (highlight_region) — as small glass pills under the top bar, each with × to clear it.
 */
import { PLACE_KIND } from '@worldlens/shared';
import { useCountryOutlines } from '../hooks/useData';
import { useAppStore } from '../state/store';
import { Icon } from './ui';

function Pill({ what, kind, onClear }: { what: string; kind: string; onClear: () => void }) {
  return (
    <div
      className="glass pointer-events-auto flex h-8 max-w-[min(18rem,calc(100vw-24px))] items-center gap-1.5 rounded-full pl-3 pr-1 text-[12px]"
      data-label-occluder
      data-testid="mark-chip"
    >
      <span className="shrink-0 text-white/40">Marked</span>
      <span className="truncate text-white/90">{what}</span>
      <span className="shrink-0 text-white/40">· {kind}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear the mark on ${what}`}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white/55 transition-colors duration-150 ease-out hover:bg-white/[0.08] hover:text-white"
        data-testid="mark-chip-clear"
      >
        <Icon name="close" className="h-3 w-3" />
      </button>
    </div>
  );
}

export function MarkChip() {
  const marks = useAppStore((s) => s.placeMarks);
  const iso3 = useAppStore((s) => s.highlightIso3);
  const outlines = useCountryOutlines(!!iso3);
  const country = iso3
    ? (outlines.data?.features.find((f) => f.properties.iso3 === iso3)?.properties.name ?? iso3)
    : null;
  if (marks.length === 0 && !country) return null;
  const s = useAppStore.getState();
  return (
    <div className="pointer-events-none absolute left-1/2 top-[68px] z-20 flex w-max max-w-[calc(100vw-24px)] -translate-x-1/2 flex-wrap justify-center gap-1.5">
      {marks.map((mark) => (
        <Pill
          key={mark.id}
          what={mark.name}
          kind={PLACE_KIND[mark.kind].label}
          onClear={() => s.clearPlaceMarks(mark.id)}
        />
      ))}
      {country && <Pill what={country} kind="country" onClear={() => s.setHighlight(null)} />}
    </div>
  );
}
