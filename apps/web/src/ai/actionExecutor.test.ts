import { beforeEach, describe, expect, it } from 'vitest';
import { utcMs } from '@worldlens/shared';
import type { AccountUser } from '../lib/account';
import { useAccount } from '../state/account';
import { useAppStore } from '../state/store';
import { actionLabel } from './actionLabels';
import { placeNamesQuery, placeShapesQuery } from '../hooks/useData';
import { queryClient } from '../lib/queryClient';
import {
  goToTourStep,
  markPlace,
  pannedView,
  resolutionForIso,
  runActions,
  toSteps,
  validateActions,
  zoomedView,
} from './actionExecutor';

describe('AI action executor', () => {
  beforeEach(() => {
    useAppStore.getState().returnToLive();
    useAppStore.getState().setTour(null);
    useAppStore.setState({ chatDocked: false, assistantOpen: false });
  });

  it('rejects malformed or unknown actions (no arbitrary execution)', () => {
    const { actions, rejected } = validateActions([
      { tool: 'fly_to', args: { lat: 23.6, lon: 120.9, altitude_km: 900 } },
      { tool: 'eval', args: { code: 'alert(1)' } },
      { tool: 'set_time', args: { date: 'tomorrow' } },
      { tool: 'fly_to', args: { lat: 999, lon: 0 } },
      'garbage',
    ]);
    expect(actions).toHaveLength(1);
    expect(rejected).toHaveLength(4);
  });

  it('enters historical mode and clamps to the navigable range', () => {
    runActions([{ tool: 'set_time', args: { date: '1815-06-18' } }]);
    const s = useAppStore.getState();
    expect(s.mode).toBe('historical');
    expect(s.timeMs).toBe(utcMs(1815, 6, 18));
    expect(s.resolution).toBe('day');
    runActions([{ tool: 'return_to_live', args: {} }]);
    expect(useAppStore.getState().mode).toBe('live');
  });

  it('turns multi-date answers into a tour', () => {
    const r = runActions([
      { tool: 'set_time', args: { date: '1935-01-13' } },
      { tool: 'open_event', args: { event_id: 'hist-saar-referendum-1935' } },
      { tool: 'set_time', args: { date: '1938-03-12' } },
      { tool: 'open_event', args: { event_id: 'hist-anschluss' } },
    ]);
    expect(r.tour).toBe(true);
    const tour = useAppStore.getState().tour!;
    expect(tour.steps).toHaveLength(2);
    expect(useAppStore.getState().selectedEventId).toBe('hist-saar-referendum-1935');
  });

  it('hands the context card to an event the answer opens, not to later tour steps', () => {
    const s = useAppStore.getState();
    s.setAssistantOpen(true);
    runActions([{ tool: 'return_to_live', args: {} }]);
    expect(useAppStore.getState().assistantOpen).toBe(true);
    runActions([{ tool: 'open_event', args: { event_id: 'hist-anschluss' } }]);
    expect(useAppStore.getState().assistantOpen).toBe(false);

    s.setAssistantOpen(true);
    runActions([
      { tool: 'set_time', args: { date: '1933' } },
      { tool: 'set_time', args: { date: '1938-03-12' } },
      { tool: 'open_event', args: { event_id: 'hist-saar-referendum-1935' } },
    ]);
    goToTourStep(1);
    expect(useAppStore.getState().selectedEventId).toBe('hist-saar-referendum-1935');
    expect(useAppStore.getState().assistantOpen).toBe(true);
  });

  it('keeps the docked chat open beside an event the answer opens (wide screens)', () => {
    useAppStore.setState({ chatDocked: true, assistantOpen: true });
    runActions([{ tool: 'open_event', args: { event_id: 'hist-anschluss' } }]);
    expect(useAppStore.getState().selectedEventId).toBe('hist-anschluss');
    expect(useAppStore.getState().assistantOpen).toBe(true);
  });

  it('opens Take Action review only (never pays)', () => {
    runActions([
      {
        tool: 'open_take_action',
        args: {
          event_id: 'demo-news-sulawesi-quake-relief',
          action_option_id: 'act-quake-relief-sandbox',
          amount_usd: 20,
        },
      },
    ]);
    expect(useAppStore.getState().takeAction).toEqual({
      eventId: 'demo-news-sulawesi-quake-relief',
      optionId: 'act-quake-relief-sandbox',
      amount: 20,
    });
  });

  it('infers resolution from ISO precision', () => {
    expect(resolutionForIso('1945')).toBe('year');
    expect(resolutionForIso('1945-05')).toBe('month');
    expect(resolutionForIso('1945-05-08')).toBe('day');
    expect(resolutionForIso('2026-10-14T09:00:00Z')).toBe('hour');
    expect(toSteps([])).toEqual([]);
  });
});

