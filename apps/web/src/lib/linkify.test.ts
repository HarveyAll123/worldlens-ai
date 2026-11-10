import { describe, expect, it } from 'vitest';
import { cleanLink, linkify } from './linkify';

describe('links in chat text', () => {
  it('makes full and bare addresses clickable, shown clean, punctuation left out', () => {
    expect(
      linkify(
        'The founder, Hasan (portfolio: https://hasan-portfolio.com/), built it with Evan (https://website-portofolio-green-one.vercel.app) and Nabil (mnh-studio.vercel.app). Try debate-lens.com.',
      ),
    ).toEqual([
      'The founder, Hasan (portfolio: ',
      { href: 'https://hasan-portfolio.com/', label: 'hasan-portfolio.com' },
      '), built it with Evan (',
      {
        href: 'https://website-portofolio-green-one.vercel.app/',
        label: 'website-portofolio-green-one.vercel.app',
      },
      ') and Nabil (',
      { href: 'https://mnh-studio.vercel.app/', label: 'mnh-studio.vercel.app' },
      '). Try ',
      { href: 'https://debate-lens.com/', label: 'debate-lens.com' },
      '.',
    ]);
  });

  it('keeps markdown labels, and shortens long addresses', () => {
    expect(
      linkify('See [the Wikipedia article](https://en.wikipedia.org/wiki/Battle_of_Waterloo).'),
    ).toEqual([
      'See ',
      { href: 'https://en.wikipedia.org/wiki/Battle_of_Waterloo', label: 'the Wikipedia article' },
      '.',
    ]);
    expect(cleanLink('https://www.example.com/a/b/')).toBe('example.com/a/b');
    expect(
      cleanLink(
        'https://www.reuters.com/world/asia-pacific/a-very-long-article-slug-about-the-strait-2026-11-09/',
      ),
    ).toBe('reuters.com/…/a-very-long-article-slu…');
  });

  it('leaves plain words, emails and unsafe addresses as text', () => {
    expect(linkify('e.g. the U.S. and 1.5 km away')).toEqual(['e.g. the U.S. and 1.5 km away']);
    expect(linkify('Write to hasan@example.com')).toEqual(['Write to hasan@example.com']);
    expect(linkify('Old site http://example.com here')).toEqual([
      'Old site http://example.com here',
    ]);
    expect(linkify('[click](javascript:alert(1))')).toEqual(['[click](javascript:alert(1))']);
  });
});
