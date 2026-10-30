import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toIso } from '@worldlens/shared';
import { runActions } from '../ai/actionExecutor';
import { api, type ChatMessage } from '../lib/api';
import { relativeTime, safeExternalUrl } from '../lib/format';
import type { ChatTurn } from '../lib/chats';
import { useConfig } from '../hooks/useData';
import { orderedChats, useChatsStore } from '../state/chats';
import { useAppStore } from '../state/store';
import { ExternalLink, Icon, Notice, Spinner } from './ui';

const QUICK = [
  'What is happening near Taiwan?',
  "Show me Germany's territorial changes between 1933 and 1945",
  'Why does this matter historically?',
  'I have $20. How can I help?',
  'Berlin 1945',
];

type View = 'chat' | 'list';

const MENU_ITEM =
  'flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[12.5px] text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white';

export function AssistantPanel() {
  const chats = useChatsStore((s) => s.chats);
  const activeId = useChatsStore((s) => s.activeId);
  const setActive = useChatsStore((s) => s.setActive);
  const startDraft = useChatsStore((s) => s.startDraft);
  const appendTurn = useChatsStore((s) => s.appendTurn);
  const renameChat = useChatsStore((s) => s.rename);
  const pinChat = useChatsStore((s) => s.togglePin);
  const removeChat = useChatsStore((s) => s.remove);
  const pendingQuestion = useAppStore((s) => s.pendingQuestion);
  const takePendingQuestion = useAppStore((s) => s.takePendingQuestion);

  const [view, setView] = useState<View>('chat');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; right: number; top: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const config = useConfig();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const active = useMemo(() => chats.find((c) => c.id === activeId) ?? null, [chats, activeId]);
  const menuChat = useMemo(
    () => (menu ? (chats.find((c) => c.id === menu.id) ?? null) : null),
    [menu, chats],
  );
  const turns = useMemo<ChatTurn[]>(() => active?.turns ?? [], [active]);
  const ordered = useMemo(() => orderedChats(chats), [chats]);

  useEffect(() => {
    if (view !== 'chat') return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns, busy, view]);

  // Grow with the text, up to five lines (5 × 22px line + 14px padding), then scroll.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 124)}px`;
  }, [input]);

  useEffect(() => {
    if (view !== 'list') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (renaming) return;
      setView('chat');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, renaming]);

  useEffect(() => {
    if (!menu) {
      setConfirmDelete(null);
      return;
    }
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (menuRef.current?.contains(target as Node)) return;
      if (target?.closest?.('[data-chat-menu-trigger]')) return;
      setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setMenu(null);
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [
        ...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
      ];
      if (items.length === 0) return;
      e.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === 'ArrowDown'
          ? (index + 1) % items.length
          : (index - 1 + items.length) % items.length;
      items[next]?.focus();
    };
    const dismiss = () => setMenu(null);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    requestAnimationFrame(() =>
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus(),
    );
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [menu]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setError(null);
    setView('chat');
    const history: ChatMessage[] = [
      ...turns.map((t): ChatMessage => ({ role: t.role, content: t.content })),
      { role: 'user' as const, content: q },
    ].slice(-12);
    const now = Date.now();
    // No stored chat until the first message: empty drafts never appear in history.
    const chatId = appendTurn({ role: 'user', content: q }, now, active?.id);
    setInput('');
    setBusy(true);
    const s = useAppStore.getState();
    try {
      const res = await api.chat({
        messages: history,
        context: {
          mode: s.mode,
          timeIso: toIso(s.mode === 'live' ? Date.now() : s.timeMs),
          resolution: s.resolution,
          selectedEventId: s.selectedEventId,
          camera: { lat: s.camera.lat, lon: s.camera.lon, altitudeKm: s.camera.altitudeKm },
          layers: s.layers,
        },
      });
      const { rejected } = runActions(res.actions);
      appendTurn(
        { role: 'assistant', content: res.reply, meta: { ...res, rejected } },
        Date.now(),
        chatId,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant is unavailable.');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  // An event's "Ask AI" prompts are asked while this panel is not mounted (the card or the sheet
  // shows the event), so the question waits in the store. It is taken rather than read from
  // this render because StrictMode runs a mount effect twice, and it must be sent once.
  useEffect(() => {
    if (!pendingQuestion || busy) return;
    const q = takePendingQuestion();
    if (q) void send(q);
  });

  const startChat = () => {
    startDraft();
    setMenu(null);
    setView('chat');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const commitRename = (id: string) => {
    renameChat(id, draft, Date.now());
    setRenaming(null);
    setDraft('');
  };

  const aiOn = config.data?.ai.available;
  const canSend = input.trim().length > 0 && !busy;

  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-label="AI assistant"
      data-testid="assistant"
    >
      <header className="flex items-center gap-2 px-3.5 pb-1 pt-3">
        <h2 className="text-[12px] text-white/55">Ask WorldLens</h2>
        <span className="flex items-center gap-1.5 rounded-full border border-white/12 px-2 py-[2px] text-[10px] text-white/50">
          <span
            className={`h-1 w-1 rounded-full ${aiOn ? 'bg-white/70' : 'bg-white/30'}`}
            aria-hidden
          />
          {aiOn ? 'AI' : 'Offline assistant'}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => {
              setMenu(null);
              setRenaming(null);
              setView(view === 'list' ? 'chat' : 'list');
            }}
            aria-pressed={view === 'list'}
            aria-label={view === 'list' ? 'Back to the conversation' : 'Chat history'}
            title={view === 'list' ? 'Back to the conversation' : 'Chat history'}
            className={`grid h-7 w-7 place-items-center rounded-full transition-colors ${
              view === 'list'
                ? 'bg-white/[0.12] text-white'
                : 'text-white/45 hover:bg-white/[0.08] hover:text-white'
            }`}
            data-testid="chat-history-toggle"
          >
            <Icon name={view === 'list' ? 'arrow-left' : 'clock'} className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={startChat}
            aria-label="New chat"
            title="New chat"
            className="grid h-7 w-7 place-items-center rounded-full text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white"
            data-testid="new-chat"
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {view === 'list' ? (
        <div className="flex min-h-0 flex-1 flex-col" data-testid="chat-list">
          <div className="flex items-center gap-2 px-3.5 pb-1 pt-1.5">
            <span className="text-[10.5px] tracking-[0.08em] text-white/40">Chats</span>
            {chats.length > 0 && (
              <span className="tabular text-[10.5px] text-white/30">{chats.length}</span>
            )}
          </div>
          {chats.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-8 text-center">
              <p className="text-[12px] text-white/60">No conversations yet.</p>
              <p className="text-[11px] leading-relaxed text-white/35">
                Ask about a place, an event or a date. Conversations are kept in this browser.
              </p>
              <button
                type="button"
                onClick={startChat}
                className="mt-1 rounded-full bg-[var(--active-bg)] px-3 py-1.5 text-[11.5px] text-[var(--active-fg)] transition-colors hover:bg-white"
              >
                Start a chat
              </button>
            </div>
          ) : (
            <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
              {ordered.map((chat) => {
                const isActive = chat.id === activeId;
                const when = relativeTime(new Date(chat.updatedAt).toISOString());
                return (
                  <li key={chat.id} className="border-b border-white/[0.05] last:border-0">
                    <div
                      data-chat-row
                      className={`flex items-center gap-1 rounded-[10px] px-2 py-2 transition-colors ${
                        isActive ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]'
                      }`}
                    >
                      {renaming === chat.id ? (
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => commitRename(chat.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(chat.id);
                            if (e.key === 'Escape') {
                              setRenaming(null);
                              setDraft('');
                            }
                          }}
                          aria-label="Chat name"
                          className="min-w-0 flex-1 rounded-[10px] bg-white/[0.06] px-2 py-1 text-[12.5px] text-white/90 focus:bg-white/[0.09]"
                          data-testid="chat-rename-input"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setActive(chat.id);
                            setView('chat');
                            setMenu(null);
                          }}
                          className="min-w-0 flex-1 text-left"
                          data-testid="chat-row"
                        >
                          <span className="flex items-center gap-1.5">
                            {chat.pinned && (
                              <Icon name="pin" className="h-3 w-3 shrink-0 text-white/45" />
                            )}
                            <span className="truncate text-[12.5px] text-white/90">
                              {chat.title}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[10.5px] text-white/40">
                            {when}
                            {chat.turns.length > 0 &&
                              ` · ${chat.turns.length} ${chat.turns.length === 1 ? 'message' : 'messages'}`}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        data-chat-menu-trigger
                        aria-haspopup="menu"
                        aria-expanded={menu?.id === chat.id}
                        aria-label={`Chat actions for ${chat.title}`}
                        onClick={(e) => {
                          const row =
                            e.currentTarget.closest('[data-chat-row]')?.getBoundingClientRect() ??
                            e.currentTarget.getBoundingClientRect();
                          const open = menu?.id === chat.id;
                          setConfirmDelete(null);
                          if (open) {
                            setMenu(null);
                            return;
                          }
                          // Hangs under the whole chat row, right-aligned to it.
                          const estimated = 132;
                          const below = row.bottom + 6;
                          const top =
                            below + estimated > window.innerHeight - 8
                              ? Math.max(8, row.top - estimated - 6)
                              : below;
                          setMenu({
                            id: chat.id,
                            right: Math.max(8, window.innerWidth - row.right),
                            top,
                          });
                        }}
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors ${
                          menu?.id === chat.id
                            ? 'bg-white/[0.12] text-white'
                            : 'text-white/35 hover:bg-white/[0.08] hover:text-white'
                        }`}
                        data-testid="chat-actions"
                      >
                        <Icon name="dots" className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div
            ref={listRef}
            className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3"
            aria-live="polite"
          >
            {turns.length === 0 && (
              <div className="space-y-3 text-[11.5px] text-white/45">
                <p>
                  Ask about places, events or dates. The assistant can move the globe and the
                  timeline, open events and compare coverage.
                </p>
                {!aiOn && config.data && (
                  <p className="text-white/30">
                    No AI model is configured on this server, so a rule-based assistant answers from
                    WorldLens data.
                  </p>
                )}
                <div className="flex flex-col gap-1 pt-1">
                  {QUICK.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => void send(p)}
                      className="rounded-[10px] border border-transparent bg-white/[0.04] px-2.5 py-2 text-left text-[11.5px] text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white/90"
                      data-testid="quick-prompt"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={t.role === 'user' ? 'flex justify-end' : ''}>
                <div
                  className={`max-w-[94%] rounded-[var(--radius-inner)] px-3 py-2 text-[12.5px] leading-relaxed ${
                    t.role === 'user'
                      ? 'bg-white/[0.10] text-white/90'
                      : 'bg-white/[0.04] text-white/85'
                  }`}
                  data-testid={t.role === 'assistant' ? 'assistant-reply' : undefined}
                >
                  <p className="whitespace-pre-wrap">{t.content}</p>
                  {t.meta && (
                    <div className="mt-2 space-y-1.5 text-[10.5px] text-white/40">
                      {t.meta.notice && <p className="text-white/55">{t.meta.notice}</p>}
                      {t.meta.toolTrace.length > 0 && (
                        <details>
                          <summary className="cursor-pointer select-none">
                            What I did ({t.meta.toolTrace.length} tool calls)
                          </summary>
                          <ul className="mt-1 space-y-0.5 font-mono">
                            {t.meta.toolTrace.map((x, j) => (
                              <li key={j} className={x.ok ? 'text-white/45' : 'text-live'}>
                                {x.ok ? '✓' : '✗'} {x.tool}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      {t.meta.rejected.length > 0 && (
                        <p className="text-live">
                          Ignored {t.meta.rejected.length} invalid action(s).
                        </p>
                      )}
                      {t.meta.citations.length > 0 && (
                        <ul className="space-y-0.5">
                          {t.meta.citations.map((c) => {
                            const href = safeExternalUrl(c.url);
                            return href ? (
                              <li key={c.url}>
                                <ExternalLink href={href}>{c.title}</ExternalLink>{' '}
                                <span className="text-white/30">· {c.publisher}</span>
                              </li>
                            ) : null;
                          })}
                        </ul>
                      )}
                      {t.meta.model && (
                        <p className="text-white/30">
                          {t.meta.model}
                          {t.meta.usage && ` · ~$${t.meta.usage.costUsd.toFixed(4)}`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <Spinner label="Thinking and moving the globe…" />}
            {error && <Notice tone="danger">{error}</Notice>}
          </div>
          <form
            className="border-t border-white/[0.07] p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <label htmlFor="assistant-input" className="sr-only">
              Ask the assistant
            </label>
            <div className="flex items-center gap-1.5">
              <textarea
                id="assistant-input"
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder="e.g. What is happening near Taiwan?"
                className="scroll-thin max-h-[124px] min-h-9 min-w-0 flex-1 resize-none overflow-y-auto rounded-[var(--radius-inner)] bg-white/[0.05] px-3 py-[7px] text-[12.5px] leading-[22px] text-white/90 placeholder:text-white/30 focus:bg-white/[0.09]"
                data-testid="assistant-input"
              />
              <button
                type="submit"
                disabled={!canSend}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors ${
                  canSend
                    ? 'bg-[var(--active-bg)] text-[var(--active-fg)] hover:bg-white'
                    : 'bg-white/[0.05] text-white/30'
                }`}
                aria-label="Send"
                data-testid="assistant-send"
              >
                <Icon name="chevron-right" className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-white/30">
              The assistant can open a payment review screen but can never pay. You approve every
              payment in PayPal yourself.
            </p>
          </form>
        </>
      )}

      {menu &&
        menuChat &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Chat actions"
            data-testid="chat-menu"
            className="glass fixed z-50 w-[228px] rounded-[14px] p-1.5"
            style={{ top: menu.top, right: menu.right }}
          >
            {confirmDelete === menuChat.id ? (
              <div className="p-1">
                <p className="px-1.5 pb-2 pt-1 text-[11px] leading-snug text-white/55">
                  Delete this chat? This cannot be undone.
                </p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      removeChat(menuChat.id);
                      setMenu(null);
                    }}
                    className="flex-1 rounded-[10px] border border-live/40 px-2 py-1.5 text-[11px] text-live transition-colors hover:bg-live/10"
                    data-testid="chat-delete-confirm"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setConfirmDelete(null)}
                    className="flex-1 rounded-[10px] px-2 py-1.5 text-[11px] text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    pinChat(menuChat.id);
                    setMenu(null);
                  }}
                  className={`${MENU_ITEM}`}
                  data-testid="chat-pin"
                >
                  <Icon name="pin" className="h-[18px] w-[18px] shrink-0 text-white/45" />
                  {menuChat.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setDraft(menuChat.title);
                    setRenaming(menuChat.id);
                    setMenu(null);
                  }}
                  className={`${MENU_ITEM}`}
                  data-testid="chat-rename"
                >
                  <Icon name="pencil" className="h-[18px] w-[18px] shrink-0 text-white/45" />
                  Rename
                </button>
                <div className="my-1 h-px bg-white/[0.07]" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setConfirmDelete(menuChat.id)}
                  className={`${MENU_ITEM} text-live hover:bg-live/10 hover:text-live`}
                  data-testid="chat-delete"
                >
                  <Icon name="trash" className="h-[18px] w-[18px] shrink-0 text-live/80" />
                  Delete
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </section>
  );
}
