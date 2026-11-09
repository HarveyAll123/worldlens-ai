import { describe, expect, it } from 'vitest';
import { placesInHeadline } from '../providers/gdelt-files';
import { stripOutletSuffix } from './headline';

describe('outlet names at the end of headlines', () => {
  it('drops the outlet when it names the website or reads like a news brand', () => {
    expect(
      stripOutletSuffix(
        'Houthi rebels say at least 44 killed in airstrike near Yemeni capital – Winnipeg Free Press',
        'www.winnipegfreepress.com',
      ),
    ).toBe('Houthi rebels say at least 44 killed in airstrike near Yemeni capital');
    expect(
      stripOutletSuffix('Floods hit Selangor, thousands evacuated | Reuters', 'reuters.com'),
    ).toBe('Floods hit Selangor, thousands evacuated');
    expect(
      stripOutletSuffix('Election results in Bulgaria - The Sofia Globe', 'sofiaglobe.com'),
    ).toBe('Election results in Bulgaria');
  });

  it('keeps headlines whose last part is part of the story', () => {
    const live = 'Russia strikes Kyiv overnight - live updates from Ukraine';
    expect(stripOutletSuffix(live, 'example.com')).toBe(live);
    expect(stripOutletSuffix('Spain - Portugal border reopens', 'example.com')).toBe(
      'Spain - Portugal border reopens',
    );
  });
});

describe('countries named by their adjective', () => {
  it('matches "Yemeni" to Yemen and "Israeli" to Israel, not short names inside words', () => {
    const field = [
      '1#Yemen#YM#YM##15.5#47.5#YM#40',
      '1#Israel#IS#IS##31.5#34.75#IS#10',
      '1#Oman#MU#MU##21#57#MU#90',
    ].join(';');
    const names = placesInHeadline(
      field,
      'Israeli airstrike near Yemeni capital kills 44; women protest',
    ).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['Yemen', 'Israel']));
    expect(names).not.toContain('Oman'); // "women" does not start with "oman"
  });
});
