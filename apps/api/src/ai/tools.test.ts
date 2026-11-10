import { describe, expect, it } from 'vitest';
import { MemoryRepository } from '../data/memory-repository';
import { AGENT_SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT } from './prompts';
import { PlaceNameIndex } from '../providers/place-names';
import { prepareClientAction, runServerTool, type ToolContext } from './tools-impl';

const NOW = Date.parse('2026-11-10T00:00:00Z');
const ctx = (o: Partial<ToolContext> = {}): ToolContext =>
  ({ repo: new MemoryRepository(), nowMs: NOW, ...o }) as unknown as ToolContext;

describe('the assistant operates the app — never the account', () => {
  it('account settings open and point to a section; the user makes the change', async () => {
    const r = await prepareClientAction(
      'open_panel',
      { panel: 'account', section: 'password' },
      ctx({ signedIn: true }),
    );
    expect(r.action).toEqual({
      tool: 'open_panel',
      args: { panel: 'account', section: 'password' },
    });
    expect(JSON.stringify(r.result)).toMatch(/themselves/);
    // Sections belong to account settings only.
    const bad = await prepareClientAction(
      'open_panel',
      { panel: 'layers', section: 'email' },
      ctx({ signedIn: true }),
    );
    expect(bad.ok).toBe(false);
  });

  it('a guest gets the sign-in window instead of account panels or account AI settings', async () => {
    for (const panel of ['account', 'ai_settings', 'history']) {
      const r = await prepareClientAction('open_panel', { panel }, ctx());
      expect(r.action).toEqual({ tool: 'open_panel', args: { panel: 'sign_in' } });
    }
    const memory = await prepareClientAction('set_ai_settings', { remember_chats: false }, ctx());
    expect(memory.ok).toBe(false);
    expect(memory.action).toBeUndefined();
    // Chat or Agent is not an account setting.
    const chat = await prepareClientAction('set_ai_settings', { agent_mode: false }, ctx());
    expect(chat.action).toEqual({ tool: 'set_ai_settings', args: { agent_mode: false } });
    const signedIn = await prepareClientAction(
      'set_ai_settings',
      { read_history: false },
      ctx({ signedIn: true }),
    );
    expect(signedIn.action?.tool).toBe('set_ai_settings');
  });

  it('display settings, countries and the timeline are the assistant’s to change', async () => {
    const display = await prepareClientAction(
      'set_display',
      { quality: 'high', city_lights: true },
      ctx(),
    );
    expect(display.action).toEqual({
      tool: 'set_display',
      args: { quality: 'high', city_lights: true },
    });
    expect((await prepareClientAction('set_display', {}, ctx())).ok).toBe(false);
    const country = await prepareClientAction('open_country', { name: 'Ottoman Empire' }, ctx());
    expect(country.action).toEqual({ tool: 'open_country', args: { name: 'Ottoman Empire' } });
    const play = await prepareClientAction(
      'play_timeline',
      { playing: true, from: '1939-09', resolution: 'month', speed: 2 },
      ctx(),
    );
    expect(play.action?.tool).toBe('play_timeline');
    for (const from of ['1700', '2030-01-01'])
      expect((await prepareClientAction('play_timeline', { playing: true, from }, ctx())).ok).toBe(
        false,
      );
  });

  it('no tool types into, submits or deletes anything in an account', async () => {
    for (const name of [
      'change_password',
      'change_email',
      'change_username',
      'delete_account',
      'delete_history',
      'sign_out',
    ]) {
      const r = await prepareClientAction(name, {}, ctx({ signedIn: true }));
      expect(r.ok).toBe(false);
    }
  });
});