describe('relative camera moves (zoom, pan)', () => {
  const here = { lat: 52.5, lon: 13.4, altitudeKm: 900 };

  it('zooms about the same centre', () => {
    expect(zoomedView(here, 'in')).toEqual({ lat: 52.5, lon: 13.4, altitudeKm: 360 });
    expect(zoomedView(here, 'out', 4).altitudeKm).toBe(3600);
    expect(zoomedView({ ...here, altitudeKm: 30_000 }, 'out').altitudeKm).toBe(40_000); // capped
  });

  it('pans by about half the view, keeping the altitude', () => {
    const north = pannedView(here, 'north');
    expect(north.lat).toBeCloseTo(52.5 + 540 / 111.2, 5);
    expect(north.lon).toBe(13.4);
    expect(north.altitudeKm).toBe(900);
    const east = pannedView(here, 'east', 100);
    expect(east.lon).toBeGreaterThan(13.4);
    expect(east.lat).toBe(52.5);
    expect(pannedView({ lat: 0, lon: 179, altitudeKm: 900 }, 'east', 500).lon).toBeLessThan(0); // wraps
  });

  it('applies to the current camera', () => {
    useAppStore.setState({ camera: { ...here, bbox: null } });
    runActions([{ tool: 'zoom', args: { direction: 'in', factor: 3 } }]);
    expect(useAppStore.getState().flyRequest).toMatchObject({
      lat: 52.5,
      lon: 13.4,
      altitudeKm: 300,
    });
  });
});

