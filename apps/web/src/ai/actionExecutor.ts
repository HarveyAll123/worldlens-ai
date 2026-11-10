/**
 * Applies AI-proposed globe actions. Every action is re-validated in the browser with the
 * shared Zod schemas (defence in depth) — nothing from the network is executed as code.
 * Sequences containing several set_time steps become a "tour" the user can pause or stop.
 */
import {
  TEMPORAL_CONFIG,
  findPlaceNames,
  parseClientAction,
  parseIso,
  utcMs,
  type ClientAction,
  type Resolution,
} from '@worldlens/shared';
import { account } from '../lib/account';
import { api } from '../lib/api';
import { showCountryNamed } from '../lib/countries';
import { marksView } from '../lib/placeMarks';
import { placeNamesQuery, placeShapesQuery } from '../hooks/useData';
import { queryClient } from '../lib/queryClient';
import type { QualityPreference } from '../perf/tiers';
import { useAccount, type AccountSection } from '../state/account';
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

const COMPASS = {
  north: [1, 0],
  south: [-1, 0],
  east: [0, 1],
  west: [0, -1],
  northeast: [Math.SQRT1_2, Math.SQRT1_2],
  northwest: [Math.SQRT1_2, -Math.SQRT1_2],
  southeast: [-Math.SQRT1_2, Math.SQRT1_2],
  southwest: [-Math.SQRT1_2, -Math.SQRT1_2],
} as const;

/** Where a zoom from the current view lands: same centre, altitude ÷ or × factor. */
export function zoomedView(
  camera: { lat: number; lon: number; altitudeKm: number },
  direction: 'in' | 'out',
  factor = 2.5,
): { lat: number; lon: number; altitudeKm: number } {
  const alt = direction === 'in' ? camera.altitudeKm / factor : camera.altitudeKm * factor;
  return { lat: camera.lat, lon: camera.lon, altitudeKm: Math.min(40_000, Math.max(1, alt)) };
}

/** Where a pan from the current view lands; default distance about half the visible width. */
export function pannedView(
  camera: { lat: number; lon: number; altitudeKm: number },
  direction: keyof typeof COMPASS,
  distanceKm = camera.altitudeKm * 0.6,
): { lat: number; lon: number; altitudeKm: number } {
  const [north, east] = COMPASS[direction];
  const lat = Math.min(85, Math.max(-85, camera.lat + (north * distanceKm) / 111.2));
  const cos = Math.max(0.05, Math.cos((camera.lat * Math.PI) / 180));
  let lon = camera.lon + (east * distanceKm) / (111.2 * cos);
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { lat, lon, altitudeKm: camera.altitudeKm };
}

const SECTION: Record<string, AccountSection> = {
  username: 'username',
  email: 'email',
  password: 'password',
  delete_account: 'delete',
};

/**
 * Opens a part of the app for the user. Account settings only open and scroll to a section: the
 * assistant has no tool that types into them, submits them or deletes anything. A guest asked
 * about account, AI settings or history gets the sign-in window.
 */
export function openPanel(panel: string, section?: string): void {
  const s = useAppStore.getState();
  const acc = useAccount.getState();
  const mobile = window.matchMedia?.('(max-width: 767px)').matches ?? false;
  if ((panel === 'account' || panel === 'ai_settings' || panel === 'history') && !acc.user)
    return acc.openDialog('sign-in');
  const click = (testId: string) => {
    const b = document.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
    if (b && b.getAttribute('aria-expanded') !== 'true') b.click();
  };
  switch (panel) {
    case 'close':
      // Windows and menus only: sign-up steps (code, profile) stay for the user to finish.
      acc.setPanel(null);
      if (acc.dialog === 'sign-in') acc.openDialog(null);
      for (const id of ['help-button', 'layers-button']) {
        const b = document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
        if (b?.getAttribute('aria-expanded') === 'true') b.click();
      }
      return;
    case 'account':
      return acc.showSection('settings', section ? (SECTION[section] ?? null) : null);
    case 'ai_settings':
      return acc.showSection('ai', null);
    case 'history':
      return acc.showSection('history', null);
    case 'sign_in':
      return acc.user ? acc.showSection('settings', null) : acc.openDialog('sign-in');
    case 'events':
      if (mobile)
        return s.setSheet(s.selectedEventId || s.selectedCountry ? 'detail' : 'events', true);
      return s.setCardOpen(true);
    case 'search':
      if (mobile) return s.setSheet('search', true);
      return document.querySelector<HTMLInputElement>('[data-testid="search-input"]')?.focus();
    case 'layers':
      if (mobile) return s.setSheet('layers', true);
      return click('layers-button');
    case 'help':
      return click('help-button');
  }
}

type MarkArgs = { name: string; kind?: string; id?: string };

/**
 * Mark places (highlight_place): each city, river, lake, sea, mountain or desert — by the id the
 * server found, else by name — drawn on the globe, then the camera brought to show them all
 * (several marked in one answer are framed together). "none" clears every mark.
 */
