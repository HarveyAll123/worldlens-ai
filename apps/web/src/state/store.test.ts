import { beforeEach, describe, expect, it } from 'vitest';
import { sheetTabOpen, useAppStore } from './store';

const sheet = () => {
  const s = useAppStore.getState();
  return { view: s.sheet, open: s.sheetExpanded };
};

describe('phone top-bar buttons and the bottom sheet', () => {
  beforeEach(() =>
    useAppStore.setState({
      sheet: 'events',
      sheetExpanded: false,
      selectedEventId: null,
      selectedCountry: null,
    }),
  );

  it('opens the tab of the button that was tapped', () => {
    const { toggleSheetTab } = useAppStore.getState();
    toggleSheetTab('layers');
    expect(sheet()).toEqual({ view: 'layers', open: true });
    // The events (panel) button used to reopen whatever tab was showing last: Layers.
    toggleSheetTab('events');
    expect(sheet()).toEqual({ view: 'events', open: true });
    toggleSheetTab('search');
    expect(sheet()).toEqual({ view: 'search', open: true });
  });

  it('closes the sheet when the open tab is tapped again, back to the events', () => {
    const { toggleSheetTab } = useAppStore.getState();
    toggleSheetTab('layers');
    toggleSheetTab('layers');
    expect(sheet()).toEqual({ view: 'events', open: false });
    toggleSheetTab('events');
    expect(sheet()).toEqual({ view: 'events', open: true });
    toggleSheetTab('events');
    expect(sheet()).toEqual({ view: 'events', open: false });
  });

  it('treats an open event as the Events tab', () => {
    useAppStore.getState().selectEvent('hist-battle-of-waterloo');
    const { toggleSheetTab } = useAppStore.getState();
    toggleSheetTab('events');
    expect(sheet()).toEqual({ view: 'detail', open: true });
    expect(sheetTabOpen(useAppStore.getState(), 'events')).toBe(true);
    toggleSheetTab('events');
    expect(sheet()).toEqual({ view: 'detail', open: false });
  });
});

describe('opening an event or a country the user picked', () => {
  const weimar = {
    name: 'Weimar Republic',
    start: '1918-11-09',
    end: '1933-03-23',
    wikidata: 'Q41304',
    label: [10, 51] as [number, number],
    bbox: [5.9, 47.3, 22.9, 55.1] as [number, number, number, number],
    ways: [1],
  };
  beforeEach(() =>
    useAppStore.setState({
      sheet: 'assistant',
      sheetExpanded: false,
      selectedEventId: null,
      selectedCountry: null,
      assistantOpen: true,
      chatDocked: false,
    }),
  );

  it('turns the shared card from the chat to it (it used to stay on the chat)', () => {
    useAppStore.getState().openEvent('hist-battle-of-waterloo');
    expect(useAppStore.getState().selectedEventId).toBe('hist-battle-of-waterloo');
    expect(useAppStore.getState().assistantOpen).toBe(false);
    // Phones: the sheet opens on it.
    expect(sheet()).toEqual({ view: 'detail', open: true });

    useAppStore.setState({ assistantOpen: true, sheet: 'assistant' });
    useAppStore.getState().openCountry(weimar);
    expect(useAppStore.getState().selectedCountry).toEqual(weimar);
    expect(useAppStore.getState().selectedEventId).toBeNull();
    expect(useAppStore.getState().assistantOpen).toBe(false);
    expect(sheet()).toEqual({ view: 'detail', open: true });
  });

  it('keeps the docked chat open beside the card on wide screens', () => {
    useAppStore.setState({ chatDocked: true });
    useAppStore.getState().openCountry(weimar);
    expect(useAppStore.getState().assistantOpen).toBe(true);
    useAppStore.getState().openEvent('hist-battle-of-waterloo');
    expect(useAppStore.getState().selectedCountry).toBeNull();
    expect(useAppStore.getState().assistantOpen).toBe(true);
    // A closed chat stays closed.
    useAppStore.setState({ assistantOpen: false });
    useAppStore.getState().openEvent('hist-anschluss');
    expect(useAppStore.getState().assistantOpen).toBe(false);
  });
});
