/**
 * Assistant conversation store (browser-local).
 *
 * Conversations live in localStorage so they survive closing the panel, collapsing the mobile
 * sheet and reloading. There is no server-side conversation state: `POST /api/ai/chat` stays
 * stateless and receives the last twelve turns as context.
 *
 * Pure helpers live here so they can be tested without a DOM; the Zustand wrapper in
 * `state/chats.ts` only wires them to React.
 */
import type { ChatResponse } from './api';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  /** Assistant metadata (citations, tool trace, model, cost). Absent on user turns. */
  meta?: ChatResponse & { rejected: string[] };
}

export interface Chat {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  turns: ChatTurn[];
}

export interface ChatsSnapshot {
  chats: Chat[];
  activeId: string | null;
}

const STORAGE_KEY = 'worldlens.chats';
const MAX_CHATS = 30;
const MAX_TURNS = 40;
const MAX_CONTENT = 8000;
const MAX_TITLE = 64;
const MAX_TOOL_TRACE = 24;

/** A stable, human-readable title from the first thing the user asked. */
export function titleFromMessage(text: string): string {
  const clean = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:!?]+$/, '');
  if (!clean) return 'New chat';
  let base = clean;
  let clipped = false;
  if (base.length > 48) {
    base = base.slice(0, 48);
    const lastSpace = base.lastIndexOf(' ');
    if (lastSpace > 20) base = base.slice(0, lastSpace);
    clipped = true;
  }
  const titled = base.charAt(0).toUpperCase() + base.slice(1);
  return (clipped ? `${titled}…` : titled).slice(0, MAX_TITLE);
}

export function newChat(nowMs: number, id: string): Chat {
  return { id, title: 'New chat', pinned: false, createdAt: nowMs, updatedAt: nowMs, turns: [] };
}

export function addTurn(chat: Chat, turn: ChatTurn, nowMs: number): Chat {
  const turns = [...chat.turns, turn].slice(-MAX_TURNS);
  // The first user message names the chat; renaming later is an explicit user action.
  const isFirstUser = turn.role === 'user' && !chat.turns.some((t) => t.role === 'user');
  return {
    ...chat,
    turns,
    title: isFirstUser ? titleFromMessage(turn.content) : chat.title,
    updatedAt: nowMs,
  };
}

export function renameChat(chat: Chat, title: string, nowMs: number): Chat {
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  if (!clean) return chat;
  return { ...chat, title: clean, updatedAt: nowMs };
}

export function togglePin(chat: Chat): Chat {
  return { ...chat, pinned: !chat.pinned };
}

/** Pinned first, then most recently updated. */
export function sortChats(chats: Chat[]): Chat[] {
  return [...chats].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
  );
}

function isTurn(value: unknown): value is ChatTurn {
  if (!value || typeof value !== 'object') return false;
  const t = value as Partial<ChatTurn>;
  return (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string';
}

function sanitizeTurn(turn: ChatTurn): ChatTurn {
  const meta = turn.meta
    ? {
        ...turn.meta,
        toolTrace: (turn.meta.toolTrace ?? []).slice(0, MAX_TOOL_TRACE),
        citations: (turn.meta.citations ?? []).slice(0, 12),
      }
    : undefined;
  return {
    role: turn.role,
    content: turn.content.slice(0, MAX_CONTENT),
    ...(meta ? { meta } : {}),
  };
}

function isChat(value: unknown): value is Chat {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<Chat>;
  return (
    typeof c.id === 'string' &&
    typeof c.title === 'string' &&
    typeof c.createdAt === 'number' &&
    typeof c.updatedAt === 'number' &&
    typeof c.pinned === 'boolean' &&
    Array.isArray(c.turns)
  );
}

/** Reads and validates stored conversations; anything malformed is dropped, never repaired. */
export function loadChats(): ChatsSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { chats: [], activeId: null };
    const parsed = JSON.parse(raw) as Partial<ChatsSnapshot>;
    const chats = (Array.isArray(parsed.chats) ? parsed.chats : [])
      .filter(isChat)
      .map((c) => ({
        ...c,
        title: c.title.slice(0, MAX_TITLE),
        turns: c.turns.filter(isTurn).slice(-MAX_TURNS).map(sanitizeTurn),
      }))
      // A chat exists only once it has a message; empty drafts are never stored.
      .filter((c) => c.turns.length > 0)
      .slice(0, MAX_CHATS);
    const activeId =
      typeof parsed.activeId === 'string' && chats.some((c) => c.id === parsed.activeId)
        ? parsed.activeId
        : (chats[0]?.id ?? null);
    return { chats, activeId };
  } catch {
    return { chats: [], activeId: null };
  }
}

export function saveChats(snapshot: ChatsSnapshot): void {
  try {
    const chats = snapshot.chats.filter((c) => c.turns.length > 0).slice(0, MAX_CHATS);
    const activeId = chats.some((c) => c.id === snapshot.activeId) ? snapshot.activeId : null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ chats, activeId }));
  } catch {
    /* storage unavailable or full: conversations stay in memory for this session */
  }
}

export function makeChatId(nowMs: number, random = Math.random): string {
  return `chat-${nowMs.toString(36)}-${Math.floor(random() * 1e6).toString(36)}`;
}
