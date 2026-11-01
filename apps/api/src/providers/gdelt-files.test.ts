import { describe, expect, it } from 'vitest';
import { DEFAULT_GDELT_QUERIES } from '../env';
import { unzipFirst } from '../lib/unzip';
import { GdeltFilesProvider, headlinePattern, parseGkg, placesInHeadline } from './gdelt-files';

/** A one-file ZIP archive (CRC left 0 — the reader does not check it). */
async function zipOf(text: string, deflate = true): Promise<Uint8Array> {
  const raw = new TextEncoder().encode(text);
  const data = deflate
    ? new Uint8Array(
        await new Response(
          new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw')),
        ).arrayBuffer(),
      )
    : raw;
  const name = new TextEncoder().encode('x.csv');
  const local = new DataView(new ArrayBuffer(30));
  local.setUint32(0, 0x04034b50, true);
  local.setUint16(8, deflate ? 8 : 0, true);
  local.setUint32(18, data.length, true);
  local.setUint32(22, raw.length, true);
  local.setUint16(26, name.length, true);
  const central = new DataView(new ArrayBuffer(46));
  central.setUint32(0, 0x02014b50, true);
  central.setUint16(10, deflate ? 8 : 0, true);
  central.setUint32(20, data.length, true);
  central.setUint32(24, raw.length, true);
  central.setUint16(28, name.length, true);
  central.setUint32(42, 0, true);
  const centralAt = 30 + name.length + data.length;
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, 1, true);
  eocd.setUint16(10, 1, true);
  eocd.setUint32(12, 46 + name.length, true);
  eocd.setUint32(16, centralAt, true);
  const parts = [
    new Uint8Array(local.buffer),
    name,
    data,
    new Uint8Array(central.buffer),
    name,
    new Uint8Array(eocd.buffer),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** One GKG 2.1 line with the columns the provider reads. */
function gkgLine(o: { date: string; url: string; title: string; places?: string; image?: string }) {
  const c = Array<string>(27).fill('');
  c[1] = o.date;
  c[2] = '1';
  c[3] = new URL(o.url).hostname;
  c[4] = o.url;
  c[10] = o.places ?? '';
  c[18] = o.image ?? '';
  c[26] = `<PAGE_TITLE>${o.title}</PAGE_TITLE>`;
  return c.join('\t');
}

describe('unzipFirst', () => {
  it('reads deflated and stored entries', async () => {
    const text = 'a\tb\nc\td\n'.repeat(50);
    expect(new TextDecoder().decode(await unzipFirst(await zipOf(text)))).toBe(text);
    expect(new TextDecoder().decode(await unzipFirst(await zipOf(text, false)))).toBe(text);
  });
});

describe('GDELT GKG files', () => {
  const match = headlinePattern(DEFAULT_GDELT_QUERIES)!;

  it('turns the configured queries into headline terms', () => {
    expect(match.test('Floods hit Kerala')).toBe(true);
    expect(match.test('China coast guard patrols east of Taiwan')).toBe(true);
    expect(match.test('Bulgarians vote in presidential runoff election')).toBe(true);
    expect(match.test('Taylor Swift tops the charts again')).toBe(false);
    expect(match.test('sourcelang:english')).toBe(false); // operators are not terms
  });

  it('keeps matching web articles in the DOC API shape, titles decoded', () => {
    const text = [
      gkgLine({
        date: '20261101134500',
        url: 'https://example.com/a',
        title: 'Troops &amp; tanks: ceasefire talks',
        image: 'https://example.com/a.jpg',
      }),
      gkgLine({ date: '20261101134500', url: 'https://example.com/b', title: 'Cooking tips' }),
      gkgLine({ date: '20261101134500', url: 'https://example.com/a', title: 'Troops again' }),
    ].join('\n');
    expect(parseGkg(text, match)).toEqual([
      {
        url: 'https://example.com/a',
        title: 'Troops & tanks: ceasefire talks',
        seendate: '20261101T134500Z',
        socialimage: 'https://example.com/a.jpg',
        domain: 'example.com',
        language: 'English',
        sourcecountry: null,
      },
    ]);
  });

  it('keeps the places the headline names, not the country inside a longer name', () => {
    const places = [
      '2#New Mexico, United States#US#USNM##34.8375#-106.237#NM#120',
      '1#Mexico#MX#MX##23#-102#MX#130',
      '3#Albuquerque, New Mexico, United States#US#USNM#NM001#35.08#-106.65#1#900',
    ].join(';');
    expect(placesInHeadline(places, 'Competitive New Mexico House races')).toEqual([
      { name: 'New Mexico, United States', lat: 34.8375, lon: -106.237, precision: 'region' },
    ]);
  });

  it('drops a town GDELT placed in another province than the headline names', () => {
    const places = [
      '4#Turbat, Punjab, Pakistan#PK#PK04##30.5372#73.8128#-1#80',
      '5#Balochistan, Balochistan, Pakistan#PK#PK02##28.4785#65.6436#PK02#0',
    ].join(';');
    expect(
      placesInHeadline(places, "Balochistan's worsening security: students protest in Turbat"),
    ).toEqual([
      {
        name: 'Balochistan, Balochistan, Pakistan',
        lat: 28.4785,
        lon: 65.6436,
        precision: 'region',
      },
    ]);
    const texas = [
      '3#El Paso, Texas, United States#US#USTX#TX141#31.76#-106.49#1#10',
      '2#Texas, United States#US#USTX##31.106#-97.6475#TX#20',
    ].join(';');
    expect(placesInHeadline(texas, 'Flash floods in El Paso, Texas').map((p) => p.name)).toEqual([
      'El Paso, Texas, United States',
      'Texas, United States',
    ]);
  });

  it('downloads only new 15-minute files on each run and keeps a rolling window', async () => {
    const requested: string[] = [];
    let latest = '20261101134500';
    const zips = new Map<string, Uint8Array>();
    for (const stamp of ['20261101133000', '20261101134500', '20261101140000'])
      zips.set(
        stamp,
        await zipOf(
          gkgLine({ date: stamp, url: `https://x.org/${stamp}`, title: `Flood ${stamp}` }),
        ),
      );
    const fetchImpl = async (input: string | Request) => {
      const url = typeof input === 'string' ? input : input.url;
      requested.push(url.split('/').pop()!);
      if (url.endsWith('lastupdate.txt'))
        return new Response(`1 x http://data.gdeltproject.org/gdeltv2/${latest}.gkg.csv.zip\n`);
      const zip = zips.get(url.split('/').pop()!.slice(0, 14));
      return zip ? new Response(zip) : new Response('', { status: 404 });
    };
    const provider = new GdeltFilesProvider(fetchImpl, { windowHours: 1, maxNewFilesPerRun: 2 });

    const first = await provider.fetchLatest(DEFAULT_GDELT_QUERIES);
    expect(first.map((a) => a.title)).toEqual(['Flood 20261101134500', 'Flood 20261101133000']);

    latest = '20261101140000';
    requested.length = 0;
    const second = await provider.fetchLatest(DEFAULT_GDELT_QUERIES);
    // The new slot and one older (missing) slot; the two already read are not downloaded again.
    expect(requested).toEqual([
      'lastupdate.txt',
      '20261101140000.gkg.csv.zip',
      '20261101131500.gkg.csv.zip',
    ]);
    expect(second.map((a) => a.title)).toEqual([
      'Flood 20261101140000',
      'Flood 20261101134500',
      'Flood 20261101133000',
    ]);
  });
});