describe('marking places', () => {
  const names = {
    v: 1,
    places: [
      ['r1', 'Nile', 18.1, 30.8, 3, 'r'],
      ['l1', 'Lake Victoria', -1.2, 33, 3, 'l', 'Nyanza'],
      ['C1', 'Paris', 48.87, 2.33, 1.7, 'C'],
      ['d1', 'Sahara', 20.2, 25.2, 3, 'd'],
    ],
  };
  const index = (ok = true) =>
    new PlaceNameIndex('https://app.test/data/places/names.json', (async () =>
      ok ? Response.json(names) : new Response('', { status: 503 })) as typeof fetch);

  it('a place on the map is marked by its id and exact name; the reply says what was found', async () => {
    const r = await prepareClientAction(
      'highlight_place',
      { name: 'the Nile River', kind: 'river' },
      ctx({ places: index() }),
    );
    expect(r.action).toEqual({
      tool: 'highlight_place',
      args: { name: 'Nile', kind: 'river', id: 'r1' },
    });
    expect(JSON.stringify(r.result)).toMatch(/Nile \(river\)/);
    const lake = await prepareClientAction(
      'highlight_place',
      { name: 'Nyanza' },
      ctx({ places: index() }),
    );
    expect(lake.action?.args).toMatchObject({ name: 'Lake Victoria', id: 'l1' });
  });

  it('nothing is marked that is not on the map; "none" clears', async () => {
    const r = await prepareClientAction(
      'highlight_place',
      { name: 'Atlantis' },
      ctx({ places: index() }),
    );
    expect(r.ok).toBe(false);
    expect(r.action).toBeUndefined();
    const wrongKind = await prepareClientAction(
      'highlight_place',
      { name: 'Paris', kind: 'river' },
      ctx({ places: index() }),
    );
    expect(wrongKind.ok).toBe(false);
    const clear = await prepareClientAction('highlight_place', { name: 'none' }, ctx());
    expect(clear.action).toEqual({ tool: 'highlight_place', args: { name: 'none', kind: 'any' } });
    const down = await prepareClientAction(
      'highlight_place',
      { name: 'Paris' },
      ctx({ places: index(false) }),
    );
    expect(JSON.stringify(down.result)).toMatch(/unavailable/);
  });
});

describe('what happened in a period', () => {
  it('lists a year of history, most important first; refuses before 1800 and the future', async () => {
    const r = await runServerTool('list_events', { date: '1815', kind: 'historical' }, ctx());
    const events = (r.result as { events: { title: string }[] }).events;
    expect(events.some((e) => /Waterloo/.test(e.title))).toBe(true);
    expect((r.result as { period: { span: string } }).period.span).toBe('year');
    expect((await runServerTool('list_events', { date: '1750' }, ctx())).ok).toBe(false);
    expect((await runServerTool('list_events', { date: '2027-01-01' }, ctx())).ok).toBe(false);
    const before = await runServerTool('list_events', { date: '1850', kind: 'news' }, ctx());
    expect((before.result as { note: string }).note).toMatch(/News starts in 2000/);
  });
});

describe('the assistant knows the app and its limits', () => {
  it('both modes: the app guide, news since 2000, and account settings it only points to', () => {
    for (const p of [AGENT_SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT]) {
      expect(p).toContain("Wikipedia's Current events portal");
      expect(p).toContain('Graphics quality Auto, Low, Med or High');
      expect(p).toContain('you point and guide, you never act');
      expect(p).toMatch(/Never ask for, accept, repeat or keep a password/);
      expect(p).toMatch(/decline in one friendly sentence/);
      expect(p).toMatch(/tutor them one step at a time/);
      // Outlets named as the tools give them; ratings said to come from Wikidata, with confidence.
      expect(p).toMatch(/Name outlets exactly as get_event_sources gives them/);
      expect(p).toMatch(/say it comes from Wikidata's community-edited statements/);
    }
    expect(AGENT_SYSTEM_PROMPT).toContain('Taking control');
    expect(AGENT_SYSTEM_PROMPT).not.toContain('switched the assistant to Chat');
    expect(CHAT_SYSTEM_PROMPT).toContain('switched the assistant to Chat');
    expect(CHAT_SYSTEM_PROMPT).not.toContain('Taking control');
  });
});
