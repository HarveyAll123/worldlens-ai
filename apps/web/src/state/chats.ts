/**
 * Conversations for the assistant, in memory: a guest's are gone when they leave the site; a
 * signed-in account's are loaded from and saved to the server (lib/accountSync.ts).
 */
import { create } from 'zustand';
import {
  addTurn,
  makeChatId,
  newChat,
  renameChat,
  togglePin,
  type Chat,
  type ChatTurn,
} from '../lib/chats';

interface ChatsState {
  chats: Chat[];
  activeId: string | null;
  setActive: (id: string) => void;
  /** Show an empty composer without creating a stored chat. */
  startDraft: () => void;
  appendTurn: (turn: ChatTurn, nowMs: number, chatId?: string) => string;
  rename: (id: string, title: string, nowMs: number) => void;
  togglePin: (id: string) => void;
  remove: (id: string) => void;
  /** An account's chats as the server has them (after sign-in); [] after sign-out. */
  replaceAll: (chats: Chat[]) => void;
}

function emptyChat(): Chat {
  const now = Date.now();
  return newChat(now, makeChatId(now));
}

export const useChatsStore = create<ChatsState>((set, get) => {
  const persist = (chats: Chat[], activeId: string | null) => set({ chats, activeId });

  return {
    chats: [],
    activeId: null,
    replaceAll: (chats) => set({ chats, activeId: null }),

    setActive: (id) => persist(get().chats, id),

    startDraft: () => persist(get().chats, null),

    // `chatId` pins a slow reply to the conversation it was asked in.
    appendTurn: (turn, nowMs, chatId) => {
      const state = get();
      const targetId = chatId ?? state.activeId;
      const current = state.chats.find((c) => c.id === targetId);
      if (!current) {
        const chat = emptyChat();
        const withTurn = addTurn(chat, turn, nowMs);
        persist([withTurn, ...state.chats], withTurn.id);
        return withTurn.id;
      }
      const updated = addTurn(current, turn, nowMs);
      persist(
        state.chats.map((c) => (c.id === updated.id ? updated : c)),
        state.activeId ?? updated.id,
      );
      return updated.id;
    },

    rename: (id, title, nowMs) => {
      const state = get();
      persist(
        state.chats.map((c) => (c.id === id ? renameChat(c, title, nowMs) : c)),
        state.activeId,
      );
    },

    togglePin: (id) => {
      const state = get();
      persist(
        state.chats.map((c) => (c.id === id ? togglePin(c) : c)),
        state.activeId,
      );
    },

    remove: (id) => {
      const state = get();
      const chats = state.chats.filter((c) => c.id !== id);
      const activeId = state.activeId === id ? (chats[0]?.id ?? null) : state.activeId;
      persist(chats, activeId);
    },
  };
});

/** Newest first, pinned on top. Kept out of the store so ordering never churns storage. */
export function orderedChats(chats: Chat[]): Chat[] {
  return [...chats].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
  );
}
