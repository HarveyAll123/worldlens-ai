import { useEffect, useRef, useState } from 'react';
import type { LayerId } from '@worldlens/shared';
import type { QualityPreference } from '../perf/tiers';
import { useAppStore } from '../state/store';

const LAYERS: Array<{ id: LayerId; label: string; hint: string }> = [
  { id: 'news', label: 'Current events', hint: 'Live news clusters' },
  { id: 'history', label: 'Historical events', hint: 'Curated, Wikipedia-referenced' },
  { id: 'demo', label: 'Demo scenarios', hint: 'Synthetic, always labelled DEMO' },
  { id: 'borders', label: 'Borders', hint: 'Dated geometry with certainty styling' },
  { id: 'frontlines', label: 'Frontlines / control lines', hint: 'Only verified records' },
  { id: 'labels', label: 'Labels', hint: 'Event names on the globe' },
];

export function LayerMenu() {
  const [open, setOpen] = useState(false);
  const layers = useAppStore((s) => s.layers);
  const setLayer = useAppStore((s) => s.setLayer);
  const quality = useAppStore((s) => s.quality);
  const tier = useAppStore((s) => s.qualityTier);
  const setQuality = useAppStore((s) => s.setQuality);
  const setDiagnostics = useAppStore((s) => s.setDiagnostics);
  const diagnostics = useAppStore((s) => s.diagnosticsOpen);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
        className="glass rounded-xl px-3 py-2 text-[13px] font-medium hover:bg-white/10"
        data-testid="layers-button"
      >
        Layers
      </button>
      {open && (
        <div
          className="glass absolute right-0 top-full z-50 mt-2 w-72 rounded-xl p-3 shadow-2xl"
          role="dialog"
          aria-label="Layers and quality"
        >
          <fieldset>
            <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Layers
            </legend>
            {LAYERS.map((l) => (
              <label
                key={l.id}
                className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1.5 hover:bg-white/5"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 accent-sky-300"
                  checked={layers[l.id]}
                  onChange={(e) => setLayer(l.id, e.target.checked)}
                  data-testid={`layer-${l.id}`}
                />
                <span>
                  <span className="block text-[13px] text-slate-100">{l.label}</span>
                  <span className="block text-[11px] text-slate-400">{l.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className="mt-3 border-t border-white/10 pt-3">
            <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Graphics quality
            </legend>
            <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-white/10 text-[12px]">
              {(['AUTO', 'LOW', 'MEDIUM', 'HIGH'] as QualityPreference[]).map((q) => (
                <button
                  key={q}
                  type="button"
                  aria-pressed={quality === q}
                  onClick={() => setQuality(q)}
                  className={`py-1.5 font-medium ${quality === q ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/10'}`}
                  data-testid={`quality-${q}`}
                >
                  {q === 'MEDIUM' ? 'MED' : q}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              {quality === 'AUTO'
                ? `Adaptive — currently ${tier}. Adjusts to keep motion smooth.`
                : `Fixed at ${quality}.`}
            </p>
          </fieldset>
          <label className="mt-3 flex cursor-pointer items-center gap-2 border-t border-white/10 pt-3 text-[12px] text-slate-300">
            <input
              type="checkbox"
              className="accent-sky-300"
              checked={diagnostics}
              onChange={(e) => setDiagnostics(e.target.checked)}
            />
            Developer diagnostics <span className="text-slate-500">(Shift+D)</span>
          </label>
        </div>
      )}
    </div>
  );
}
