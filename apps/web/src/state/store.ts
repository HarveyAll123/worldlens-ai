/**
 * Application state (Zustand). The globe subscribes to slices imperatively so camera motion
 * and frame rendering never cause React re-renders.
 */
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  clampToNavigable,
  type ClientAction,
  type EventCategory,
  type LayerId,
  type Resolution,
} from '@worldlens/shared';
import type { QualityPreference, QualityTier } from '../perf/tiers';

export type Mode = 'live' | 'historical';
export type SheetView = 'events' | 'detail' | 'assistant' | 'search';

export interface CameraState {
  lat: number;
  lon: number;
  altitudeKm: number;
  bbox: string | null;
}

export interface TakeActionState {
  eventId: string;
  optionId: string;
  amount?: number;
}

export interface TourState {
  steps: ClientAction[][];
  index: number;
  playing: boolean;
}

export interface FlyRequest {
  lat: number;
  lon: number;
  altitudeKm: number;
  label?: string;
  seq: number;
}

/** A dated country (OpenHistoricalMap polity) the user clicked or searched. */
export interface CountrySelection {
  name: string;
  start: string;
  end: string | null;
  wikidata: string | null;
  label: [number, number];
  bbox: [number, number, number, number];
  ways: number[];
}

interface AppState {
  mode: Mode;
  timeMs: number;
  resolution: Resolution;
  selectedEventId: string | null;
  selectedCountry: CountrySelection | null;
  sheet: SheetView;
  sheetExpanded: boolean;
  assistantOpen: boolean;
  /** Desktop Context Card visibility (mobile uses the bottom sheet). */
  cardOpen: boolean;
  layers: Record<LayerId, boolean>;
  kindFilter: 'all' | 'news' | 'historical';
  categoryFilter: EventCategory[] | null;
  highlightIso3: string | null;
  takeAction: TakeActionState | null;
  tour: TourState | null;
  quality: QualityPreference;
  /** Tier currently in effect (from the PerformanceManager). */
  qualityTier: QualityTier;
  /** Darken the side of the globe where the sun has set (off = evenly lit). */
  dayNight: boolean;
  /** City lights on the night side (only with dayNight). */
  nightLights: boolean;
  diagnosticsOpen: boolean;
  camera: CameraState;
  flyRequest: FlyRequest | null;
  announcement: string;

  setTime: (ms: number, resolution?: Resolution) => void;
  setResolution: (r: Resolution) => void;
  returnToLive: () => void;
  selectEvent: (id: string | null) => void;
  selectCountry: (c: CountrySelection | null) => void;
  setSheet: (v: SheetView, expanded?: boolean) => void;
  setSheetExpanded: (v: boolean) => void;
  setAssistantOpen: (v: boolean) => void;
  setCardOpen: (v: boolean) => void;
  setLayer: (l: LayerId, on: boolean) => void;
  setKindFilter: (k: 'all' | 'news' | 'historical', categories?: EventCategory[] | null) => void;
  setHighlight: (iso3: string | null) => void;
  openTakeAction: (s: TakeActionState | null) => void;
  setTour: (t: TourState | null) => void;
  setQuality: (q: QualityPreference) => void;
  setDayNight: (on: boolean) => void;
  setNightLights: (on: boolean) => void;
  setDiagnostics: (open: boolean) => void;
  setCamera: (c: CameraState) => void;
  flyTo: (req: Omit<FlyRequest, 'seq'>) => void;
  announce: (msg: string) => void;
}

function readQuality(): QualityPreference {
  try {
    const v = localStorage.getItem('worldlens.quality');
    if (v === 'AUTO' || v === 'LOW' || v === 'MEDIUM' || v === 'HIGH') return v;
  } catch {
    /* storage unavailable */
  }
  return 'AUTO';
}

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === '1' || v === '0') return v === '1';
  } catch {
    /* storage unavailable */
  }
  return fallback;
}

function saveFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

let flySeq = 0;

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set) => ({
    mode: 'live',
    timeMs: Date.now(),
    resolution: 'day',
    selectedEventId: null,
    selectedCountry: null,
    sheet: 'events',
    sheetExpanded: false,
    assistantOpen: false,
    cardOpen: true,
    layers: {
      news: true,
      history: true,
      battles: true,
      demo: true,
      borders: false,
      frontlines: true,
      labels: true,
    },
    kindFilter: 'all',
    categoryFilter: null,
    highlightIso3: null,
    takeAction: null,
    tour: null,
    quality: readQuality(),
    qualityTier: 'MEDIUM',
    dayNight: readFlag('worldlens.dayNight', true),
    nightLights: readFlag('worldlens.nightLights', true),
    diagnosticsOpen: false,
    camera: { lat: 20, lon: 30, altitudeKm: 18000, bbox: null },
    flyRequest: null,
    announcement: '',

    setTime: (ms, resolution) =>
      set((s) => {
        const now = Date.now();
        const clamped = clampToNavigable(ms, now);
        // Scrubbing to (within a minute of) the present returns to LIVE.
        const live = now - clamped < 60_000;
        return {
          timeMs: clamped,
          resolution: resolution ?? s.resolution,
          mode: live ? 'live' : 'historical',
        };
      }),
    setResolution: (resolution) => set({ resolution }),
    returnToLive: () => set({ mode: 'live', timeMs: Date.now(), resolution: 'day', tour: null }),
    selectEvent: (id) =>
      set((s) => ({
        selectedEventId: id,
        selectedCountry: id ? null : s.selectedCountry,
        sheet: id ? 'detail' : s.sheet === 'detail' && !s.selectedCountry ? 'events' : s.sheet,
      })),
    selectCountry: (c) =>
      set((s) => ({
        selectedCountry: c,
        selectedEventId: c ? null : s.selectedEventId,
        sheet: c ? 'detail' : s.sheet === 'detail' && !s.selectedEventId ? 'events' : s.sheet,
      })),
    setSheet: (sheet, expanded) =>
      set((s) => ({ sheet, sheetExpanded: expanded ?? s.sheetExpanded })),
    setSheetExpanded: (sheetExpanded) => set({ sheetExpanded }),
    setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
    setCardOpen: (cardOpen) => set({ cardOpen }),
    setLayer: (l, on) => set((s) => ({ layers: { ...s.layers, [l]: on } })),
    setKindFilter: (kindFilter, categories) =>
      set({ kindFilter, categoryFilter: categories ?? null }),
    setHighlight: (highlightIso3) => set({ highlightIso3 }),
    openTakeAction: (takeAction) => set({ takeAction }),
    setTour: (tour) => set({ tour }),
    setQuality: (quality) => {
      try {
        localStorage.setItem('worldlens.quality', quality);
      } catch {
        /* storage unavailable */
      }
      set({ quality });
    },
    setDayNight: (dayNight) => {
      saveFlag('worldlens.dayNight', dayNight);
      set({ dayNight });
    },
    setNightLights: (nightLights) => {
      saveFlag('worldlens.nightLights', nightLights);
      set({ nightLights });
    },
    setDiagnostics: (diagnosticsOpen) => set({ diagnosticsOpen }),
    setCamera: (camera) => set({ camera }),
    flyTo: (req) => set({ flyRequest: { ...req, seq: ++flySeq } }),
    announce: (announcement) => set({ announcement }),
  })),
);
