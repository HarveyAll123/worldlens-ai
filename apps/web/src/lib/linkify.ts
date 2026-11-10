/**
 * Links in chat text: "https://hasan-portfolio.com/", "debate-lens.com" and markdown
 * "[label](https://…)" become clickable, shown clean ("hasan-portfolio.com"). Only https
 * addresses link (safeExternalUrl); anything else stays text. Emails are never links.
 */
import { safeExternalUrl } from './format';

export type TextPart = string | { href: string; label: string };

/** Domain endings a bare address must have to count as one ("e.g." and "U.S." do not). */
const TLDS =
  'com|org|net|io|app|dev|ai|co|gov|edu|info|me|tv|news|uk|id|my|sg|au|ca|de|fr|eu|int|un';
const LINK = new RegExp(
  [
    // [label](https://…)
    String.raw`\[([^\]\n]{1,120})\]\((https?:\/\/[^\s)]+)\)`,
    // https://…
    String.raw`(https?:\/\/[^\s<>"'\]]+)`,
    // bare domain, optionally with a path: debate-lens.com, mnh-studio.vercel.app/work
    String.raw`(?<![@\w.\/-])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:${TLDS})(?:\/[^\s<>"'\]]*)?)(?![\w@-])`,
  ].join('|'),
  'gi',
);

/** Sentence punctuation after an address is not part of it; ")" only when unbalanced. */
function trimTail(url: string): string {
  let u = url;
  for (;;) {
    const last = u.at(-1);
    if (last && '.,;:!?\'"'.includes(last)) u = u.slice(0, -1);
    else if (last === ')' && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0))
      u = u.slice(0, -1);
    else return u;
  }
}

/** "https://www.example.com/a/b/" → "example.com/a/b"; long paths are shortened. */
export function cleanLink(href: string): string {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./, '');
    let path = decodeURIComponent(u.pathname).replace(/\/+$/, '');
    if (u.search) path += '?…';
    const label = `${host}${path}`;
    if (label.length <= 48) return label;
    const tail = path.split('/').filter(Boolean).at(-1) ?? '';
    return `${host}/…/${tail.length > 24 ? `${tail.slice(0, 23)}…` : tail}`;
  } catch {
    return href;
  }
}

export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  const push = (s: string) => {
    if (!s) return;
    const prev = parts.at(-1);
    if (typeof prev === 'string') parts[parts.length - 1] = prev + s;
    else parts.push(s);
  };
  for (const m of text.matchAll(LINK)) {
    const start = m.index!;
    // A markdown link keeps its label; a bare address is shown clean.
    const markdown = !!(m[1] && m[2]);
    const raw = markdown ? m[0] : trimTail(m[0]);
    const href = markdown ? safeExternalUrl(m[2]) : safeExternalUrl(m[3] ? raw : `https://${raw}`);
    const label = markdown ? m[1]!.trim() : href ? cleanLink(href) : null;
    push(text.slice(at, start));
    if (href && label) parts.push({ href, label });
    else push(raw);
    at = start + raw.length;
  }
  push(text.slice(at));
  return parts;
}
