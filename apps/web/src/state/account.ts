/**
 * Who is using the app: a signed-in account or a guest, and the account dialogs. Guests keep
 * nothing after they leave (chats live in memory); accounts keep chats and viewing history on
 * the server (lib/accountSync.ts).
 */
import { create } from 'zustand';
import { account, authClient, signInWithGoogle, type AccountUser } from '../lib/account';
import { api } from '../lib/api';

export type AuthView = 'sign-in' | 'sign-up' | 'verify' | 'profile' | 'forgot';
export type AccountPanel = 'settings' | 'ai' | 'history';

/** "Continue as guest" holds for this visit (tab); the next visit asks again. */
const GUEST_KEY = 'worldlens.guest';
const guestChosen = () => {
  try {
    return sessionStorage.getItem(GUEST_KEY) === '1';
  } catch {
    return false;
  }
};

interface AccountState {
  status: 'loading' | 'guest' | 'signed-in';
  user: AccountUser | null;
  /** The sign-in dialog's view, or closed. */
  dialog: AuthView | null;
  /** Email waiting for its sign-up code (verify view). */
  pendingEmail: string | null;
  /** A note shown on the sign-in view (e.g. after a password reset). */
  notice: string | null;
  panel: AccountPanel | null;
  /** Reads the session: signed in (profile to finish?) or a guest (asked once per visit). */
  load: () => Promise<void>;
  setUser: (u: AccountUser) => void;
  openDialog: (v: AuthView | null, o?: { email?: string; notice?: string }) => void;
  continueAsGuest: () => void;
  setPanel: (p: AccountPanel | null) => void;
  signOut: () => Promise<void>;
}

export const useAccount = create<AccountState>((set) => ({
  status: 'loading',
  user: null,
  dialog: null,
  pendingEmail: null,
  notice: null,
  panel: null,

  load: async () => {
    // Back from Google (?error= / ?signin=failed), or sent here to start it (?signin=google).
    const params = new URLSearchParams(window.location.search);
    const signin = params.get('signin');
    const error = params.get('error');
    if (signin || error) {
      params.delete('signin');
      params.delete('error');
      const query = params.toString();
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}`,
      );
    }
    let user: AccountUser | null = null;
    try {
      user = await account.current();
    } catch {
      // API unreachable: use the app as a guest; the account loads on the next visit.
    }
    if (!user && signin === 'google') {
      const config = await api.config().catch(() => null);
      return signInWithGoogle(config?.auth?.appUrl);
    }
    if (!user && (signin === 'failed' || error)) {
      set({
        status: 'guest',
        user: null,
        dialog: 'sign-in',
        notice: `Google sign-in did not finish${error ? ` (${error.replace(/_/g, ' ').toLowerCase()})` : ''}. Try again.`,
      });
      return;
    }
    if (user) {
      set({ status: 'signed-in', user, dialog: user.needsProfile ? 'profile' : null });
      return;
    }
    set({ status: 'guest', user: null, dialog: guestChosen() ? null : 'sign-in' });
  },

  // Signed in (or the account changed): the dialog closes, unless the profile is still to fill.
  setUser: (user) =>
    set({ status: 'signed-in', user, dialog: user.needsProfile ? 'profile' : null, notice: null }),

  openDialog: (dialog, o = {}) =>
    set((s) => ({
      dialog,
      pendingEmail: o.email ?? s.pendingEmail,
      notice: o.notice ?? null,
    })),

  continueAsGuest: () => {
    try {
      sessionStorage.setItem(GUEST_KEY, '1');
    } catch {
      /* storage unavailable: asked again next visit anyway */
    }
    set({ dialog: null, notice: null });
  },

  setPanel: (panel) => set({ panel }),

  signOut: async () => {
    await authClient.signOut().catch(() => undefined);
    try {
      sessionStorage.setItem(GUEST_KEY, '1');
    } catch {
      /* ignore */
    }
    set({ status: 'guest', user: null, panel: null, dialog: null });
  },
}));