describe('the assistant changes settings and opens panels — the account only to point', () => {
  const user = {
    id: 'u1',
    email: 'ada@example.com',
    emailVerified: true,
    name: 'Ada',
    image: null,
    firstName: 'Ada',
    lastName: null,
    username: 'ada',
    displayUsername: 'ada',
    providers: ['credential'],
    hasPassword: true,
    usernameChangeAvailableAt: null,
    needsProfile: false,
    aiMemory: true,
    aiReadsHistory: true,
    pendingEmail: null,
  } as unknown as AccountUser;

  beforeEach(() => {
    useAccount.setState({ user: null, status: 'guest', dialog: null, panel: null, section: null });
    useAppStore.setState({
      quality: 'AUTO',
      dayNight: false,
      nightLights: false,
      diagnosticsOpen: false,
      aiAgent: true,
      timelinePlaying: false,
      timelineSpeed: 1,
    });
  });

  it('display settings: quality, night, city lights (which need night), diagnostics', () => {
    runActions([{ tool: 'set_display', args: { quality: 'high', city_lights: true } }]);
    let s = useAppStore.getState();
    expect(s.quality).toBe('HIGH');
    expect(s.dayNight).toBe(true);
    expect(s.nightLights).toBe(true);
    runActions([{ tool: 'set_display', args: { night: false, diagnostics: true } }]);
    s = useAppStore.getState();
    expect(s.dayNight).toBe(false);
    expect(s.diagnosticsOpen).toBe(true);
  });

  it('account panels: a guest gets sign-in; an account opens at the section, marked', () => {
    runActions([{ tool: 'open_panel', args: { panel: 'account', section: 'password' } }]);
    expect(useAccount.getState().dialog).toBe('sign-in');
    expect(useAccount.getState().panel).toBeNull();
    useAccount.setState({ user, status: 'signed-in', dialog: null });
    runActions([{ tool: 'open_panel', args: { panel: 'account', section: 'delete_account' } }]);
    expect(useAccount.getState()).toMatchObject({ panel: 'settings', section: 'delete' });
    runActions([{ tool: 'open_panel', args: { panel: 'history' } }]);
    expect(useAccount.getState()).toMatchObject({ panel: 'history', section: null });
    runActions([{ tool: 'open_panel', args: { panel: 'close' } }]);
    expect(useAccount.getState().panel).toBeNull();
  });

  it('Chat mode on request; account AI settings need an account', () => {
    runActions([{ tool: 'set_ai_settings', args: { agent_mode: false } }]);
    expect(useAppStore.getState().aiAgent).toBe(false);
    expect(useAccount.getState().dialog).toBeNull();
    runActions([{ tool: 'set_ai_settings', args: { remember_chats: false } }]);
    expect(useAccount.getState().dialog).toBe('sign-in');
  });

  it('plays the timeline from a date, at a speed, and pauses it', () => {
    runActions([
      {
        tool: 'play_timeline',
        args: { playing: true, from: '1939-09', resolution: 'month', speed: 3 },
      },
    ]);
    let s = useAppStore.getState();
    expect(s.mode).toBe('historical');
    expect(s.timeMs).toBe(utcMs(1939, 9, 1));
    expect(s.resolution).toBe('month');
    expect(s.timelinePlaying).toBe(true);
    expect(s.timelineSpeed).toBe(4);
    runActions([{ tool: 'play_timeline', args: { playing: false } }]);
    expect(useAppStore.getState().timelinePlaying).toBe(false);
    // From LIVE it starts at 1800, like the Play button.
    useAppStore.getState().returnToLive();
    runActions([{ tool: 'play_timeline', args: { playing: true } }]);
    s = useAppStore.getState();
    expect(s.timeMs).toBe(utcMs(1800));
    expect(s.timelinePlaying).toBe(true);
  });

  it('says what it did, in a few words', () => {
    const label = (raw: unknown, lookup = {}) =>
      actionLabel(validateActions([raw]).actions[0]!, lookup);
    expect(label({ tool: 'fly_to', args: { lat: 50.45, lon: 30.52, label: 'Kyiv' } })).toBe(
      'Flew to Kyiv',
    );
    expect(label({ tool: 'set_time', args: { date: '2022-02-24' } })).toBe('Went to 24 Feb 2022');
    expect(label({ tool: 'toggle_layer', args: { layer: 'frontlines', enabled: true } })).toBe(
      'Frontlines on',
    );
    expect(label({ tool: 'set_display', args: { quality: 'high', night: false } })).toBe(
      'Graphics HIGH · Night time off',
    );
    expect(
      label({ tool: 'open_panel', args: { panel: 'account', section: 'delete_account' } }),
    ).toBe('Opened Account settings · Delete account');
    expect(label({ tool: 'open_event', args: { event_id: 'x' } }, { eventTitle: 'Waterloo' })).toBe(
      'Opened “Waterloo”',
    );
    expect(
      label({ tool: 'highlight_region', args: { country: 'UKR' } }, { countryName: 'Ukraine' }),
    ).toBe('Highlighted Ukraine');
    expect(label({ tool: 'set_ai_settings', args: { agent_mode: false } })).toBe('Chat mode');
  });
});

describe('marking a place (highlight_place)', () => {
  it('marks the place the server found and flies to show all of it; "none" clears', async () => {
    queryClient.setQueryData(placeNamesQuery.queryKey, [
      { id: 'r1', name: 'Nile', lat: 18.1, lon: 30.8, minZoom: 3, kind: 'r' as const },
      { id: 'C1', name: 'Paris', lat: 48.87, lon: 2.33, minZoom: 1.7, kind: 'C' as const },
    ]);
    queryClient.setQueryData(placeShapesQuery.queryKey, {
      r1: [
        [
          [31, 30],
          [32, 15],
          [33, 0],
        ],
      ],
    });
    await markPlace({ name: 'Nile', kind: 'river', id: 'r1' });
    expect(useAppStore.getState().placeMarks).toMatchObject([
      { id: 'r1', name: 'Nile', kind: 'r' },
    ]);
    expect(useAppStore.getState().flyRequest).toMatchObject({ lat: 15, lon: 32 });
    // By name when no id came (the browser finds it the same way).
    await markPlace({ name: 'Paris' });
    // Several stay marked, each with its own × (the newest last).
    expect(useAppStore.getState().placeMarks.map((m) => m.id)).toEqual(['r1', 'C1']);
    runActions([{ tool: 'highlight_place', args: { name: 'none', kind: 'any' } }]);
    expect(useAppStore.getState().placeMarks).toEqual([]);
  });
});
