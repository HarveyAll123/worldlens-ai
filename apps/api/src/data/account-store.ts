/**
 * What an account keeps: its AI conversations and the events and countries it opened
 * (tables user_chats and user_history). Guests keep nothing here. In memory without a database.
 */
import { z } from 'zod';
import { toIso } from '@worldlens/shared';
import type { SqlClient } from './sql';

/** Mirrors the web app's limits (apps/web/src/lib/chats.ts). */
export const MAX_CHATS = 30;
export const MAX_HISTORY = 200;

export const StoredChatSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(200),
  pinned: z.boolean(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  // Turns as the web app stores them; checked there, kept here as data (size-capped).
  turns: z.array(z.record(z.string(), z.unknown())).max(80),
});
export type StoredChat = z.infer<typeof StoredChatSchema>;

/**
 * A search (ref: the query, lower-cased; detail: the result chosen), an opened event (by id; the
 * API fills in its title and place) or a country (as selected).
 */
export const HistoryKindSchema = z.enum(['search', 'event', 'country']);
export const HistoryInputSchema = z.object({
  kind: HistoryKindSchema,
  ref: z.string().min(1).max(300),
  title: z.string().min(1).max(300).optional(),
  detail: z.record(z.string(), z.unknown()).default({}),
});
export interface HistoryInput {
  kind: 'search' | 'event' | 'country';
  ref: string;
  title: string;
  detail: Record<string, unknown>;
}
export interface HistoryItem extends HistoryInput {
  viewedAt: string;
}

export interface AccountStore {
  listChats(userId: string): Promise<StoredChat[]>;
  saveChat(userId: string, chat: StoredChat): Promise<void>;
  deleteChat(userId: string, id: string): Promise<void>;
  listHistory(userId: string, limit: number): Promise<HistoryItem[]>;
  addHistory(userId: string, item: HistoryInput, atMs: number): Promise<void>;
  /** These items, or everything when `items` is omitted. */
  removeHistory(userId: string, items?: { kind: string; ref: string }[]): Promise<void>;
  /** Everything an account kept (it was deleted). */
  removeAccountData(userId: string): Promise<void>;
}

export class MemoryAccountStore implements AccountStore {
  private chats = new Map<string, Map<string, StoredChat>>();
  private history = new Map<string, Map<string, HistoryItem>>();

  async listChats(userId: string) {
    return [...(this.chats.get(userId)?.values() ?? [])]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CHATS);
  }
  async saveChat(userId: string, chat: StoredChat) {
    const mine = this.chats.get(userId) ?? new Map<string, StoredChat>();
    mine.set(chat.id, chat);
    this.chats.set(userId, mine);
  }
  async deleteChat(userId: string, id: string) {
    this.chats.get(userId)?.delete(id);
  }
  async listHistory(userId: string, limit: number) {
    return [...(this.history.get(userId)?.values() ?? [])]
      .sort((a, b) => (a.viewedAt < b.viewedAt ? 1 : -1))
      .slice(0, limit);
  }
  async addHistory(userId: string, item: HistoryInput, atMs: number) {
    const mine = this.history.get(userId) ?? new Map<string, HistoryItem>();
    mine.delete(`${item.kind}|${item.ref}`);
    mine.set(`${item.kind}|${item.ref}`, { ...item, viewedAt: toIso(atMs) });
    while (mine.size > MAX_HISTORY) mine.delete(mine.keys().next().value!);
    this.history.set(userId, mine);
  }
  async removeAccountData(userId: string) {
    this.chats.delete(userId);
    this.history.delete(userId);
  }
  async removeHistory(userId: string, items?: { kind: string; ref: string }[]) {
    if (!items) return void this.history.delete(userId);
    for (const i of items) this.history.get(userId)?.delete(`${i.kind}|${i.ref}`);
  }
}

type Ts = Date | string;
const ms = (v: Ts) => (v instanceof Date ? v.getTime() : Date.parse(v));

