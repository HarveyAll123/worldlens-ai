/**
 * /api/auth/* — Better Auth (sign-up, sign-in with password or Google, codes, sessions) — and
 * /api/me/* — a signed-in account's profile, username, password, AI chats and viewing history.
 * Every /api/me route answers 401 to guests, who keep nothing on the server.
 */
import type { Context, Hono } from 'hono';
import { APIError } from 'better-auth/api';
import { z } from 'zod';
import { passwordProblem, toIso } from '@worldlens/shared';
import {
  HistoryInputSchema,
  HistoryKindSchema,
  MAX_HISTORY,
  StoredChatSchema,
} from '../data/account-store';
import type { PersonalUser } from '../ai/personal';
import type { AppDeps } from '../deps';
import { normalizeUsername, USERNAME_COOLDOWN_MS, USERNAME_PATTERN, type Auth } from './auth';

type Defer = (p: Promise<unknown>) => void;
type Env = { Variables: { defer: Defer } };

/** The user fields /api/me/* reads (Better Auth's user plus our additional fields). */
interface AccountUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image?: string | null;
  username?: string | null;
  displayUsername?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  usernameChangedAt?: Date | string | null;
  aiMemory?: boolean | null;
  aiReadsHistory?: boolean | null;
}

const NAME = z.string().trim().min(1, 'Enter your first name.').max(60);
const LAST_NAME = z.string().trim().max(60).optional().nullable();
const ProfileSchema = z.object({
  firstName: NAME,
  lastName: LAST_NAME,
  username: z.string().max(60).optional(),
});
const UsernameSchema = z.object({ username: z.string().max(60) });
const PasswordSchema = z.object({ newPassword: z.string().max(128) });
/** A chat's JSON may not exceed this (30 chats × 40 turns fit comfortably). */
const MAX_CHAT_BYTES = 512_000;

const changedAt = (u: AccountUser) =>
  u.usernameChangedAt ? new Date(u.usernameChangedAt).getTime() : null;

export function publicUser(u: AccountUser, providers: string[], nowMs: number) {
  const changed = changedAt(u);
  const nextChange = changed !== null ? changed + USERNAME_COOLDOWN_MS : null;
  return {
    id: u.id,
    email: u.email,
    emailVerified: u.emailVerified,
    name: u.name,
    image: u.image ?? null,
    firstName: u.firstName ?? null,
    lastName: u.lastName ?? null,
    username: u.username ?? null,
    displayUsername: u.displayUsername ?? u.username ?? null,
    providers,
    hasPassword: providers.includes('credential'),
    /** When the username can next be changed; null: now. */
    usernameChangeAvailableAt: nextChange !== null && nextChange > nowMs ? toIso(nextChange) : null,
    /** A new account still picks a username and gives its name. */
    needsProfile: !u.username || !u.firstName,
    /** AI settings: recall earlier chats; read the account's history. */
    aiMemory: u.aiMemory !== false,
    aiReadsHistory: u.aiReadsHistory !== false,
  };
}

/** Why a username cannot be had, or null when it is free. */
async function usernameProblem(
  auth: Auth,
  username: string,
  selfId: string,
): Promise<'INVALID' | 'TAKEN' | null> {
  if (!USERNAME_PATTERN.test(username)) return 'INVALID';
  const ctx = await auth.$context;
  const owner = await ctx.adapter.findOne<{ id: string }>({
    model: 'user',
    where: [{ field: 'username', value: username }],
  });
  return owner && owner.id !== selfId ? 'TAKEN' : null;
}

/** A change of email waiting for its code (emailOTP stores it as change-email-otp-<user>:<new>). */
const pendingPrefix = (userId: string) => `change-email-otp-${userId}:`;

async function pendingEmail(auth: Auth, userId: string, nowMs: number) {
  const ctx = await auth.$context;
  const rows = await ctx.adapter.findMany<{ identifier: string; expiresAt: Date; createdAt: Date }>(
    {
      model: 'verification',
      where: [{ field: 'identifier', operator: 'starts_with', value: pendingPrefix(userId) }],
    },
  );
  const live = rows
    .filter((r) => new Date(r.expiresAt).getTime() > nowMs)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  return live
    ? {
        email: live.identifier.slice(pendingPrefix(userId).length),
        expiresAt: toIso(new Date(live.expiresAt).getTime()),
      }
    : null;
}

/** The signed-in account and its AI settings for this request, or null for a guest. */
export async function signedInUser(
  deps: AppDeps,
  headers: Headers,
  defer: Defer,
): Promise<PersonalUser | null> {
  const { auth, release } = deps.auth.get();
  defer(release());
  try {
    const user = (await auth.api.getSession({ headers }))?.user as AccountUser | undefined;
    return user
      ? {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.displayUsername ?? user.username,
          aiMemory: user.aiMemory,
          aiReadsHistory: user.aiReadsHistory,
        }
      : null;
  } catch {
    return null;
  }
}

const AiSettingsSchema = z
  .object({ aiMemory: z.boolean().optional(), aiReadsHistory: z.boolean().optional() })
  .refine((v) => v.aiMemory !== undefined || v.aiReadsHistory !== undefined, 'Nothing to change');