export async function markPlaces(list: MarkArgs[]): Promise<void> {
  const s = useAppStore.getState();
  if (list.some((a) => a.name === 'none')) s.clearPlaceMarks(null);
  const wanted = list.filter((a) => a.name !== 'none');
  if (wanted.length === 0) return;
  const names = await queryClient.ensureQueryData(placeNamesQuery);
  const marks = [];
  for (const args of wanted) {
    const found =
      (args.id ? names.find((n) => n.id === args.id) : undefined) ??
      findPlaceNames(
        names,
        args.name,
        (args.kind ?? 'any') as Parameters<typeof findPlaceNames>[2],
      )[0];
    if (!found) {
      useAppStore.getState().announce(`No place named ${args.name} on the map`);
      continue;
    }
    const mark = {
      id: found.id,
      name: found.name,
      kind: found.kind,
      lat: found.lat,
      lon: found.lon,
    };
    useAppStore.getState().addPlaceMark(mark);
    marks.push(mark);
  }
  if (marks.length === 0) return;
  const shapes = await queryClient.ensureQueryData(placeShapesQuery).catch(() => ({}));
  // Still marked (a clear may have come meanwhile).
  const now = new Set(useAppStore.getState().placeMarks.map((m) => m.id));
  const still = marks.filter((m) => now.has(m.id));
  const view = marksView(still, names, shapes);
  if (view) useAppStore.getState().flyTo(view);
  useAppStore.getState().announce(`Marked ${still.map((m) => m.name).join(', ')}`);
}

/** One place (a chip done again, or a single highlight_place). */
export const markPlace = (args: MarkArgs) => markPlaces([args]);

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
    case 'zoom':
      s.flyTo(zoomedView(s.camera, a.args.direction, a.args.factor));
      break;
    case 'pan':
      s.flyTo(pannedView(s.camera, a.args.direction, a.args.distance_km));
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
    case 'set_display': {
      const { quality, night, city_lights: lights, diagnostics } = a.args;
      if (quality) s.setQuality(quality.toUpperCase() as QualityPreference);
      if (night !== undefined) s.setDayNight(night);
      if (lights !== undefined) {
        // City lights show on the night side only.
        if (lights) s.setDayNight(true);
        s.setNightLights(lights);
      }
      if (diagnostics !== undefined) s.setDiagnostics(diagnostics);
      break;
    }
    case 'set_ai_settings': {
      if (a.args.agent_mode !== undefined) s.setAiAgent(a.args.agent_mode);
      if (a.args.remember_chats === undefined && a.args.read_history === undefined) break;
      const acc = useAccount.getState();
      if (!acc.user) {
        acc.openDialog('sign-in');
        break;
      }
      // The user sees the switches change (AI tab of the account window).
      acc.showSection('ai', null);
      void account
        .saveAiSettings({
          ...(a.args.remember_chats !== undefined ? { aiMemory: a.args.remember_chats } : {}),
          ...(a.args.read_history !== undefined ? { aiReadsHistory: a.args.read_history } : {}),
        })
        .then(({ user }) => useAccount.getState().setUser(user))
        .catch(() => undefined);
      break;
    }
    case 'open_panel':
      openPanel(a.args.panel, a.args.section);
      break;
    case 'highlight_place':
      // Several in one step are marked together (applyStep).
      void markPlace(a.args).catch(() => undefined);
      break;
    case 'open_country': {
      const name = a.args.name;
      void showCountryNamed(queryClient, name)
        .then((found) => {
          if (!found) useAppStore.getState().announce(`No country named ${name} on the map`);
        })
        .catch(() => undefined);
      break;
    }
    case 'play_timeline': {
      const { playing, from, resolution, speed } = a.args;
      if (!playing) {
        s.setTimelinePlaying(false);
        break;
      }
      if (from) s.setTime(parseIso(from), resolution ?? resolutionForIso(from));
      // From LIVE it starts at the beginning, as the Play button does.
      else if (s.mode === 'live')
        s.setTime(utcMs(TEMPORAL_CONFIG.minNavigableYear), resolution ?? 'year');
      else if (resolution) s.setResolution(resolution);
      if (speed) s.setTimelineSpeed(speed);
      s.setTimelinePlaying(true);
      break;
    }
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
  // Places marked in one answer are framed together, not each in turn.
  const marks = step.filter((a) => a.tool === 'highlight_place');
  if (marks.length > 1)
    void markPlaces(marks.map((a) => a.args as MarkArgs)).catch(() => undefined);
  for (const a of step) if (marks.length <= 1 || a.tool !== 'highlight_place') applyAction(a);
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

/**
 * Narrower desktops share one card between the chat and the selected event: an answer that
 * opens an event hands the card to that event (as the mobile sheet does); Ask AI brings the
 * chat back. Later tour steps leave the card where the user put it. On wide screens the chat
 * has its own panel, so the event simply opens in the card beside it.
 */
function showOpenedEvent(step: ClientAction[]): void {
  const s = useAppStore.getState();
  if (!s.chatDocked && step.some((a) => a.tool === 'open_event')) s.setAssistantOpen(false);
}

export function runActions(raw: unknown[]): { applied: number; rejected: string[]; tour: boolean } {
  const { actions, rejected } = validateActions(raw);
  const steps = toSteps(actions);
  if (steps.length > 1) {
    useAppStore.getState().setTour({ steps, index: 0, playing: true });
    applyStep(steps[0]!);
    showOpenedEvent(steps[0]!);
    return { applied: actions.length, rejected, tour: true };
  }
  applyStep(actions);
  showOpenedEvent(actions);
  return { applied: actions.length, rejected, tour: false };
}

export function goToTourStep(index: number): void {
  const s = useAppStore.getState();
  const tour = s.tour;
  if (!tour || index < 0 || index >= tour.steps.length) return;
  s.setTour({ ...tour, index });
  applyStep(tour.steps[index]!);
}
