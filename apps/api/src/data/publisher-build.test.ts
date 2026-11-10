import { describe, expect, it } from 'vitest';
import { decodePublisherEntry } from '@worldlens/shared';
import {
  entryOf,
  hostOf,
  outletsByDomain,
  type Outlet,
} from '../../../../scripts/build-publishers';

const outlet = (o: Partial<Outlet> & { qid: string }): Outlet => ({
  name: null,
  links: 0,
  formats: new Set(),
  sites: new Set(),
  country: null,
  hq: null,
  owners: new Set(),
  ratings: new Map(),
  other: 0,
  ...o,
});

describe('building the publisher directory (scripts/build-publishers.ts)', () => {
  it('reads an outlet’s domain from its website', () => {
    expect(hostOf('https://www.theguardian.com/international')).toBe('theguardian.com');
    expect(hostOf('http://m.example.co.uk/')).toBe('example.co.uk');
    expect(hostOf('not a url')).toBeNull();
  });

  it('a media group’s site goes to the outlet listing its root; platforms go to nobody', () => {
    // The Observer lists a page of the Guardian's site; the group's own item lists the root too
    // but is less known; dozens of BBC outlets list pages of bbc.co.uk.
    const guardian = outlet({
      qid: 'Q11148',
      links: 111,
      sites: new Set(['https://www.theguardian.com']),
    });
    const observer = outlet({
      qid: 'Q1',
      links: 140,
      sites: new Set(['https://www.theguardian.com/observer']),
    });
    const group = outlet({
      qid: 'Q2',
      links: 20,
      sites: new Set(['https://www.theguardian.com/']),
    });
    const bbc = outlet({ qid: 'Q9531', links: 300, sites: new Set(['https://www.bbc.co.uk/']) });
    const stations = Array.from({ length: 40 }, (_, i) =>
      outlet({
        qid: `Q${500 + i}`,
        links: 20,
        sites: new Set([`https://www.bbc.co.uk/radio${i}`]),
      }),
    );
    const onFacebook = outlet({ qid: 'Q3', links: 5, sites: new Set(['https://facebook.com/x']) });
    const directory = Array.from({ length: 30 }, (_, i) =>
      outlet({
        qid: `Q${100 + i}`,
        links: i,
        sites: new Set(['https://radio-directory.example/x']),
      }),
    );
    const map = outletsByDomain([
      guardian,
      observer,
      group,
      bbc,
      ...stations,
      onFacebook,
      ...directory,
    ]);
    expect(map.get('theguardian.com')?.qid).toBe('Q11148');
    expect(map.get('bbc.co.uk')?.qid).toBe('Q9531');
    // Among outlets listing a site's root, the one named like it ("Xinhuanet" on xinhuanet.com).
    const xinhuanet = outlet({
      qid: 'Q10',
      name: 'Xinhuanet',
      links: 3,
      sites: new Set(['http://www.xinhuanet.com/']),
    });
    const channel = outlet({
      qid: 'Q11',
      name: 'CNC World',
      links: 7,
      sites: new Set(['http://www.xinhuanet.com/']),
    });
    expect(outletsByDomain([channel, xinhuanet]).get('xinhuanet.com')?.qid).toBe('Q10');
    expect(outletsByDomain([xinhuanet, channel]).get('xinhuanet.com')?.qid).toBe('Q10');
    expect(map.has('facebook.com')).toBe(false);
    expect(map.has('radio-directory.example')).toBe(false);
  });

  it('the entry: headquarters first; a rating only when the statements agree', () => {
    const agreed = outlet({
      qid: 'Q216393',
      name: 'Haaretz',
      formats: new Set(['d', 'n']),
      country: 'ISR',
      hq: null,
      owners: new Set(['DuMont Media Group']),
      ratings: new Map([['LEFT', { words: 'left-wing', referenced: true }]]),
    });
    expect(decodePublisherEntry(entryOf(agreed, 'USA'))).toMatchObject({
      country: 'ISR',
      name: 'Haaretz',
      format: 'd',
      owner: 'DuMont Media Group',
      wikidata: 'Q216393',
      rating: { value: 'LEFT', words: 'left-wing', referenced: true },
      basis: 'wikidata',
    });
    const torn = outlet({
      qid: 'Q39681',
      name: 'USA Today',
      country: 'USA',
      ratings: new Map([
        ['CENTER-LEFT', { words: 'centre-left', referenced: false }],
        ['CENTER', { words: 'centrism', referenced: false }],
      ]),
    });
    expect(decodePublisherEntry(entryOf(torn, null)).rating).toBeNull();
    // Headquarters over the outlet's country; GDELT's country only when Wikidata has neither.
    const london = outlet({ qid: 'Q724844', country: 'SAU', hq: 'GBR' });
    expect(decodePublisherEntry(entryOf(london, 'SYR')).country).toBe('GBR');
    expect(decodePublisherEntry(entryOf(outlet({ qid: 'Q9' }), 'SYR')).country).toBe('SYR');
  });
});
