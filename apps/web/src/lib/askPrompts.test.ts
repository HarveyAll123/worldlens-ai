import { describe, expect, it } from 'vitest';
import type { EventSummary } from '@worldlens/shared';
import {
  COVERAGE_PROMPT,
  HELP_PROMPT,
  eventPrompts,
  placeName,
  starterPrompts,
  theName,
} from './askPrompts';

const ev = (o: Partial<EventSummary> & Pick<EventSummary, 'title'>): EventSummary => ({
  id: o.title.toLowerCase().replace(/\W+/g, '-'),
  kind: 'news',
  isDemo: false,
  category: 'other',
  time: { start: '2026-11-09T10:00:00Z', precision: 'hour', approximate: false },
  location: { name: 'Germany', lat: 51, lon: 10, precision: 'country', confidence: 1 },
  importance: 3,
  confidence: 1,
  articleCount: 1,
  sourceCount: 1,
  hasTakeAction: false,
  ...o,
});

describe('event prompts', () => {
  it('always gives exactly three, fitted to the event', () => {
    const protest = eventPrompts(
      ev({
        title: 'French protest violence eases',
        category: 'protest',
        sourceCount: 40,
        location: { name: 'Paris, France', lat: 48.9, lon: 2.35, precision: 'city', confidence: 1 },
      }),
    );
    expect(protest).toEqual([
      'Why are people protesting in Paris?',
      'Has Paris seen protests like this before?',
      COVERAGE_PROMPT,
    ]);
    const quake = eventPrompts(
      ev({
        title: 'M6.0 earthquake strikes near Port-Olry',
        category: 'disaster',
        location: { name: 'Vanuatu', lat: -15, lon: 167, precision: 'country', confidence: 1 },
      }),
    );
    expect(quake).toHaveLength(3);
    expect(quake[1]).toBe('Has Vanuatu faced an earthquake like this before?');
  });

  it('compares sources only when there are several, and offers help when it can', () => {
    const drills = ev({
      title: 'DEMO: Large-scale naval and air drills reported around the Taiwan Strait',
      category: 'military',
      isDemo: true,
      sourceCount: 6,
      location: { name: 'Taiwan Strait', lat: 24, lon: 119.5, precision: 'region', confidence: 1 },
    });
    expect(eventPrompts(drills)).toEqual([
      'What led to this in the Taiwan Strait?',
      'Who is involved, and what does each side say?',
      COVERAGE_PROMPT,
    ]);
    expect(eventPrompts({ ...drills, sourceCount: 1 })).not.toContain(COVERAGE_PROMPT);
    const relief = eventPrompts({ ...drills, category: 'disaster', hasTakeAction: true });
    expect(relief).toHaveLength(3);
    expect(relief[2]).toBe(HELP_PROMPT);
  });

  it('names historical events where English allows it', () => {
    const battle = ev({ title: 'Battle of Berlin', kind: 'historical', category: 'conflict' });
    expect(eventPrompts({ ...battle, conflictId: 'conflict-ww2' })).toEqual([
      'What led to the Battle of Berlin?',
      'How did it change the course of the war?',
      'Show me the borders before and after',
    ]);
    const treaty = ev({
      title: 'Berlin Declaration — Allied authority over Germany',
      kind: 'historical',
      category: 'politics',
    });
    expect(eventPrompts(treaty)[0]).toBe('What did the Berlin Declaration change?');
    const op = ev({ title: 'Operation Barbarossa', kind: 'historical', category: 'military' });
    expect(eventPrompts(op)[0]).toBe('What led to this?');
  });

  it('helps phrase places and names', () => {
    expect(
      placeName(
        ev({
          title: 'x',
          location: {
            name: 'United States of America',
            lat: 0,
            lon: 0,
            precision: 'country',
            confidence: 1,
          },
        }),
      ),
    ).toBe('the United States of America');
    expect(theName('Charter of the United Nations signed')).toBe(
      'the Charter of the United Nations',
    );
    expect(theName('Second Battle of Sirte')).toBe('the Second Battle of Sirte');
    expect(theName('German Instrument of Surrender')).toBeNull();
  });
});

