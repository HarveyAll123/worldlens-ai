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
