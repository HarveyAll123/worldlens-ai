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
  type PlaceKindCode,
  type Resolution,
} from '@worldlens/shared';
import type { QualityPreference, QualityTier } from '../perf/tiers';

export type Mode = 'live' | 'historical';
export type SheetView = 'events' | 'detail' | 'assistant' | 'search' | 'layers';

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

/** A question for the assistant from outside the chat, and the event it was asked from. */
export interface PendingQuestion {
  text: string;
  about?: { eventId: string; title: string };
}

/** Events pinned to one spot, listed next to the marker that was clicked (PlacePicker). */
/** How many places stay marked at once. */
export const MAX_PLACE_MARKS = 6;

export interface PlaceMark {
  /** The place's id in the place names (its shape: placeShapeId). */
  id: string;
  name: string;
  kind: PlaceKindCode;
  lat: number;
  lon: number;
}

export interface PlacePickerState {
  ids: string[];
  /** Click position in CSS pixels from the globe's top-left corner. */
  x: number;
  y: number;
  /** Where "Zoom in" flies (absent when zooming cannot separate them). */
  zoomTo?: { lat: number; lon: number; altitudeKm: number };
}

interface AppState {
  mode: Mode;
  timeMs: number;
  resolution: Resolution;
  selectedEventId: string | null;
  selectedCountry: CountrySelection | null;
  placePicker: PlacePickerState | null;
  sheet: SheetView;
  sheetExpanded: boolean;
  assistantOpen: boolean;
  /**
   * Wide desktop screens: the chat has its own panel on the left, beside the context card, so
   * events and countries open next to it. Narrower desktops share one card between the two.
   * Set by the layout (App) from the window width.
   */
  chatDocked: boolean;
  /**
   * A question asked outside the chat (an event's "Ask AI" prompts) while the assistant panel
   * is not mounted; the panel sends it once it is shown, with the event it was asked about.
   */
  pendingQuestion: PendingQuestion | null;
  /** Desktop Context Card visibility (mobile uses the bottom sheet). */
  cardOpen: boolean;
  layers: Record<LayerId, boolean>;
  kindFilter: 'all' | 'news' | 'historical';
  categoryFilter: EventCategory[] | null;
  highlightIso3: string | null;
  /** Cities, rivers, seas, mountains or deserts marked on the globe (highlight_place), oldest first. */
  placeMarks: PlaceMark[];
  takeAction: TakeActionState | null;
  tour: TourState | null;
  quality: QualityPreference;
  /** Tier currently in effect (from the PerformanceManager). */
  qualityTier: QualityTier;
  /** Darken the side of the globe where the sun has set (off = evenly lit). */
  dayNight: boolean;
  /** City lights on the night side (only with dayNight). */
  nightLights: boolean;
  /**
   * The assistant may operate the globe (fly, zoom, highlight, set the date, open events…).
   * Off: a plain chatbot that only answers.
   */
  aiAgent: boolean;
  diagnosticsOpen: boolean;
  /** The timeline plays forward one step at a time (its Play button, Space, the assistant). */
  timelinePlaying: boolean;
  /** Playback speed: 1, 2, 4 or 8 times. */
  timelineSpeed: number;
  camera: CameraState;
  flyRequest: FlyRequest | null;
  announcement: string;