describe('starter prompts', () => {
  const now = Date.parse('2026-11-09T13:00:00Z');
  const all = (groups: ReturnType<typeof starterPrompts>) => groups.flatMap((g) => g.prompts);

  it('LIVE: up to three trending stories (real before DEMO, most covered first), six in all', () => {
    const groups = starterPrompts({
      mode: 'live',
      timeMs: now,
      resolution: 'day',
      nowMs: now,
      events: [
        ev({
          title: 'DEMO: drills',
          isDemo: true,
          sourceCount: 99,
          category: 'military',
          location: {
            name: 'Taiwan Strait',
            lat: 24,
            lon: 119,
            precision: 'region',
            confidence: 1,
          },
        }),
        ev({ title: 'Protests in Germany', category: 'protest', sourceCount: 40 }),
        ev({
          title: 'Iran warns US',
          category: 'conflict',
          sourceCount: 12,
          location: { name: 'Iran', lat: 32, lon: 54, precision: 'country', confidence: 1 },
        }),
        ev({ title: 'Germany again', category: 'politics', sourceCount: 30 }),
        ev({
          title: 'Floods hit Selangor',
          category: 'disaster',
          sourceCount: 3,
          hasTakeAction: true,
          location: {
            name: 'Selangor, Malaysia',
            lat: 3,
            lon: 101,
            precision: 'region',
            confidence: 1,
          },
        }),
      ],
    });
    expect(groups[0]).toEqual({
      label: 'Trending now',
      prompts: [
        'Why are people protesting in Germany?',
        "What's happening in Iran?",
        'How bad is the flooding in Selangor?',
      ],
    });
    expect(all(groups)).toHaveLength(6);
    expect(all(groups)).toContain('What happened on 9 November in history?');
    expect(all(groups)).toContain(HELP_PROMPT);
  });

  it('history: the period’s key events and questions about that period', () => {
    const groups = starterPrompts({
      mode: 'historical',
      timeMs: Date.parse('1945-01-01T00:00:00Z'),
      resolution: 'year',
      nowMs: now,
      events: [
        ev({ title: 'Battle of Berlin', kind: 'historical', category: 'conflict', importance: 5 }),
        ev({
          title: 'German Instrument of Surrender',
          kind: 'historical',
          category: 'politics',
          importance: 5,
        }),
        ev({
          title: 'Atomic bombings of Hiroshima and Nagasaki — the first use in war',
          kind: 'historical',
          category: 'military',
          importance: 4,
        }),
      ],
    });
    expect(groups[0]!.label).toBe('Key events in 1945');
    expect(groups[0]!.prompts).toEqual([
      'Tell me about the Battle of Berlin',
      'Tell me about “German Instrument of Surrender”',
      'Tell me about “Atomic bombings of Hiroshima and Nagasaki”',
    ]);
    expect(all(groups)).toEqual(
      expect.arrayContaining([
        'What was happening in the world in 1945?',
        'Show me how the borders looked in 1945',
        'Take me through 1945 step by step',
      ]),
    );
    expect(all(groups)).toHaveLength(6);
    const decade = starterPrompts({
      mode: 'historical',
      timeMs: Date.parse('1940-01-01T00:00:00Z'),
      resolution: 'decade',
      nowMs: now,
      events: [],
    });
    expect(all(decade)).toContain('What was happening in the world in the 1940s?');
    const day = starterPrompts({
      mode: 'historical',
      timeMs: Date.parse('1941-06-22T00:00:00Z'),
      resolution: 'day',
      nowMs: now,
      events: [],
    });
    expect(all(day)).toContain('What was happening in the world on 22 Jun 1941?');
  });

  it('still offers six when nothing is in view', () => {
    const groups = starterPrompts({
      mode: 'live',
      timeMs: now,
      resolution: 'day',
      nowMs: now,
      events: [],
    });
    expect(all(groups)).toHaveLength(6);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe('Try asking');
  });
});
