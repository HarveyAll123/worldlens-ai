/**
 * Accounts on the web side: the Better Auth client (sign-in, codes, passwords — /api/auth/*)
 * and the account's own API (/api/me/*: profile, username, chats, viewing history).
 */
import { createAuthClient } from 'better-auth/react';
import { emailOTPClient, usernameClient } from 'better-auth/client/plugins';
import { API_BASE, ApiError } from './api';

export const authClient = createAuthClient({
  baseURL: API_BASE || window.location.origin,
  basePath: '/api/auth',
  plugins: [usernameClient(), emailOTPClient()],
  fetchOptions: { credentials: 'include' },
});

export interface AccountUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  displayUsername: string | null;
  providers: string[];
  hasPassword: boolean;
  /** When the username can next change; null: now. */
  usernameChangeAvailableAt: string | null;
  needsProfile: boolean;
  /** AI settings: the assistant recalls earlier chats / reads the history. */
  aiMemory: boolean;
  aiReadsHistory: boolean;
  /** A new email waiting for its code; the account keeps `email` until then. */
  pendingEmail?: { email: string; expiresAt: string } | null;
}

export interface HistoryItem {
  kind: 'search' | 'event' | 'country';
  ref: string;
  title: string;
  detail: Record<string, unknown>;
  viewedAt: string;
}

async function me<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/api/me${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok)
    throw new ApiError(
      (body.message as string) ?? `Request failed (${res.status})`,
      res.status,
      (body.error as string) ?? null,
    );
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export const account = {
  /** The signed-in account, or null for a guest. */
  async current(): Promise<AccountUser | null> {
    try {
      return (await me<{ user: AccountUser }>('')).user;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },
  saveProfile: (p: { firstName: string; lastName: string | null; username?: string }) =>
    me<{ user: AccountUser }>('/profile', json('POST', p)),
  usernameAvailable: (username: string) =>
    me<{ username: string; available: boolean; reason?: 'INVALID' | 'TAKEN' | 'YOURS' }>(
      `/username/available?username=${encodeURIComponent(username)}`,
    ),
  changeUsername: (username: string) =>
    me<{ user: AccountUser }>('/username', json('POST', { username })),
  setPassword: (newPassword: string) =>
    me<{ ok: true }>('/password', json('POST', { newPassword })),
  cancelEmailChange: () => me<{ ok: true }>('/email-change', { method: 'DELETE' }),
  saveAiSettings: (patch: { aiMemory?: boolean; aiReadsHistory?: boolean }) =>
    me<{ user: AccountUser }>('/ai-settings', json('POST', patch)),
  chats: {
    list: () => me<{ chats: StoredChat[] }>('/chats'),
    save: (chat: StoredChat) =>
      me<{ ok: true }>(`/chats/${encodeURIComponent(chat.id)}`, json('PUT', chat)),
    remove: (id: string) =>
      me<{ ok: true }>(`/chats/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  history: {
    list: () => me<{ items: HistoryItem[] }>('/history?limit=200'),
    add: (item: {
      kind: 'search' | 'event' | 'country';
      ref: string;
      title?: string;
      detail?: object;
    }) => me<{ ok: true }>('/history', json('POST', item)),
    removeMany: (items: { kind: string; ref: string }[]) =>
      me<{ ok: true; removed: number }>('/history/delete', json('POST', { items })),
    remove: (kind: string, ref: string) =>
      me<{ ok: true }>(`/history?kind=${kind}&ref=${encodeURIComponent(ref)}`, {
        method: 'DELETE',
      }),
    clear: () => me<{ ok: true }>('/history', { method: 'DELETE' }),
  },
};

/** A chat as the account stores it (the web app's Chat). */
export interface StoredChat {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  turns: object[];
}

/**
 * Signs in with Google from the app's registered origin: Google returns only there, and the
 * sign-in check stays with the origin it started on (127.0.0.1 and localhost are different
 * sites). Elsewhere the browser first moves to that origin, which then starts it (?signin=google).
 */
export function signInWithGoogle(appUrl?: string): void {
  const home = appUrl ? new URL(appUrl).origin : window.location.origin;
  if (home !== window.location.origin) {
    window.location.href = `${home}/?signin=google`;
    return;
  }
  void authClient.signIn.social({
    provider: 'google',
    callbackURL: `${home}/`,
    errorCallbackURL: `${home}/?signin=failed`,
  });
}

/** A Better Auth error as words for the form; `fallback` when it says nothing useful. */
export function authMessage(
  error: { message?: string; code?: string; status?: number } | null | undefined,
  fallback: string,
): string {
  if (!error) return fallback;
  switch (error.code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
    case 'INVALID_USERNAME_OR_PASSWORD':
      return 'Wrong email, username or password.';
    case 'EMAIL_NOT_VERIFIED':
      return 'Confirm your email first: enter the code we sent you.';
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'An account with this email exists. Sign in instead.';
    case 'INVALID_OTP':
      return 'That code is not right. Check it, or send a new one.';
    case 'OTP_EXPIRED':
      return 'That code has expired. Send a new one.';
    case 'TOO_MANY_ATTEMPTS':
      return 'Too many tries with that code. Send a new one.';
    case 'INVALID_PASSWORD':
      return 'Your current password is not right.';
  }
  if (error.status === 429) return 'Too many tries. Wait a minute and try again.';
  return error.message || fallback;
}
