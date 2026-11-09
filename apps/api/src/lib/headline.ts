/**
 * Page titles often end with the outlet's name: "Houthi rebels say … – Winnipeg Free Press".
 * Left in, the outlet becomes part of the story — its city can even win the location vote
 * (a Yemen airstrike placed in Winnipeg). The last " – " / " - " / " | " part is dropped when it
 * names the article's website or reads like a news brand; anything else ("Kyiv - live
 * updates" is kept unless it looks like an outlet) stays.
 */
const SEPARATOR = /\s+(?:[|–—]|-)\s+(?!.*\s(?:[|–—]|-)\s)/;
const BRAND =
  /\b(news|times|post|press|herald|tribune|journal|gazette|daily|telegraph|guardian|independent|observer|express|mirror|standard|chronicle|courier|star|sun|record|review|today|reuters|ap|afp|bbc|cnn|fox|npr|abc|cbs|nbc|bloomberg|al jazeera|tv|radio|online|wire|dispatch|bulletin|examiner|inquirer|sentinel|register|enquirer|week|weekly|magazine|report)\b|\.(com|net|org|co|in|uk|au|ca)\b/i;

const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The website's own name: "www.winnipegfreepress.com" → "winnipegfreepress". */
function siteName(domain: string): string {
  const host = domain.toLowerCase().replace(/^www\d?\./, '');
  const parts = host.split('.');
  return letters(parts.length > 1 ? parts.slice(0, -1).join('') : host);
}

export function stripOutletSuffix(headline: string, domain = ''): string {
  const m = SEPARATOR.exec(headline);
  if (!m || m.index < 12) return headline; // keep short titles and leading labels whole
  const tail = headline.slice(m.index + m[0].length).trim();
  if (!tail || tail.split(/\s+/).length > 6) return headline;
  const site = siteName(domain);
  const t = letters(tail);
  const namesSite = !!site && t.length >= 3 && (site.includes(t) || t.includes(site));
  return namesSite || BRAND.test(tail) ? headline.slice(0, m.index).trim() : headline;
}