const HistoryDeleteSchema = z.object({
  items: z
    .array(z.object({ kind: HistoryKindSchema, ref: z.string().min(1).max(300) }))
    .min(1)
    .max(MAX_HISTORY),
});

const isUniqueViolation = (err: unknown) =>
  (err as { code?: unknown } | null)?.code === '23505' ||
  /unique|duplicate/i.test((err as Error)?.message ?? '');

export function registerAccountRoutes(app: Hono<Env>, deps: AppDeps): void {
  const now = () => deps.now();

  /** The request's auth instance; on the Worker its database pool ends after the response. */
  const authFor = (c: Context<Env>) => {
    const { auth, release } = deps.auth.get();
    c.get('defer')(release());
    return auth;
  };

  /** The signed-in account, or a 401 response for guests. */
  const account = async (c: Context<Env>) => {
    const auth = authFor(c);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.header('Cache-Control', 'private, no-store');
    if (!session) return { auth, user: null, error: c.json({ error: 'SIGNED_OUT' }, 401) };
    return { auth, user: session.user as unknown as AccountUser, error: null };
  };

  const providersOf = async (auth: Auth, headers: Headers) =>
    (await auth.api.listUserAccounts({ headers })).map((a) => a.providerId);

  app.on(['GET', 'POST'], '/api/auth/*', (c) => authFor(c).handler(c.req.raw));

  app.get('/api/me', async (c) => {
    const { auth, user, error } = await account(c);
    if (!user) return error;
    return c.json({
      user: {
        ...publicUser(user, await providersOf(auth, c.req.raw.headers), now()),
        pendingEmail: await pendingEmail(auth, user.id, now()),
      },
    });
  });

  // AI settings: whether the assistant recalls earlier chats and reads the history.
  app.post('/api/me/ai-settings', async (c) => {
    const { auth, user, error } = await account(c);
    if (!user) return error;
    const patch = AiSettingsSchema.parse(await c.req.json());
    await (await auth.$context).internalAdapter.updateUser(user.id, patch);
    const fresh = { ...user, ...patch };
    return c.json({ user: publicUser(fresh, await providersOf(auth, c.req.raw.headers), now()) });
  });

  // A new email still waiting for its code: cancelled, the code stops working.
  app.delete('/api/me/email-change', async (c) => {
    const { auth, user, error } = await account(c);
    if (!user) return error;
    const ctx = await auth.$context;
    await ctx.adapter.deleteMany({
      model: 'verification',
      where: [{ field: 'identifier', operator: 'starts_with', value: pendingPrefix(user.id) }],
    });
    return c.json({ ok: true });
  });

  // Finishing sign-up: name, optional last name, and the first username (no waiting period).
  app.post('/api/me/profile', async (c) => {
    const { auth, user, error } = await account(c);
    if (!user) return error;
    const body = ProfileSchema.parse(await c.req.json());
    const patch: Record<string, unknown> = {
      firstName: body.firstName,
      lastName: body.lastName || null,
      name: [body.firstName, body.lastName].filter(Boolean).join(' '),
    };
    if (body.username !== undefined && !user.username) {
      const username = normalizeUsername(body.username);
      const problem = await usernameProblem(auth, username, user.id);
      if (problem) return c.json({ error: `USERNAME_${problem}` }, problem === 'TAKEN' ? 409 : 400);
      Object.assign(patch, { username, displayUsername: body.username.trim() });
    } else if (!user.username) return c.json({ error: 'USERNAME_REQUIRED' }, 400);
    const ctx = await auth.$context;
    try {
      await ctx.internalAdapter.updateUser(user.id, patch);
    } catch (err) {
      if (isUniqueViolation(err)) return c.json({ error: 'USERNAME_TAKEN' }, 409);
      throw err;
    }
    const fresh = { ...user, ...patch } as AccountUser;
    return c.json({ user: publicUser(fresh, await providersOf(auth, c.req.raw.headers), now()) });
  });

  app.get('/api/me/username/available', async (c) => {
    const { auth, user, error } = await account(c);
    if (!user) return error;
    const username = normalizeUsername(c.req.query('username') ?? '');
    if (username === user.username) return c.json({ username, available: false, reason: 'YOURS' });
    const problem = await usernameProblem(auth, username, user.id);
    return c.json({ username, available: !problem, ...(problem ? { reason: problem } : {}) });
  });

  // A change in account settings: free, unique, and at most once a month.
  app.post('/api/me/username', async (c) => {
    const { auth, user, error } = await account(c);
    if (!user) return error;
    const typed = UsernameSchema.parse(await c.req.json()).username.trim();
    const username = normalizeUsername(typed);
    if (!user.username) return c.json({ error: 'PROFILE_INCOMPLETE' }, 400);
    if (username === user.username) return c.json({ error: 'USERNAME_SAME' }, 400);
    const changed = changedAt(user);
    if (changed !== null && now() - changed < USERNAME_COOLDOWN_MS)
      return c.json(
        { error: 'USERNAME_COOLDOWN', availableAt: toIso(changed + USERNAME_COOLDOWN_MS) },
        429,
      );
    const problem = await usernameProblem(auth, username, user.id);
    if (problem) return c.json({ error: `USERNAME_${problem}` }, problem === 'TAKEN' ? 409 : 400);
    const patch = { username, displayUsername: typed, usernameChangedAt: new Date(now()) };
    try {
      await (await auth.$context).internalAdapter.updateUser(user.id, patch);
    } catch (err) {
      if (isUniqueViolation(err)) return c.json({ error: 'USERNAME_TAKEN' }, 409);
      throw err;
    }
    const fresh = { ...user, ...patch };
    return c.json({ user: publicUser(fresh, await providersOf(auth, c.req.raw.headers), now()) });
  });

  // An account without a password (Google) sets one; then it can sign in with email and password.
  app.post('/api/me/password', async (c) => {
    const { auth, user, error } = await account(c);
    if (!user) return error;
    const { newPassword } = PasswordSchema.parse(await c.req.json());
    const weak = passwordProblem(newPassword);
    if (weak) return c.json({ error: 'WEAK_PASSWORD', message: weak }, 400);
    try {
      await auth.api.setPassword({ body: { newPassword }, headers: c.req.raw.headers });
    } catch (err) {
      if (err instanceof APIError)
        return c.json({ error: 'PASSWORD_ALREADY_SET', message: err.message }, 409);
      throw err;
    }
    return c.json({ ok: true });
  });

  /* ------------------------------------------------------------------ AI chats */

  app.get('/api/me/chats', async (c) => {
    const { user, error } = await account(c);
    if (!user) return error;
    return c.json({ chats: await deps.accounts.listChats(user.id) });
  });

  app.put('/api/me/chats/:id', async (c) => {
    const { user, error } = await account(c);
    if (!user) return error;
    const text = await c.req.text();
    if (text.length > MAX_CHAT_BYTES) return c.json({ error: 'CHAT_TOO_LARGE' }, 413);
    const chat = StoredChatSchema.parse(JSON.parse(text));
    if (chat.id !== c.req.param('id')) return c.json({ error: 'INVALID_REQUEST' }, 400);
    await deps.accounts.saveChat(user.id, chat);
    return c.json({ ok: true });
  });

  app.delete('/api/me/chats/:id', async (c) => {
    const { user, error } = await account(c);
    if (!user) return error;
    await deps.accounts.deleteChat(user.id, c.req.param('id'));
    return c.json({ ok: true });
  });

  /* ------------------------------------------------------------- viewing history */

  app.get('/api/me/history', async (c) => {
    const { user, error } = await account(c);
    if (!user) return error;
    const limit = Math.min(MAX_HISTORY, Math.max(1, Number(c.req.query('limit') ?? 100) || 100));
    return c.json({ items: await deps.accounts.listHistory(user.id, limit) });
  });

  app.post('/api/me/history', async (c) => {
    const { user, error } = await account(c);
    if (!user) return error;
    const input = HistoryInputSchema.parse(await c.req.json());
    if (JSON.stringify(input.detail).length > 20_000) return c.json({ error: 'TOO_LARGE' }, 413);
    let { title, detail, ref } = input;
    // A search is one entry per query, whatever its case; the chosen result is its detail.
    if (input.kind === 'search') ref = ref.trim().toLowerCase().slice(0, 200);
    // An event is recorded by id: its title, time and place come from the events themselves.
    if (input.kind === 'event') {
      const e = await deps.repo.getEvent(input.ref, now());
      if (!e) return c.json({ error: 'NOT_FOUND' }, 404);
      title = e.title.slice(0, 300);
      detail = {
        eventKind: e.kind,
        start: e.time.start,
        resolution: e.time.precision,
        place: e.location.name,
        lat: e.location.lat,
        lon: e.location.lon,
        precision: e.location.precision,
      };
    }
    if (!title) return c.json({ error: 'INVALID_REQUEST', message: 'title is required' }, 400);
    await deps.accounts.addHistory(user.id, { kind: input.kind, ref, title, detail }, now());
    return c.json({ ok: true });
  });

  app.delete('/api/me/history', async (c) => {
    const { user, error } = await account(c);
    if (!user) return error;
    const kind = c.req.query('kind');
    const ref = c.req.query('ref');
    await deps.accounts.removeHistory(user.id, kind && ref ? [{ kind, ref }] : undefined);
    return c.json({ ok: true });
  });

  // Several items at once (the history's selection).
  app.post('/api/me/history/delete', async (c) => {
    const { user, error } = await account(c);
    if (!user) return error;
    const { items } = HistoryDeleteSchema.parse(await c.req.json());
    await deps.accounts.removeHistory(user.id, items);
    return c.json({ ok: true, removed: items.length });
  });

  /* ------------------------------------------------- TEST-ONLY (Playwright, Node) */

  const mailbox = deps.testMailbox;
  if (mailbox)
    app.get('/api/test/mail', (c) => {
      const mail = mailbox.last(c.req.query('to') ?? '');
      if (!mail) return c.json({ error: 'NOT_FOUND' }, 404);
      return c.json({ ...mail, code: /\b(\d{6})\b/.exec(mail.text)?.[1] ?? null });
    });
}
