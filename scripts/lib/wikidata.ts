/** Wikidata Query Service access for the build scripts (data is CC0). */
const ENDPOINT = 'https://query.wikidata.org/sparql';
// Wikimedia's User-Agent policy asks for a contact; override with WIKIDATA_USER_AGENT.
const USER_AGENT =
  process.env.WIKIDATA_USER_AGENT ??
  'WorldLens/0.1 (https://github.com/HarveyAll123/worldlens-ai; data build)';

export type Binding = Record<string, { value: string } | undefined>;

export async function sparql(query: string): Promise<Binding[]> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: new URLSearchParams({ query }),
    });
    if (res.ok)
      return ((await res.json()) as { results: { bindings: Binding[] } }).results.bindings;
    if (attempt >= 3 || (res.status !== 429 && res.status < 500))
      throw new Error(`Wikidata HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 5_000 * (attempt + 1)));
  }
}

export const qidOf = (uri: string | undefined) =>
  uri?.replace('http://www.wikidata.org/entity/', '') ?? '';

/** SPARQL string literal. */
export const literal = (s: string, lang?: string) =>
  `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"${lang ? `@${lang}` : ''}`;
