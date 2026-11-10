/**
 * What the assistant did on the app, under its reply: one chip per action ("Flew to Kyiv",
 * "Went to 24 Feb 2022", "Frontlines on"). A chip does it again.
 */
import { useMemo } from 'react';
import type { ClientAction } from '@worldlens/shared';
import { actionLabel } from '../ai/actionLabels';
import { runActions, validateActions } from '../ai/actionExecutor';
import { useCountryOutlines, useEventDetail } from '../hooks/useData';

function Chip({ action }: { action: ClientAction }) {
  const eventId = action.tool === 'open_event' ? action.args.event_id : null;
  const iso3 =
    action.tool === 'highlight_region' && action.args.country !== 'none'
      ? action.args.country
      : null;
  const event = useEventDetail(eventId);
  const outlines = useCountryOutlines(!!iso3);
  const label = actionLabel(action, {
    eventTitle: event.data?.event.title,
    countryName: outlines.data?.features.find((f) => f.properties.iso3 === iso3)?.properties.name,
  });
  return (
    <button
      type="button"
      onClick={() => runActions([action])}
      title={`${label} — again`}
      className="max-w-[230px] truncate rounded-full border border-white/10 bg-white/[0.05] px-2 py-[3px] text-[10.5px] text-white/70 transition-colors duration-150 hover:bg-white/[0.10] hover:text-white"
      data-testid="ai-action"
    >
      {label}
    </button>
  );
}

/** `raw`: a reply's actions, also from stored chats — validated again before they show. */
export function AiActions({ raw }: { raw: unknown[] }) {
  const actions = useMemo(() => validateActions(raw).actions, [raw]);
  if (actions.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1" aria-label="What the assistant did">
      {actions.map((a, i) => (
        <Chip key={i} action={a} />
      ))}
    </div>
  );
}
