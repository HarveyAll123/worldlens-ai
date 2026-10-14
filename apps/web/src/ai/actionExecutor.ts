/**
 * Applies AI-proposed globe actions. Every action is re-validated in the browser with the
 * shared Zod schemas (defence in depth) — nothing from the network is executed as code.
 * Sequences containing several set_time steps become a "tour" the user can pause or stop.
 */
import { parseClientAction, parseIso, type ClientAction, type Resolution } from '@worldlens/shared';
import { api } from '../lib/api';
import { useAppStore } from '../state/store';

export function resolutionForIso(date: string): Resolution {
  if (/T\d{2}/.test(date)) return 'hour';
  if (/^[+-]?\d{4,6}-\d{2}-\d{2}$/.test(date)) return 'day';
  if (/^[+-]?\d{4,6}-\d{2}$/.test(date)) return 'month';
  return 'year';
}

export function validateActions(raw: unknown[]): { actions: ClientAction[]; rejected: string[] } {
  const actions: ClientAction[] = [];
  const rejected: string[] = [];
  for (const r of raw) {
    const p = parseClientAction(r);
    if (p.ok) actions.push(p.action);
    else rejected.push(p.error);
  }
  return { actions, rejected };
}

/** Split into steps: a new step starts at each set_time after the first one. */
export function toSteps(actions: ClientAction[]): ClientAction[][] {
  const steps: ClientAction[][] = [];
  let current: ClientAction[] = [];
  let hasTime = false;
  for (const a of actions) {
    if (a.tool === 'set_time' && hasTime) {
      steps.push(current);
      current = [];
      hasTime = false;
    }
    if (a.tool === 'set_time') hasTime = true;
    current.push(a);
  }
  if (current.length) steps.push(current);
  return steps;
}

export function applyAction(a: ClientAction): void {
  const s = useAppStore.getState();
  switch (a.tool) {
    case 'fly_to':
      if (a.args.lat !== undefined && a.args.lon !== undefined) {
        s.flyTo({
          lat: a.args.lat,
          lon: a.args.lon,
          altitudeKm: a.args.altitude_km ?? 1500,
          ...(a.args.label ? { label: a.args.label } : {}),
        });
      }
      break;
    case 'set_time':
      s.setTime(parseIso(a.args.date), a.args.resolution ?? resolutionForIso(a.args.date));
      break;
    case 'return_to_live':
      s.returnToLive();
      break;
    case 'highlight_region':
      s.setHighlight(a.args.country === 'none' ? null : a.args.country);
      break;
    case 'show_events':
      s.setKindFilter(a.args.kind, a.args.categories ?? null);
      if (a.args.kind !== 'historical') s.setLayer('news', true);
      if (a.args.kind !== 'news') s.setLayer('history', true);
      break;
    case 'open_event':
      s.selectEvent(a.args.event_id);
      break;
    case 'toggle_layer':
      s.setLayer(a.args.layer, a.args.enabled);
      break;
    case 'open_take_action':
      s.openTakeAction({
        eventId: a.args.event_id,
        optionId: a.args.action_option_id,
        ...(a.args.amount_usd ? { amount: a.args.amount_usd } : {}),
      });
      break;
  }
}

/** Apply one step; if it opens an event without moving the camera, fly to that event. */
function applyStep(step: ClientAction[]): void {
  for (const a of step) applyAction(a);
  const open = step.find((a) => a.tool === 'open_event');
  if (open && !step.some((a) => a.tool === 'fly_to')) {
    const id = (open.args as { event_id: string }).event_id;
    void api
      .event(id)
      .then(({ event }) => {
        if (useAppStore.getState().selectedEventId !== id) return;
        useAppStore.getState().flyTo({
          lat: event.location.lat,
          lon: event.location.lon,
          altitudeKm: event.location.precision === 'city' ? 800 : 2200,
        });
      })
      .catch(() => undefined);
  }
}

export function runActions(raw: unknown[]): { applied: number; rejected: string[]; tour: boolean } {
  const { actions, rejected } = validateActions(raw);
  const steps = toSteps(actions);
  if (steps.length > 1) {
    useAppStore.getState().setTour({ steps, index: 0, playing: true });
    applyStep(steps[0]!);
    return { applied: actions.length, rejected, tour: true };
  }
  applyStep(actions);
  return { applied: actions.length, rejected, tour: false };
}

export function goToTourStep(index: number): void {
  const s = useAppStore.getState();
  const tour = s.tour;
  if (!tour || index < 0 || index >= tour.steps.length) return;
  s.setTour({ ...tour, index });
  applyStep(tour.steps[index]!);
}
