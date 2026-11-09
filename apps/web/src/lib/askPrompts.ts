/**
 * Shortcut prompts for the assistant that fit what the user is looking at.
 *  - eventPrompts: exactly three on an event card, by the event's kind and category, naming it
 *    where that reads naturally ("What led to the Battle of Berlin?").
 *  - starterPrompts: exactly six when a chat starts — up to three "trending" ones from the
 *    biggest stories in view (LIVE) or the most important events of the selected period, then
 *    ones about that period or general ones.
 * Pure functions; the components only render them.
 */
import { formatAt, type EventSummary, type Resolution } from '@worldlens/shared';

export const EVENT_PROMPT_COUNT = 3;
export const STARTER_PROMPT_COUNT = 6;
export const HELP_PROMPT = 'I have $20. How can I help?';
export const COVERAGE_PROMPT = 'How are different sources covering this?';

type PromptEvent = Pick<
  EventSummary,
  | 'kind'
  | 'isDemo'
  | 'title'
  | 'category'
  | 'location'
  | 'importance'
  | 'sourceCount'
  | 'hasTakeAction'
> & { conflictId?: string };

type Group = 'conflict' | 'crisis' | 'protest' | 'politics' | 'diplomacy' | 'general';

function groupOf(category: EventSummary['category']): Group {
  switch (category) {
    case 'conflict':
    case 'military':
      return 'conflict';
    case 'disaster':
    case 'humanitarian':
    case 'health':
      return 'crisis';
    case 'protest':
      return 'protest';
    case 'politics':
      return 'politics';
    case 'diplomacy':
    case 'territorial':
      return 'diplomacy';
    default:
      return 'general';
  }
}

/** Places that read with "the": the Taiwan Strait, the United States, the Netherlands. */
const PLACE_NEEDS_THE =
  /\b(strait|sea|gulf|bay|ocean|channel|islands|republic|kingdom|emirates|states|netherlands|philippines|bahamas|gambia|balkans|sahel|levant|caribbean|middle east|arctic|antarctic|horn of africa|persian gulf)\b/i;

/** "Delhi, India" → "Delhi"; "Taiwan Strait" → "the Taiwan Strait". */
export function placeName(e: Pick<EventSummary, 'location'>): string {
  const first = e.location.name.split(',')[0]!.trim() || e.location.name;
  return PLACE_NEEDS_THE.test(first) && !/^the\s/i.test(first) ? `the ${first}` : first;
}

/** "Berlin Declaration — Allied authority over Germany" → "Berlin Declaration". */
export function shortTitle(title: string): string {
  return title
    .replace(/^DEMO:\s*/i, '')
    .split(/\s+[—–]\s+|\s+-\s+|:\s+/)[0]!
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(
      /\s+(signed|begins|began|ends|opens|founded|proclaimed|declared|announced|launched|formed)$/i,
      '',
    )
    .trim();
}

const NAMED_START =
  /^(battle|siege|treaty|congress|conference|declaration|proclamation|charter|partition|division|annexation|invasion|occupation|liberation|fall|sack|capture|massacre|revolution|uprising|rebellion|revolt|assassination|bombing|bombings|armistice|unification|reunification|founding|coronation|evacuation|blockade|raid|attack|offensive|campaign|war|crisis|surrender|first|second|third|fourth|fifth|great)\b/i;
const NAMED_END =
  /\b(declaration|treaty|agreement|accords?|conference|offensive|uprising|revolution|crisis|blockade|airlift|massacre|pact|war|campaign|landings?|famine|earthquake|riots?)$/i;

/** "Battle of Berlin" → "the Battle of Berlin"; a name that does not take "the" → null. */
export function theName(title: string): string | null {
  const short = shortTitle(title);
  if (!short || short.length > 44) return null;
  return NAMED_START.test(short) || NAMED_END.test(short) ? `the ${short}` : null;
}

