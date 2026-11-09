/**
 * A signed-in account keeps its AI chats and viewing history on the server: chats are loaded
 * at sign-in and every change is saved; each event or country the user opens is recorded.
 * Guests keep nothing: their chats stay in memory and leave with them.
 */
import { loadChats, type Chat } from './chats';
import { account, type StoredChat } from './account';
import { useAccount } from '../state/account';
import { useChatsStore } from '../state/chats';
import { onOpened } from '../state/store';

/** Chats this browser kept before accounts (localStorage): moved into the first account. */
const LEGACY_KEY = 'worldlens.chats';

function legacyChats(): Chat[] {
  try {
    return localStorage.getItem(LEGACY_KEY) ? loadChats().chats : [];
  } catch {
    return [];
  }
}

const SAVE_DELAY_MS = 600;

export function startAccountSync(): () => void {
  let userId: string | null = null;
  let loading = false;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const save = (id: string) => {
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        const chat = useChatsStore.getState().chats.find((c) => c.id === id);
        if (chat && userId)
          void account.chats.save(chat as unknown as StoredChat).catch(() => undefined);
      }, SAVE_DELAY_MS),
    );
  };

  const signedIn = async (id: string | null) => {
    userId = id;
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    if (!id) {
      useChatsStore.getState().replaceAll([]);
      return;
    }
    loading = true;
    try {
      const { chats } = await account.chats.list();
      const known = new Set(chats.map((c) => c.id));
      const moved = legacyChats().filter((c) => !known.has(c.id));
      await Promise.all(moved.map((c) => account.chats.save(c as unknown as StoredChat)));
      try {
        localStorage.removeItem(LEGACY_KEY);
      } catch {
        /* ignore */
      }
      // Chats a guest started this visit join the account too.
      const unsaved = useChatsStore.getState().chats.filter((c) => !known.has(c.id));
      await Promise.all(unsaved.map((c) => account.chats.save(c as unknown as StoredChat)));
      if (userId === id)
        useChatsStore
          .getState()
          .replaceAll(
            [...(chats as unknown as Chat[]), ...moved, ...unsaved].sort(
              (a, b) => b.updatedAt - a.updatedAt,
            ),
          );
    } catch {
      /* the server is unreachable: the chats stay as they are */
    } finally {
      loading = false;
    }
  };

  const unsubAccount = useAccount.subscribe((s, prev) => {
    const id = s.user?.id ?? null;
    if (id !== (prev.user?.id ?? null)) void signedIn(id);
  });
  void signedIn(useAccount.getState().user?.id ?? null);

  const unsubChats = useChatsStore.subscribe((s, prev) => {
    if (!userId || loading || s.chats === prev.chats) return;
    const before = new Map(prev.chats.map((c) => [c.id, c]));
    for (const chat of s.chats) if (before.get(chat.id) !== chat) save(chat.id);
    const now = new Set(s.chats.map((c) => c.id));
    for (const id of before.keys())
      if (!now.has(id)) {
        clearTimeout(timers.get(id));
        void account.chats.remove(id).catch(() => undefined);
      }
  });

  const unsubOpened = onOpened((o) => {
    if (!userId) return;
    if (o.kind === 'search' && !o.query.trim()) return;
    const item =
      o.kind === 'event'
        ? { kind: 'event' as const, ref: o.id }
        : o.kind === 'search'
          ? {
              kind: 'search' as const,
              ref: o.query.slice(0, 200),
              title: o.query.slice(0, 300),
              detail: { result: o.pick },
            }
          : {
              kind: 'country' as const,
              ref: o.country.wikidata ?? `${o.country.name}|${o.country.start}`,
              title: o.country.name,
              detail: o.country,
            };
    void account.history.add(item).catch(() => undefined);
  });

  return () => {
    unsubAccount();
    unsubChats();
    unsubOpened();
    for (const t of timers.values()) clearTimeout(t);
  };
}