  setTime: (ms: number, resolution?: Resolution) => void;
  setResolution: (r: Resolution) => void;
  returnToLive: () => void;
  selectEvent: (id: string | null) => void;
  selectCountry: (c: CountrySelection | null) => void;
  /**
   * The user picked an event or a country (globe, list, search, a link in the chat): show it.
   * Wide screens show it in the card beside the docked chat; narrower desktops turn the shared
   * card from the chat to it (it used to stay on the chat until Ask AI was closed); phones open
   * the sheet on it. AI answers use selectEvent (tours keep the card where the user put it).
   */
  openEvent: (id: string) => void;
  openCountry: (c: CountrySelection) => void;
  setChatDocked: (v: boolean) => void;
  setPlacePicker: (p: PlacePickerState | null) => void;
  setSheet: (v: SheetView, expanded?: boolean) => void;
  /** Phones: a top-bar button opens its tab of the bottom sheet, or closes the sheet again. */
  toggleSheetTab: (v: SheetView) => void;
  setSheetExpanded: (v: boolean) => void;
  setAssistantOpen: (v: boolean) => void;
  setPendingQuestion: (q: PendingQuestion | null) => void;
  /** Returns the pending question and clears it, so it is sent once. */
  takePendingQuestion: () => PendingQuestion | null;
  setCardOpen: (v: boolean) => void;
  setLayer: (l: LayerId, on: boolean) => void;
  setKindFilter: (k: 'all' | 'news' | 'historical', categories?: EventCategory[] | null) => void;
  setHighlight: (iso3: string | null) => void;
  /** Add a mark (the same place again moves it last); at most MAX_PLACE_MARKS stay. */
  addPlaceMark: (mark: PlaceMark) => void;
  /** Remove one mark by id, or all (null). */
  clearPlaceMarks: (id: string | null) => void;
  openTakeAction: (s: TakeActionState | null) => void;
  setTour: (t: TourState | null) => void;
  setQuality: (q: QualityPreference) => void;
  setDayNight: (on: boolean) => void;
  setNightLights: (on: boolean) => void;
  setAiAgent: (on: boolean) => void;
  setDiagnostics: (open: boolean) => void;
  setTimelinePlaying: (on: boolean) => void;
  setTimelineSpeed: (speed: number) => void;
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

/** Phones: whether the bottom sheet is open on a tab (event and country details count as Events). */
export function sheetTabOpen(
  s: { sheet: SheetView; sheetExpanded: boolean },
  v: SheetView,
): boolean {
  return s.sheetExpanded && (s.sheet === v || (v === 'events' && s.sheet === 'detail'));
}

let flySeq = 0;

/** What a search led to: a result of the API's search, or a country of the borders index. */
export type SearchPick =
  | ({ type: string; title: string } & Record<string, unknown>)
  | { type: 'COUNTRY'; title: string; country: CountrySelection };

/**
 * What the user did, for an account's history: a search and the result chosen, an event or a
 * country opened (not one the timeline or the AI switched to).
 */
export type Opened =
  | { kind: 'event'; id: string }
  | { kind: 'country'; country: CountrySelection }
  | { kind: 'search'; query: string; pick: SearchPick };
const openedListeners = new Set<(o: Opened) => void>();
/** Hears what the user opens (an account's viewing history); returns the unsubscribe. */
export function onOpened(fn: (o: Opened) => void): () => void {
  openedListeners.add(fn);
  return () => openedListeners.delete(fn);
}
const opened = (o: Opened) => {
  for (const fn of openedListeners) fn(o);
};
/** A search the user made and the result they chose (SearchBox). */
export const noteSearch = (query: string, pick: SearchPick) =>
  opened({ kind: 'search', query, pick });

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set, get) => ({
    mode: 'live',
    timeMs: Date.now(),
    resolution: 'day',
    selectedEventId: null,
    selectedCountry: null,
    placePicker: null,
    sheet: 'events',
    sheetExpanded: false,
    assistantOpen: false,
    chatDocked: false,
    pendingQuestion: null,
    cardOpen: true,
    layers: {
      news: true,
      history: true,
      battles: true,
      demo: true,
      borders: false,
      territories: true,
      frontlines: true,
      labels: true,
      places: true,
    },
    kindFilter: 'all',
    categoryFilter: null,
    highlightIso3: null,
    placeMarks: [],
    takeAction: null,
    tour: null,
    quality: readQuality(),
    qualityTier: 'MEDIUM',
    dayNight: readFlag('worldlens.dayNight', true),
    nightLights: readFlag('worldlens.nightLights', true),
    aiAgent: readFlag('worldlens.aiAgent', true),
    diagnosticsOpen: false,
    timelinePlaying: false,
    timelineSpeed: 1,
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
    setPlacePicker: (placePicker) => set({ placePicker }),
    selectCountry: (c) =>
      set((s) => ({
        selectedCountry: c,
        selectedEventId: c ? null : s.selectedEventId,
        sheet: c ? 'detail' : s.sheet === 'detail' && !s.selectedEventId ? 'events' : s.sheet,
      })),
    openEvent: (id) => {
      set((s) => ({
        selectedEventId: id,
        selectedCountry: null,
        sheet: 'detail',
        sheetExpanded: true,
        assistantOpen: s.chatDocked && s.assistantOpen,
      }));
      opened({ kind: 'event', id });
    },
    openCountry: (c) => {
      set((s) => ({
        selectedCountry: c,
        selectedEventId: null,
        sheet: 'detail',
        sheetExpanded: true,
        assistantOpen: s.chatDocked && s.assistantOpen,
      }));
      opened({ kind: 'country', country: c });
    },
    setChatDocked: (chatDocked) => set({ chatDocked }),
    setSheet: (sheet, expanded) =>
      set((s) => ({ sheet, sheetExpanded: expanded ?? s.sheetExpanded })),
    // Each button has its own tab, so the panel button no longer reopens whatever tab (e.g.
    // Layers) was showing last; closing returns the sheet to the events.
    toggleSheetTab: (v) =>
      set((s) => {
        if (sheetTabOpen(s, v))
          return { sheet: s.sheet === 'detail' ? 'detail' : 'events', sheetExpanded: false };
        const detail = v === 'events' && (s.selectedEventId || s.selectedCountry);
        return { sheet: detail ? 'detail' : v, sheetExpanded: true };
      }),
    setSheetExpanded: (sheetExpanded) => set({ sheetExpanded }),
    setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
    setPendingQuestion: (pendingQuestion) => set({ pendingQuestion }),
    takePendingQuestion: () => {
      const q = get().pendingQuestion;
      if (q !== null) set({ pendingQuestion: null });
      return q;
    },
    setCardOpen: (cardOpen) => set({ cardOpen }),
    setLayer: (l, on) => set((s) => ({ layers: { ...s.layers, [l]: on } })),
    setKindFilter: (kindFilter, categories) =>
      set({ kindFilter, categoryFilter: categories ?? null }),
    setHighlight: (highlightIso3) => set({ highlightIso3 }),
    addPlaceMark: (mark) =>
      set((s) => ({
        placeMarks: [...s.placeMarks.filter((m) => m.id !== mark.id), mark].slice(-MAX_PLACE_MARKS),
      })),
    clearPlaceMarks: (id) =>
      set((s) => ({ placeMarks: id ? s.placeMarks.filter((m) => m.id !== id) : [] })),
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
    setAiAgent: (aiAgent) => {
      saveFlag('worldlens.aiAgent', aiAgent);
      set({ aiAgent });
    },
    setNightLights: (nightLights) => {
      saveFlag('worldlens.nightLights', nightLights);
      set({ nightLights });
    },
    setDiagnostics: (diagnosticsOpen) => set({ diagnosticsOpen }),
    setTimelinePlaying: (timelinePlaying) => set({ timelinePlaying }),
    setTimelineSpeed: (speed) =>
      set({ timelineSpeed: speed >= 6 ? 8 : speed >= 3 ? 4 : speed >= 2 ? 2 : 1 }),
    setCamera: (camera) => set({ camera }),
    flyTo: (req) => set({ flyRequest: { ...req, seq: ++flySeq } }),
    announce: (announcement) => set({ announcement }),
  })),
);