export class PostgresAccountStore implements AccountStore {
  constructor(private readonly db: SqlClient) {}

  async listChats(userId: string) {
    const rows = await this.db.query<{
      id: string;
      title: string;
      pinned: boolean;
      turns: StoredChat['turns'];
      created_at: Ts;
      updated_at: Ts;
    }>(
      `select id, title, pinned, turns, created_at, updated_at from user_chats
       where user_id = $1 order by updated_at desc limit ${MAX_CHATS}`,
      [userId],
      { idempotent: true },
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      pinned: r.pinned,
      turns: r.turns,
      createdAt: ms(r.created_at),
      updatedAt: ms(r.updated_at),
    }));
  }

  async saveChat(userId: string, chat: StoredChat) {
    await this.db.query(
      `insert into user_chats (user_id, id, title, pinned, turns, created_at, updated_at)
       values ($1, $2, $3, $4, $5::jsonb, $6::timestamptz, $7::timestamptz)
       on conflict (user_id, id) do update set title = excluded.title, pinned = excluded.pinned,
         turns = excluded.turns, updated_at = excluded.updated_at`,
      [
        userId,
        chat.id,
        chat.title,
        chat.pinned,
        JSON.stringify(chat.turns),
        toIso(chat.createdAt),
        toIso(chat.updatedAt),
      ],
    );
    // Keep the newest MAX_CHATS, as the web app does.
    await this.db.query(
      `delete from user_chats where user_id = $1 and id not in (
         select id from user_chats where user_id = $1 order by updated_at desc limit ${MAX_CHATS})`,
      [userId],
    );
  }

  async deleteChat(userId: string, id: string) {
    await this.db.query('delete from user_chats where user_id = $1 and id = $2', [userId, id]);
  }

  async listHistory(userId: string, limit: number) {
    const rows = await this.db.query<{
      kind: HistoryInput['kind'];
      ref: string;
      title: string;
      detail: Record<string, unknown>;
      viewed_at: Ts;
    }>(
      `select kind, ref, title, detail, viewed_at from user_history
       where user_id = $1 order by viewed_at desc limit $2`,
      [userId, Math.min(limit, MAX_HISTORY)],
      { idempotent: true },
    );
    return rows.map((r) => ({
      kind: r.kind,
      ref: r.ref,
      title: r.title,
      detail: r.detail,
      viewedAt: toIso(ms(r.viewed_at)),
    }));
  }

  async addHistory(userId: string, item: HistoryInput, atMs: number) {
    await this.db.query(
      `insert into user_history (user_id, kind, ref, title, detail, viewed_at)
       values ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)
       on conflict (user_id, kind, ref) do update set title = excluded.title,
         detail = excluded.detail, viewed_at = excluded.viewed_at`,
      [userId, item.kind, item.ref, item.title, JSON.stringify(item.detail), toIso(atMs)],
    );
    await this.db.query(
      `delete from user_history where user_id = $1 and (kind, ref) not in (
         select kind, ref from user_history where user_id = $1 order by viewed_at desc limit ${MAX_HISTORY})`,
      [userId],
    );
  }

  // The tables also cascade from users; this covers a store without that link.
  async removeAccountData(userId: string) {
    await this.db.query('delete from user_chats where user_id = $1', [userId]);
    await this.db.query('delete from user_history where user_id = $1', [userId]);
  }

  async removeHistory(userId: string, items?: { kind: string; ref: string }[]) {
    if (!items)
      return void (await this.db.query('delete from user_history where user_id = $1', [userId]));
    if (items.length === 0) return;
    await this.db.query(
      `delete from user_history h using jsonb_to_recordset($2::jsonb) as x(kind text, ref text)
       where h.user_id = $1 and h.kind = x.kind and h.ref = x.ref`,
      [userId, JSON.stringify(items)],
    );
  }
}
