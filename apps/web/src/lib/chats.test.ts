import { describe, expect, it } from 'vitest';
import {
  addTurn,
  loadChats,
  makeChatId,
  newChat,
  renameChat,
  saveChats,
  sortChats,
  titleFromMessage,
  togglePin,
  type Chat,
} from './chats';

const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);

describe('titleFromMessage', () => {
  it('uses the first few words and sentence case', () => {
    expect(titleFromMessage('What is happening near Taiwan?')).toBe(
      'What is happening near Taiwan',
    );
    expect(titleFromMessage("Show me Germany's territorial changes between 1933 and 1945")).toBe(
      "Show me Germany's territorial changes between…",
    );
  });

  it('collapses whitespace, trims punctuation and handles empty input', () => {
    expect(titleFromMessage('  Berlin   1945  ')).toBe('Berlin 1945');
    expect(titleFromMessage('   ')).toBe('New chat');
  });

  it('always returns a bounded title', () => {
    expect(titleFromMessage('x'.repeat(400)).length).toBeLessThanOrEqual(64);
  });
});

describe('chats', () => {
  it('names the chat from the first user message only', () => {
    const chat = newChat(NOW, 'chat-1');
    const first = addTurn(chat, { role: 'user', content: 'Flooding in Sylhet' }, NOW);
    expect(first.title).toBe('Flooding in Sylhet');
    const second = addTurn(first, { role: 'user', content: 'And in Dhaka?' }, NOW + 1000);
    expect(second.title).toBe('Flooding in Sylhet');
    expect(second.turns).toHaveLength(2);
  });

  it('keeps only the most recent turns', () => {
    let chat = newChat(NOW, 'chat-2');
    for (let i = 0; i < 60; i++)
      chat = addTurn(chat, { role: 'user', content: `message ${i}` }, NOW + i);
    expect(chat.turns).toHaveLength(40);
    expect(chat.turns.at(-1)!.content).toBe('message 59');
  });

  it('renames with a trimmed, bounded title and ignores an empty one', () => {
    const chat = newChat(NOW, 'chat-3');
    expect(renameChat(chat, '   ', NOW).title).toBe('New chat');
    expect(renameChat(chat, '  Arctic shipping  ', NOW).title).toBe('Arctic shipping');
    expect(renameChat(chat, 'y'.repeat(200), NOW).title.length).toBe(64);
  });

  it('sorts pinned chats first, then most recent', () => {
    const a: Chat = { ...newChat(NOW, 'a'), updatedAt: NOW + 10 };
    const b: Chat = { ...newChat(NOW, 'b'), updatedAt: NOW + 20 };
    const c: Chat = { ...togglePin({ ...newChat(NOW, 'c'), updatedAt: NOW }), updatedAt: NOW };
    expect(sortChats([a, b, c]).map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('storage', () => {
  it('round-trips a snapshot', () => {
    const chat = addTurn(newChat(NOW, 'chat-1'), { role: 'user', content: 'Berlin 1945' }, NOW);
    saveChats({ chats: [chat], activeId: 'chat-1' });
    const loaded = loadChats();
    expect(loaded.activeId).toBe('chat-1');
    expect(loaded.chats[0]!.title).toBe('Berlin 1945');
    expect(loaded.chats[0]!.turns).toHaveLength(1);
  });

  it('keeps which event a question was asked from, and names the chat after it', () => {
    const about = { eventId: 'hist-battle-of-berlin', title: 'Battle of Berlin' };
    const chat = addTurn(
      newChat(NOW, 'chat-2'),
      { role: 'user', content: 'What led to this?', about },
      NOW,
    );
    expect(chat.title).toBe('Battle of Berlin: What led to this');
    saveChats({ chats: [chat], activeId: 'chat-2' });
    expect(loadChats().chats[0]!.turns[0]!.about).toEqual(about);
  });

  it('drops malformed records instead of repairing them', () => {
    localStorage.setItem(
      'worldlens.chats',
      JSON.stringify({
        chats: [
          {
            id: 'ok',
            title: 'Fine',
            pinned: false,
            createdAt: 1,
            updatedAt: 2,
            turns: [{ role: 'user', content: 'Hello' }],
          },
          { id: 'broken', title: 'Missing fields' },
          null,
        ],
        activeId: 'nope',
      }),
    );
    const loaded = loadChats();
    expect(loaded.chats.map((c) => c.id)).toEqual(['ok']);
    expect(loaded.activeId).toBe('ok');
  });

  it('caps the stored size and trims heavy metadata', () => {
    const big: Chat = {
      id: 'big',
      title: 'Big',
      pinned: false,
      createdAt: 1,
      updatedAt: 2,
      turns: Array.from({ length: 80 }, () => ({
        role: 'assistant' as const,
        content: 'x',
        meta: {
          mode: 'ai',
          reply: 'x',
          actions: [],
          citations: Array.from({ length: 40 }, () => ({
            title: 't',
            url: 'https://example.org',
            publisher: 'p',
          })),
          toolTrace: Array.from({ length: 60 }, () => ({
            tool: 'search_events',
            ok: true,
            kind: 'server' as const,
            summary: 's',
          })),
          rejected: [],
        },
      })),
    };
    saveChats({ chats: [big], activeId: 'big' });
    const [loaded] = loadChats().chats;
    expect(loaded!.turns).toHaveLength(40);
    expect(loaded!.turns[0]!.meta!.citations).toHaveLength(12);
    expect(loaded!.turns[0]!.meta!.toolTrace).toHaveLength(24);
  });

  it('never keeps a chat with no messages', () => {
    saveChats({
      chats: [
        { ...newChat(NOW, 'empty'), pinned: false },
        addTurn(newChat(NOW, 'real'), { role: 'user', content: 'Sylhet floods' }, NOW),
      ],
      activeId: 'empty',
    });
    const loaded = loadChats();
    expect(loaded.chats.map((c) => c.id)).toEqual(['real']);
    // The stored active chat was dropped, so the most recent real one is selected instead.
    expect(loaded.activeId).toBe('real');
  });

  it('survives unreadable storage', () => {
    localStorage.setItem('worldlens.chats', 'not json');
    expect(loadChats()).toEqual({ chats: [], activeId: null });
  });
});

describe('makeChatId', () => {
  it('is prefixed and deterministic for a fixed clock and random source', () => {
    expect(makeChatId(NOW, () => 0.5)).toBe(makeChatId(NOW, () => 0.5));
    expect(makeChatId(NOW, () => 0.5).startsWith('chat-')).toBe(true);
  });
});
