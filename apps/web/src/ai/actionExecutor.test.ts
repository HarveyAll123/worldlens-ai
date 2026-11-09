import { beforeEach, describe, expect, it } from 'vitest';
import { utcMs } from '@worldlens/shared';
import { useAppStore } from '../state/store';
import {
  goToTourStep,
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