/** "earthquake" for an earthquake headline, "flooding" for floods… (news crises). */
function crisisNoun(title: string): string | null {
  const t = title.toLowerCase();
  if (/earthquake|quake/.test(t)) return 'earthquake';
  if (/flood/.test(t)) return 'flooding';
  if (/cyclone|typhoon|hurricane|storm/.test(t)) return 'storm';
  if (/wildfire|bushfire|forest fire/.test(t)) return 'wildfire';
  if (/tsunami/.test(t)) return 'tsunami';
  if (/drought/.test(t)) return 'drought';
  if (/outbreak|epidemic|cholera|ebola|virus/.test(t)) return 'outbreak';
  if (/famine|hunger/.test(t)) return 'food crisis';
  return null;
}

/** "an earthquake", "a storm", "flooding". */
function withArticle(noun: string): string {
  if (noun === 'flooding') return noun;
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

const unique = (items: Array<string | null | undefined>) => [
  ...new Set(items.filter((s): s is string => !!s)),
];

/** Exactly three prompts for an event card. */
export function eventPrompts(e: PromptEvent): string[] {
  const place = placeName(e);
  const named = theName(e.title);
  const lastly = e.sourceCount >= 2 ? COVERAGE_PROMPT : 'What could happen next?';
  let prompts: Array<string | null>;
  if (e.kind === 'news') {
    switch (groupOf(e.category)) {
      case 'conflict':
        prompts = [
          `What led to this in ${place}?`,
          'Who is involved, and what does each side say?',
          lastly,
        ];
        break;
      case 'crisis': {
        const noun = crisisNoun(e.title);
        prompts = [
          `How serious is the situation in ${place}?`,
          noun
            ? `Has ${place} faced ${withArticle(noun)} like this before?`
            : 'What is being done to help?',
          lastly,
        ];
        break;
      }
      case 'protest':
        prompts = [
          `Why are people protesting in ${place}?`,
          `Has ${place} seen protests like this before?`,
          lastly,
        ];
        break;
      case 'politics':
        prompts = [`What is at stake in ${place}?`, 'How did it come to this?', lastly];
        break;
      case 'diplomacy':
        prompts = [
          `What could this change for ${place}?`,
          'What is the history behind it?',
          lastly,
        ];
        break;
      default:
        prompts = ['Why does this matter?', `What happened before this in ${place}?`, lastly];
    }
  } else {
    switch (groupOf(e.category)) {
      case 'conflict':
        prompts = [
          `What led to ${named ?? 'this'}?`,
          e.conflictId ? 'How did it change the course of the war?' : 'What happened next?',
          'Show me the borders before and after',
        ];
        break;
      case 'diplomacy':
      case 'politics':
        prompts = [
          `What did ${named ?? 'this'} change?`,
          'What led up to it?',
          'Show me the borders before and after',
        ];
        break;
      case 'protest':
        prompts = ['What were people demanding?', 'What did it achieve?', 'What happened next?'];
        break;
      case 'crisis':
        prompts = [
          `How bad was ${named ?? 'it'}?`,
          'How did people respond?',
          'What happened next?',
        ];
        break;
      default:
        prompts = [
          `Why did ${named ?? 'this'} matter?`,
          'What led up to it?',
          'What happened next?',
        ];
    }
  }
  // Events with a Take Action option always offer it (the sandbox review flow).
  if (e.hasTakeAction) prompts = [prompts[0]!, prompts[1]!, HELP_PROMPT];
  const out = unique(prompts);
  for (const fill of ['Why does this matter?', 'What happened next?', 'What led up to it?'])
    if (out.length < EVENT_PROMPT_COUNT && !out.includes(fill)) out.push(fill);
  return out.slice(0, EVENT_PROMPT_COUNT);
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** A prompt about one of today's biggest stories. */
function storyPrompt(e: PromptEvent): string {
  const place = placeName(e);
  switch (groupOf(e.category)) {
    case 'protest':
      return `Why are people protesting in ${place}?`;
    case 'politics':
      return `What's at stake in ${place}?`;
    case 'crisis': {
      const noun = crisisNoun(e.title);
      return noun ? `How bad is the ${noun} in ${place}?` : `What's happening in ${place}?`;
    }
    case 'diplomacy':
      return `What's the latest on ${place}?`;
    default:
      return `What's happening in ${place}?`;
  }
}

/** A prompt about one of the period's main events. */
function periodEventPrompt(e: PromptEvent, inPeriod: string): string {
  const named = theName(e.title);
  if (named) return `Tell me about ${named}`;
  const short = shortTitle(e.title);
  return short.length <= 44
    ? `Tell me about “${short}”`
    : `What happened in ${placeName(e)} ${inPeriod}?`;
}

const FALLBACKS = [
  "Show me Germany's territorial changes between 1933 and 1945",
  'What is happening near Taiwan?',
  'Berlin 1945',
  'Why does this matter historically?',
];

export interface PromptGroup {
  label: string;
  prompts: string[];
}

/**
 * Exactly six prompts for a new chat, in two groups: trending (from the events on the globe)
 * and more (about the selected period, or general).
 */
/** What an account did, as personalPrompts reads it (lib/account.ts HistoryItem). */
export interface PromptHistory {
  kind: 'search' | 'event' | 'country';
  ref: string;
  title: string;
  detail: Record<string, unknown>;
}

/** An earlier conversation, as personalPrompts reads it (lib/chats.ts Chat). */
export interface PromptChat {
  title: string;
  turns: Array<{ role: string; about?: { title: string } }>;
}

/** Words a shortened title should not end on ("…reported around the…"). */
const DANGLING = new Set(
  'the a an of in on at to for and or near around after before with from by as is'.split(' '),
);

/** At most `n` characters, cut between words, without a dangling small word. */
function clipWords(s: string, n: number): string {
  if (s.length <= n) return s;
  const words = s
    .slice(0, n + 1)
    .split(' ')
    .slice(0, -1);
  while (words.length > 1 && DANGLING.has(words[words.length - 1]!.toLowerCase())) words.pop();
  return `${words.join(' ')}…`;
}

/**
 * "For you": up to three questions from what this account looked at and asked lately, newest
 * first — one per topic. Only what the AI settings allow is passed in (history, past chats).
 */
export function personalPrompts(o: {
  history: PromptHistory[];
  chats: PromptChat[];
  max?: number;
}): string[] {
  const out: string[] = [];
  const topics = new Set<string>();
  const add = (topic: string, prompt: string) => {
    const k = topic.trim().toLowerCase();
    if (!k || topics.has(k) || out.includes(prompt)) return;
    topics.add(k);
    out.push(prompt);
  };
  for (const h of o.history.slice(0, 30)) {
    const d = h.detail as {
      eventKind?: string;
      place?: string;
      start?: string;
      end?: string | null;
      result?: { title?: string; type?: string };
    };
    if (h.kind === 'event') {
      const name = shortTitle(h.title);
      if (d.eventKind === 'historical')
        add(name, `What happened after ${theName(h.title) ?? `“${clipWords(name, 48)}”`}?`);
      else add(d.place ?? name, `What's the latest on ${clipWords(name, 56)}?`);
    } else if (h.kind === 'country') {
      const from = d.start?.slice(0, 4);
      const to = d.end?.slice(0, 4);
      add(
        h.title,
        to
          ? `What shaped ${countryName(h.title)} between ${from} and ${to}?`
          : `What's happening in ${h.title} today?`,
      );
    } else {
      const picked = d.result?.title && d.result.type !== 'PLACE' ? d.result.title : h.title;
      add(picked, `Tell me more about ${clipWords(picked, 56)}`);
    }
  }
  for (const c of o.chats.slice(0, 10)) {
    const about = c.turns.find((t) => t.role === 'user' && t.about)?.about?.title;
    if (about) add(shortTitle(about), `Any news on ${clipWords(shortTitle(about), 56)}?`);
    else if (c.title) add(c.title, `More on “${clipWords(c.title, 48)}”`);
  }
  return out.slice(0, o.max ?? 3);
}

/** "the Weimar Republic", "the United States", "Germany". */
function countryName(name: string): string {
  return /^(the )/i.test(name) ||
    !/\b(Republic|Kingdom|Empire|Union|States|Federation|Emirates|Islands|Confederation|Reich)\b/.test(
      name,
    )
    ? name
    : `the ${name}`;
}

export function starterPrompts(o: {
  mode: 'live' | 'historical';
  timeMs: number;
  resolution: Resolution;
  nowMs: number;
  events: PromptEvent[];
  /** "For you" (personalPrompts): shown first; the rest of the six follow the timeline. */
  personal?: string[];
}): PromptGroup[] {
  const trending: string[] = [];
  const more: Array<string | null> = [];
  let trendLabel = 'Trending now';
  const seen = new Set<string>();
  const takeFrom = (
    events: PromptEvent[],
    prompt: (e: PromptEvent) => string,
    key: (e: PromptEvent) => string,
  ) => {
    for (const e of events) {
      if (trending.length >= 3) break;
      const k = key(e);
      const p = prompt(e);
      if (seen.has(k) || trending.includes(p)) continue;
      seen.add(k);
      trending.push(p);
    }
  };

  if (o.mode === 'live') {
    const news = o.events
      .filter((e) => e.kind === 'news')
      // Real stories before labelled DEMO scenarios; the most covered first.
      .sort(
        (a, b) =>
          Number(a.isDemo) - Number(b.isDemo) ||
          b.sourceCount - a.sourceCount ||
          b.importance - a.importance,
      );
    takeFrom(news, storyPrompt, (e) => placeName(e).toLowerCase());
    const now = new Date(o.nowMs);
    more.push(
      "What are today's biggest stories?",
      `What happened on ${now.getUTCDate()} ${MONTHS[now.getUTCMonth()]} in history?`,
      o.events.some((e) => e.hasTakeAction) ? HELP_PROMPT : null,
    );
  } else {
    const unit: Resolution = o.resolution === 'hour' ? 'day' : o.resolution;
    const label = formatAt(o.timeMs, unit, { upper: false });
    const inPeriod =
      unit === 'day'
        ? `on ${label}`
        : unit === 'decade' || unit === 'century'
          ? `in the ${label}`
          : `in ${label}`;
    const period = unit === 'decade' || unit === 'century' ? `the ${label}` : label;
    trendLabel = `Key events ${inPeriod}`;
    const main = o.events
      .filter((e) => e.kind === 'historical')
      .sort((a, b) => b.importance - a.importance || b.sourceCount - a.sourceCount);
    takeFrom(
      main,
      (e) => periodEventPrompt(e, inPeriod),
      (e) => shortTitle(e.title).toLowerCase(),
    );
    more.push(
      `What was happening in the world ${inPeriod}?`,
      `Show me how the borders looked ${inPeriod}`,
      `Take me through ${period} step by step`,
      "Return to today's news",
    );
  }

  const personal = unique(o.personal ?? []).slice(0, 3);
  const room = STARTER_PROMPT_COUNT - personal.length;
  const all = unique([...trending, ...more]).filter((p) => !personal.includes(p));
  for (const f of FALLBACKS) if (all.length < room && !all.includes(f)) all.push(f);
  const six = all.slice(0, room);
  const groups: PromptGroup[] = [];
  if (personal.length) groups.push({ label: 'For you', prompts: personal });
  const t = six.filter((p) => trending.includes(p));
  const rest = six.filter((p) => !trending.includes(p));
  if (t.length) groups.push({ label: trendLabel, prompts: t });
  if (rest.length) groups.push({ label: t.length ? 'More to ask' : 'Try asking', prompts: rest });
  return groups;
}
