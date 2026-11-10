import { describe, expect, it } from 'vitest';
import {
  buildPastEvent,
  parseCurrentEventsDay,
  parseYearEvents,
  dayOfPortalTitle,
  plainText,
  portalTitle,
  searchWords,
  WikipediaNewsProvider,
} from './wikipedia-news';

const DAY_PAGE = `{{Current events|year=2026|month=10|day=30|top=yes}}
<!-- All news items below this line -->
'''Armed conflicts and attacks'''
*[[Russo-Ukrainian war (2022–present)|Russo-Ukrainian war]]
**[[Blockade of Oleshky]]
***Civilian evacuations commence in [[Oleshky]], [[Ukraine]], as a humanitarian convoy arrives, as part of a ceasefire brokered by the [[United States]]. [https://www.reuters.com/world/x (Reuters)]
;Disasters and accidents
*[[2026 Uttarakhand helicopter crash]]
**Six people are killed when their helicopter crashes near [[Joshimath]], [[Uttarakhand]], [[India]]. [https://www.daily-sun.com/a (AFP via ''Daily Sun'')] [http://insecure.example.com/b (Old)]`;

const YEAR_PAGE = `== Births ==
* nothing
==Events==
===January===
* [[January 1]] – [[Greece]] becomes the 12th country to join the [[Eurozone]].<ref>{{Cite web |title=Greece joins euro |url=https://www.theguardian.com/world/2001/jan/01/greece |website=The Guardian}}</ref>
* [[September 11]]
** Hijacked airliners strike the [[World Trade Center]] in [[New York City]], killing thousands.<ref name="x"/>
===February===
* February 3 – short
== Deaths ==
* [[January 2]] – Someone dies.`;

describe('past news from Wikipedia', () => {
  it('reads wikitext as plain text, keeping links and sources apart', () => {
    expect(
      plainText(
        "The [[Iran]]ian [[Iranian Armed Forces|military]] says ''so''. [https://x.example.com/a (Reuters)]",
      ),
    ).toEqual({
      text: 'The Iranian military says so.',
      links: ['Iran', 'Iranian Armed Forces'],
      sources: [{ url: 'https://x.example.com/a', name: 'Reuters' }],
    });
    expect(portalTitle('2020-03-05')).toBe('Portal:Current events/2020 March 5');
    expect(dayOfPortalTitle('Portal:Current events/2011 March 14')).toBe('2011-03-14');
    expect(dayOfPortalTitle('Portal:Current events/March 2011')).toBeNull();
    // Words only for Wikipedia's search: no years (they narrow the period), no operators.
    expect(searchWords('Italy lockdown 2020')).toBe('Italy lockdown');
    expect(searchWords('insource:/x/ intitle:"y" -z Ōkuma')).toBe('insource x intitle y z Ōkuma');
  });

  it('a portal day: the news lines under their topics and section (both heading styles)', () => {
    const items = parseCurrentEventsDay(DAY_PAGE, '2026-10-30');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      heading: 'Armed conflicts and attacks',
      topics: ['Russo-Ukrainian war', 'Blockade of Oleshky'],
      sources: [{ url: 'https://www.reuters.com/world/x', name: 'Reuters' }],
    });
    expect(items[1]!.heading).toBe('Disasters and accidents');
  });

  it('a year article: dated events, nested ones under their date, only in Events', () => {
    const items = parseYearEvents(YEAR_PAGE, 2001);
    expect(items.map((i) => [i.date, i.text.slice(0, 20)])).toEqual([
      ['2001-01-01', 'Greece becomes the 1'],
      ['2001-09-11', 'Hijacked airliners s'],
    ]);
    expect(items[0]!.sources[0]).toEqual({
      url: 'https://www.theguardian.com/world/2001/jan/01/greece',
      name: 'The Guardian',
    });
  });

  it('builds news events placed where the sentence is about, with https sources only', () => {
    const [oleshky, crash] = parseCurrentEventsDay(DAY_PAGE, '2026-10-30').map((i) =>
      buildPastEvent(i, Date.parse('2026-11-10T00:00:00Z')),
    );
    expect(oleshky!.event).toMatchObject({
      kind: 'news',
      category: 'conflict',
      time: { start: '2026-10-30T00:00:00Z', precision: 'day' },
      provenance: { provider: 'wikipedia' },
    });
    expect(oleshky!.event.location.name).toBe('Ukraine');
    expect(oleshky!.event.id).toMatch(/^wnews-2026-10-30-[0-9a-f]{12}$/);
    expect(crash!.event.category).toBe('disaster');
    expect(crash!.articles.map((a) => a.url)).toEqual(['https://www.daily-sun.com/a']);
    const [nine] = parseYearEvents(YEAR_PAGE, 2001)
      .slice(1)
      .map((i) => buildPastEvent(i, 0));
    expect(nine!.event.importance).toBe(4);
    expect(nine!.event.location.name).toMatch(/New York/);
  });

  it('loads a month of days in one request, and finds an event again by its id', async () => {
    const requested: string[] = [];
    const fetchImpl = (async (url: string | Request) => {
      const u = new URL(typeof url === 'string' ? url : url.url);
      const titles = u.searchParams.get('titles')!.split('|');
      requested.push(...titles);
      const pages = titles.map((title) =>
        title === 'Portal:Current events/2026 October 30'
          ? { title, revisions: [{ slots: { main: { content: DAY_PAGE } } }] }
          : { title, missing: true },
      );
      return new Response(JSON.stringify({ query: { pages } }), { status: 200 });
    }) as typeof fetch;
    const provider = new WikipediaNewsProvider('test', fetchImpl, () =>
      Date.parse('2026-11-10T00:00:00Z'),
    );
    const month = await provider.eventsIn(
      { startMs: Date.parse('2026-10-01T00:00:00Z'), endMs: Date.parse('2026-11-01T00:00:00Z') },
      Date.parse('2026-11-07T00:00:00Z'),
    );
    expect(month.map((e) => e.event.location.name).sort()).toEqual(
      expect.arrayContaining(['Ukraine']),
    );
    expect(requested.filter((t) => t.startsWith('Portal:'))).toHaveLength(31);
    const again = await provider.find(month[0]!.event.id);
    expect(again?.event.id).toBe(month[0]!.event.id);
    // Before 2000 it is history, not news: nothing is fetched.
    const before = requested.length;
    expect(
      await provider.eventsIn(
        { startMs: Date.UTC(1999, 0, 1), endMs: Date.UTC(1999, 11, 31) },
        Date.now(),
      ),
    ).toEqual([]);
    expect(requested.length).toBe(before);
  });
});
