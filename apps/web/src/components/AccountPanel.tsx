/**
 * A signed-in account's window: Account (username, email, password, sign out) and History (the
 * events and countries it opened). Guests have neither. Floating glass dialog (DESIGN.md).
 */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { parseIso, passwordProblem, type Resolution, type SearchResult } from '@worldlens/shared';
import { account, authClient, authMessage, type HistoryItem } from '../lib/account';
import { reopenCountry } from '../lib/countries';
import { relativeTime } from '../lib/format';
import { useAccount, type AccountPanel as Tab } from '../state/account';
import { useAppStore, type CountrySelection, type SearchPick } from '../state/store';
import { applySearchResult } from './TopBar';
import {
  CodeInput,
  Field,
  INPUT,
  PasswordHint,
  PasswordInput,
  Primary,
  Quiet,
  useUsernameCheck,
} from './AuthDialog';
import { Icon } from './ui';

const LIVE_WINDOW_MS = 72 * 3_600_000;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-t border-white/[0.07] pt-4">
      <h3 className="px-1 text-[11px] tracking-[0.08em] text-white/40">{title}</h3>
      {children}
    </section>
  );
}

/** "Make sure" step before a change that cannot be undone at once. */
function Confirm({
  children,
  action,
  onConfirm,
  onCancel,
  busy,
}: {
  children: ReactNode;
  action: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div
      role="alertdialog"
      aria-label="Confirm"
      className="flex flex-col gap-2.5 rounded-[var(--radius-inner)] bg-white/[0.06] p-3"
      data-testid="account-confirm"
    >
      <p className="text-[12.5px] leading-relaxed text-white/85">{children}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="h-9 flex-1 rounded-full bg-[var(--active-bg)] text-[12.5px] text-[var(--active-fg)] transition-colors hover:bg-white disabled:opacity-50"
          data-testid="account-confirm-yes"
        >
          {busy ? 'One moment…' : action}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-full px-4 text-[12.5px] text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const Note = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <p className="px-1 text-[11.5px] leading-relaxed text-white/60" data-testid={testId}>
    {children}
  </p>
);

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

function UsernameSection() {
  const user = useAccount((s) => s.user)!;
  const setUser = useAccount((s) => s.setUser);
  const [value, setValue] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const check = useUsernameCheck(value, user.username);
  const waitUntil = user.usernameChangeAvailableAt;
  const change = async () => {
    setBusy(true);
    try {
      const { user: saved } = await account.changeUsername(value.trim());
      setUser(saved);
      setValue('');
      setMessage(`Your username is now @${saved.displayUsername ?? saved.username}.`);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setMessage(
        code === 'USERNAME_TAKEN'
          ? 'That username was just taken.'
          : code === 'USERNAME_COOLDOWN'
            ? 'You changed your username less than a month ago.'
            : 'Could not change the username.',
      );
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };
  return (
    <Section title="USERNAME">
      <p className="px-1 text-[13px] text-white/90" data-testid="account-username">
        @{user.displayUsername ?? user.username}
      </p>
      {waitUntil ? (
        <Note testId="account-username-wait">
          You can change your username again on {dateOf(waitUntil)}.
        </Note>
      ) : confirming ? (
        <Confirm
          action="Change username"
          busy={busy}
          onConfirm={() => void change()}
          onCancel={() => setConfirming(false)}
        >
          Change your username to{' '}
          <strong className="font-normal text-white">@{value.trim().toLowerCase()}</strong>? You
          won&apos;t be able to change it again for a month.
        </Confirm>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (check?.ok) setConfirming(true);
          }}
          className="flex flex-col gap-2"
        >
          <Field label="New username" hint={check?.text ?? 'You can change it once a month.'}>
            {(id) => (
              <input
                id={id}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setMessage(null);
                }}
                maxLength={30}
                autoComplete="off"
                className={INPUT}
                data-testid="account-new-username"
              />
            )}
          </Field>
          <Primary disabled={!check?.ok} testId="account-change-username">
            Change username
          </Primary>
        </form>
      )}
      {message && <Note>{message}</Note>}
    </Section>
  );
}

function EmailSection() {
  const user = useAccount((s) => s.user)!;
  const setUser = useAccount((s) => s.setUser);
  const [step, setStep] = useState<'idle' | 'enter' | 'confirm' | 'code'>('idle');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // A change waiting for its code, also after a reload (the server knows it for 10 minutes).
  const pending = step === 'code' ? email.trim() : (user.pendingEmail?.email ?? null);
  const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && email.trim().toLowerCase() !== user.email;
  const refresh = async () => {
    const fresh = await account.current();
    if (fresh) setUser(fresh);
    return fresh;
  };
  const sendCode = async () => {
    setBusy(true);
    const { error } = await authClient.emailOtp.requestEmailChange({ newEmail: email.trim() });
    setBusy(false);
    if (error) {
      setStep('enter');
      return setMessage(authMessage(error, 'Could not send a code to that address.'));
    }
    setStep('code');
    setMessage(null);
    void refresh();
  };
  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    if (!pending) return;
    if (code.length !== 6) return setMessage('Enter the 6-digit code.');
    setBusy(true);
    const { error } = await authClient.emailOtp.changeEmail({ newEmail: pending, otp: code });
    setBusy(false);
    if (error) return setMessage(authMessage(error, 'Could not confirm the code.'));
    const fresh = await refresh();
    setStep('idle');
    setEmail('');
    setCode('');
    setMessage(`Your email is now ${fresh?.email ?? pending}.`);
  };
  const cancel = async () => {
    setBusy(true);
    await account.cancelEmailChange().catch(() => undefined);
    await refresh();
    setBusy(false);
    setStep('idle');
    setEmail('');
    setCode('');
    setMessage(`Email change cancelled. Your email stays ${user.email}.`);
  };
  return (
    <Section title="EMAIL">
      <p className="px-1 text-[13px] text-white/90" data-testid="account-email">
        {user.email}
      </p>
      {pending ? (
        <form
          onSubmit={confirm}
          className="flex flex-col gap-2"
          data-testid="account-email-pending"
        >
          <Note>
            Waiting for <span className="text-white/90">{pending}</span>: enter the code we sent
            there. Until then your email stays {user.email}.
          </Note>
          <Field label="Code">
            {(id) => <CodeInput id={id} value={code} onChange={setCode} />}
          </Field>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Primary busy={busy} testId="account-confirm-email">
                Confirm new email
              </Primary>
            </div>
            <Quiet onClick={() => void cancel()} testId="account-cancel-email">
              Cancel change
            </Quiet>
          </div>
        </form>
      ) : step === 'idle' ? (
        <div>
          <Quiet onClick={() => setStep('enter')} testId="account-change-email">
            Change email
          </Quiet>
        </div>
      ) : step === 'enter' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) setStep('confirm');
          }}
          className="flex flex-col gap-2"
        >
          <Field label="New email">
            {(id) => (
              <input
                id={id}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                className={INPUT}
                data-testid="account-new-email"
              />
            )}
          </Field>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Primary disabled={!valid} testId="account-send-email-code">
                Continue
              </Primary>
            </div>
            <Quiet onClick={() => setStep('idle')}>Cancel</Quiet>
          </div>
        </form>
      ) : (
        <Confirm
          action="Send code"
          busy={busy}
          onConfirm={() => void sendCode()}
          onCancel={() => setStep('enter')}
        >
          We&apos;ll send a code to{' '}
          <strong className="font-normal text-white">{email.trim()}</strong>. Your account keeps
          using {user.email} until you enter it, and you can cancel the change until then.
        </Confirm>
      )}
      {message && <Note testId="account-email-message">{message}</Note>}
    </Section>
  );
}

function PasswordSection() {
  const user = useAccount((s) => s.user)!;
  const setUser = useAccount((s) => s.setUser);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  // Forgot the current one: a code sent to the account's email stands in for it.
  const [forgot, setForgot] = useState<'no' | 'sending' | 'sent'>('no');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sendCode = async () => {
    setForgot('sending');
    const { error } = await authClient.emailOtp.requestPasswordReset({ email: user.email });
    if (error) {
      setForgot('no');
      return setMessage(authMessage(error, 'Could not send a code.'));
    }
    setForgot('sent');
    setMessage(null);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const weak = passwordProblem(next);
    if (weak) return setMessage(weak);
    if (next !== again) return setMessage('The new passwords do not match.');
    setBusy(true);
    setMessage(null);
    let error: { message?: string; code?: string; status?: number } | null = null;
    if (!user.hasPassword) {
      try {
        await account.setPassword(next);
      } catch (err) {
        error = { message: (err as Error).message };
      }
    } else if (forgot === 'sent') {
      if (code.length !== 6) {
        setBusy(false);
        return setMessage('Enter the 6-digit code from your email.');
      }
      ({ error } = await authClient.emailOtp.resetPassword({
        email: user.email,
        otp: code,
        password: next,
      }));
    } else {
      if (!current) {
        setBusy(false);
        return setMessage('Enter your current password.');
      }
      ({ error } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      }));
    }
    setBusy(false);
    if (error) return setMessage(authMessage(error, 'Could not change the password.'));
    const hadPassword = user.hasPassword;
    const fresh = await account.current();
    if (fresh) setUser(fresh);
    setCurrent('');
    setNext('');
    setAgain('');
    setCode('');
    setForgot('no');
    setMessage(
      hadPassword
        ? 'Password changed.'
        : 'Password set. You can also sign in with your email and this password now.',
    );
  };
  return (
    <Section title="PASSWORD">
      <form onSubmit={submit} className="flex flex-col gap-2.5">
        {forgot === 'sent' ? (
          <Field label={`Code sent to ${user.email}`}>
            {(id) => (
              <CodeInput id={id} value={code} onChange={setCode} testId="account-password-code" />
            )}
          </Field>
        ) : (
          <Field
            label="Current password"
            hint={
              user.hasPassword
                ? undefined
                : 'You sign in with Google: no password yet. Set one to sign in with your email too.'
            }
          >
            {(id) => (
              <PasswordInput
                id={id}
                value={current}
                onChange={setCurrent}
                autoComplete="current-password"
                disabled={!user.hasPassword}
                testId="account-current-password"
              />
            )}
          </Field>
        )}
        {user.hasPassword && forgot !== 'sent' && (
          <div className="-mt-1">
            <Quiet onClick={() => void sendCode()} testId="account-forgot-password">
              {forgot === 'sending' ? 'Sending a code…' : 'Forgot your current password?'}
            </Quiet>
          </div>
        )}
        <Field label="New password" hint={<PasswordHint value={next} />}>
          {(id) => (
            <PasswordInput
              id={id}
              value={next}
              onChange={setNext}
              autoComplete="new-password"
              testId="account-new-password"
            />
          )}
        </Field>
        <Field label="Confirm new password">
          {(id) => (
            <PasswordInput
              id={id}
              value={again}
              onChange={setAgain}
              autoComplete="new-password"
              testId="account-confirm-password"
            />
          )}
        </Field>
        <Primary busy={busy} testId="account-change-password">
          {user.hasPassword ? 'Change password' : 'Set password'}
        </Primary>
      </form>
      {message && <Note testId="account-password-message">{message}</Note>}
    </Section>
  );
}

/** Deleting the account: always confirmed first, with the password or the username. */
function DeleteSection() {
  const user = useAccount((s) => s.user)!;
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const name = user.username ?? user.email;
  const ready = user.hasPassword
    ? password.length > 0
    : typed.trim().replace(/^@/, '').toLowerCase() === name.toLowerCase();
  const close = () => {
    setOpen(false);
    setPassword('');
    setTyped('');
    setMessage(null);
  };
  const remove = async () => {
    setBusy(true);
    setMessage(null);
    const { error } = await authClient.deleteUser(user.hasPassword ? { password } : {});
    setBusy(false);
    if (error)
      return setMessage(
        error.code === 'INVALID_PASSWORD'
          ? 'That password is not right.'
          : error.code === 'SESSION_EXPIRED' || /fresh/i.test(error.message ?? '')
            ? 'For your safety, sign out and sign in with Google again, then delete your account within a day.'
            : authMessage(error, 'Could not delete the account.'),
      );
    useAccount.setState({ status: 'guest', user: null, panel: null });
    useAccount
      .getState()
      .openDialog('sign-in', { notice: 'Your account and everything it kept were deleted.' });
  };
  return (
    <Section title="DELETE ACCOUNT">
      {!open ? (
        <>
          <Note>Deletes your account, your AI chats and your history for good.</Note>
          <div>
            <Quiet onClick={() => setOpen(true)} testId="account-delete">
              Delete account…
            </Quiet>
          </div>
        </>
      ) : (
        <div
          role="alertdialog"
          aria-label="Delete your account"
          className="flex flex-col gap-2.5 rounded-[var(--radius-inner)] border border-white/15 bg-white/[0.06] p-3"
          data-testid="account-delete-confirm"
        >
          <p className="text-[12.5px] leading-relaxed text-white/90">
            Delete your account permanently? Your profile, AI chats and history will be deleted.
            This cannot be undone.
          </p>
          {user.hasPassword ? (
            <Field label="Enter your password to confirm">
              {(id) => (
                <PasswordInput
                  id={id}
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                  testId="account-delete-password"
                />
              )}
            </Field>
          ) : (
            <Field label={`Type ${user.username ? `@${name}` : name} to confirm`}>
              {(id) => (
                <input
                  id={id}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  className={INPUT}
                  data-testid="account-delete-name"
                />
              )}
            </Field>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!ready || busy}
              onClick={() => void remove()}
              className="h-9 flex-1 rounded-full bg-[var(--active-bg)] text-[12.5px] text-[var(--active-fg)] transition-colors hover:bg-white disabled:bg-white/[0.08] disabled:text-white/35"
              data-testid="account-delete-yes"
            >
              {busy ? 'Deleting…' : 'Delete my account'}
            </button>
            <button
              type="button"
              onClick={close}
              className="h-9 rounded-full px-4 text-[12.5px] text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              Cancel
            </button>
          </div>
          {message && <Note testId="account-delete-message">{message}</Note>}
        </div>
      )}
    </Section>
  );
}

function Settings() {
  const user = useAccount((s) => s.user)!;
  const signOut = useAccount((s) => s.signOut);
  return (
    <div className="flex flex-col gap-4" data-testid="account-settings">
      <div className="flex items-center gap-3 px-1">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.08] text-[15px] text-white">
          {(user.firstName ?? user.email)[0]!.toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] text-white">{user.name || user.email}</p>
          <p className="truncate text-[11.5px] text-white/45">
            {user.providers.includes('google') ? 'Google' : 'Email'} account
          </p>
        </div>
      </div>
      <UsernameSection />
      <EmailSection />
      <PasswordSection />
      <DeleteSection />
      <div className="border-t border-white/[0.07] pt-3">
        <Quiet onClick={() => void signOut()} testId="account-sign-out">
          Sign out
        </Quiet>
      </div>
    </div>
  );
}

/** An on/off switch (DESIGN.md: on is the inverted fill). */
function Switch({
  label,
  hint,
  on,
  onChange,
  busy,
  testId,
}: {
  label: string;
  hint: ReactNode;
  on: boolean;
  onChange: (v: boolean) => void;
  busy: boolean;
  testId: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-inner)] px-1 py-1">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-white/90">{label}</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-white/45">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={busy}
        onClick={() => onChange(!on)}
        className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors duration-150 ease-out disabled:opacity-60 ${
          on ? 'bg-[var(--active-bg)]' : 'bg-white/[0.12]'
        }`}
        data-testid={testId}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full transition-[left,background-color] duration-150 ease-out ${
            on ? 'left-5 bg-[var(--active-fg)]' : 'left-1 bg-white/70'
          }`}
        />
      </button>
    </div>
  );
}

function AiSettings() {
  const user = useAccount((s) => s.user)!;
  const setUser = useAccount((s) => s.setUser);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const save = async (patch: { aiMemory?: boolean; aiReadsHistory?: boolean }) => {
    setBusy(true);
    setMessage(null);
    try {
      const { user: saved } = await account.saveAiSettings(patch);
      setUser(saved);
    } catch {
      setMessage('Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3" data-testid="account-ai">
      <p className="px-1 text-[12px] leading-relaxed text-white/50">
        What the assistant may use to understand you. It also shapes the &ldquo;For you&rdquo;
        shortcuts in Ask AI.
      </p>
      <Switch
        label="Remember my past AI chats"
        hint="The assistant recalls what you asked in earlier conversations."
        on={user.aiMemory}
        busy={busy}
        onChange={(v) => void save({ aiMemory: v })}
        testId="ai-memory"
      />
      <Switch
        label="AI reads my history"
        hint="The assistant sees what you searched and the events and countries you opened."
        on={user.aiReadsHistory}
        busy={busy}
        onChange={(v) => void save({ aiReadsHistory: v })}
        testId="ai-reads-history"
      />
      <p className="px-1 text-[11px] leading-relaxed text-white/35">
        Turning these off does not delete anything: your chats stay in Ask AI and your history in
        the History tab.
      </p>
      {message && <Note>{message}</Note>}
    </div>
  );
}

const PRECISION_TO_RESOLUTION: Record<string, Resolution> = {
  minute: 'hour',
  hour: 'hour',
  day: 'day',
  month: 'month',
  year: 'year',
  decade: 'decade',
  century: 'century',
};

function reopenEvent(id: string, d: Record<string, unknown>) {
  const s = useAppStore.getState();
  const start = typeof d.start === 'string' ? parseIso(d.start) : null;
  if (start !== null && (d.eventKind === 'historical' || Date.now() - start > LIVE_WINDOW_MS))
    s.setTime(start, PRECISION_TO_RESOLUTION[String(d.resolution ?? 'day')] ?? 'day');
  else if (s.mode !== 'live') s.returnToLive();
  s.openEvent(id);
  if (typeof d.lat === 'number' && typeof d.lon === 'number')
    s.flyTo({ lat: d.lat, lon: d.lon, altitudeKm: d.precision === 'city' ? 700 : 2200 });
}

/** Back to what a history item showed: the search's chosen result, the event or the country. */
function reopen(item: HistoryItem) {
  if (item.kind === 'country') return reopenCountry(item.detail as unknown as CountrySelection);
  if (item.kind === 'event') return reopenEvent(item.ref, item.detail);
  const pick = item.detail.result as SearchPick | undefined;
  if (!pick) return;
  if (pick.type === 'COUNTRY' && 'country' in pick)
    return reopenCountry(pick.country as CountrySelection);
  applySearchResult(pick as unknown as SearchResult);
}

type Filter = 'all' | HistoryItem['kind'];
const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['search', 'Searches'],
  ['event', 'Events'],
  ['country', 'Countries'],
];
const keyOf = (i: HistoryItem) => `${i.kind}|${i.ref}`;

function subtitle(i: HistoryItem): string {
  const d = i.detail as {
    result?: { title?: string };
    eventKind?: string;
    place?: string;
    start?: string;
    end?: string | null;
  };
  if (i.kind === 'search')
    return d.result?.title ? `Searched · chose ${d.result.title}` : 'Searched';
  if (i.kind === 'country')
    return `Country${d.start ? ` · ${d.start.slice(0, 4)}–${d.end ? d.end.slice(0, 4) : 'now'}` : ''}`;
  const what = d.eventKind === 'historical' ? 'Historical event' : 'News';
  return [what, d.place].filter(Boolean).join(' · ');
}

const ICON: Record<HistoryItem['kind'], 'search' | 'clock' | 'globe'> = {
  search: 'search',
  event: 'clock',
  country: 'globe',
};

function History() {
  const close = useAccount((s) => s.setPanel);
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Deleting asks first: the selection, or everything.
  const [confirming, setConfirming] = useState<'selected' | 'all' | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    account.history
      .list()
      .then((r) => setItems(r.items))
      .catch(() => setFailed(true));
  }, []);
  if (failed) return <Note>Your history could not be loaded. Try again later.</Note>;
  if (!items) return <Note>Loading…</Note>;
  if (items.length === 0)
    return (
      <div
        className="flex flex-col items-center gap-2 py-8 text-center"
        data-testid="history-empty"
      >
        <Icon name="clock" className="h-5 w-5 text-white/30" />
        <p className="text-[12.5px] text-white/60">Nothing here yet.</p>
        <p className="text-[11px] text-white/35">
          Your searches and the events and countries you open appear here.
        </p>
      </div>
    );
  const q = query.trim().toLowerCase();
  const shown = items.filter(
    (i) =>
      (filter === 'all' || i.kind === filter) &&
      (!q || `${i.title} ${subtitle(i)}`.toLowerCase().includes(q)),
  );
  const toggle = (k: string) => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setSelected(next);
  };
  const remove = async (which: 'selected' | 'all') => {
    setBusy(true);
    try {
      if (which === 'all') {
        await account.history.clear();
        setItems([]);
      } else {
        const gone = items.filter((i) => selected.has(keyOf(i)));
        await account.history.removeMany(gone.map((i) => ({ kind: i.kind, ref: i.ref })));
        setItems(items.filter((i) => !selected.has(keyOf(i))));
      }
      setSelected(new Set());
      setSelecting(false);
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };
  return (
    <div className="flex flex-col gap-2.5" data-testid="history-list">
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-white/35"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your history"
          aria-label="Search your history"
          className={`${INPUT} pl-9`}
          data-testid="history-search"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Show">
        {FILTERS.map(([f, label]) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-2.5 py-1 text-[11.5px] transition-colors ${
              filter === f
                ? 'bg-[var(--active-bg)] text-[var(--active-fg)]'
                : 'text-white/55 hover:bg-white/[0.06] hover:text-white/85'
            }`}
            data-testid={`history-filter-${f}`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto flex items-center">
          {selecting ? (
            <>
              <Quiet
                onClick={() => selected.size > 0 && setConfirming('selected')}
                testId="history-delete-selected"
              >
                Delete selected ({selected.size})
              </Quiet>
              <Quiet
                onClick={() => {
                  setSelecting(false);
                  setSelected(new Set());
                }}
              >
                Done
              </Quiet>
            </>
          ) : (
            <>
              <Quiet onClick={() => setSelecting(true)} testId="history-select">
                Select
              </Quiet>
              <Quiet onClick={() => setConfirming('all')} testId="history-delete-all">
                Delete all
              </Quiet>
            </>
          )}
        </span>
      </div>
      {confirming && (
        <Confirm
          action={confirming === 'all' ? 'Delete all' : `Delete ${selected.size}`}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void remove(confirming)}
        >
          {confirming === 'all'
            ? `Delete your whole history (${items.length} ${items.length === 1 ? 'item' : 'items'})? This cannot be undone.`
            : `Delete ${selected.size} selected ${selected.size === 1 ? 'item' : 'items'} from your history? This cannot be undone.`}
        </Confirm>
      )}
      {shown.length === 0 ? (
        <Note>Nothing in your history matches.</Note>
      ) : (
        <ul className="flex flex-col">
          {shown.map((item) => {
            const k = keyOf(item);
            return (
              <li key={k} className="border-b border-white/[0.05] last:border-0">
                <button
                  type="button"
                  role={selecting ? 'checkbox' : undefined}
                  aria-checked={selecting ? selected.has(k) : undefined}
                  onClick={() => {
                    if (selecting) return toggle(k);
                    reopen(item);
                    close(null);
                  }}
                  className={`flex w-full min-w-0 items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-white/[0.05] ${
                    selecting && selected.has(k) ? 'bg-white/[0.07]' : ''
                  }`}
                  data-testid="history-item"
                >
                  {selecting ? (
                    <span
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                        selected.has(k)
                          ? 'border-transparent bg-[var(--active-bg)] text-[var(--active-fg)]'
                          : 'border-white/30'
                      }`}
                      aria-hidden
                    >
                      {selected.has(k) && <Icon name="check" className="h-3 w-3" />}
                    </span>
                  ) : (
                    <Icon name={ICON[item.kind]} className="h-4 w-4 shrink-0 text-white/40" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] text-white/90">
                      {item.kind === 'search' ? `“${item.title}”` : item.title}
                    </span>
                    <span className="block truncate text-[10.5px] text-white/40">
                      {subtitle(item)} · {relativeTime(item.viewedAt)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AccountPanel() {
  const tab = useAccount((s) => s.panel);
  const user = useAccount((s) => s.user);
  const setTab = useAccount((s) => s.setPanel);
  useEffect(() => {
    if (!tab) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setTab(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, setTab]);
  if (!tab || !user) return null;
  const tabButton = (t: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === t}
      onClick={() => setTab(t)}
      className={`rounded-full px-3 py-1 text-[12px] transition-colors ${
        tab === t
          ? 'bg-[var(--active-bg)] text-[var(--active-fg)]'
          : 'text-white/55 hover:bg-white/[0.06] hover:text-white/85'
      }`}
      data-testid={`account-tab-${t}`}
    >
      {label}
    </button>
  );
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4"
      onPointerDown={(e) => e.target === e.currentTarget && setTab(null)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your account"
        className="glass scroll-thin relative max-h-[calc(100dvh-2rem)] w-full max-w-[420px] overflow-y-auto rounded-[var(--radius-outer)] p-5"
        data-label-occluder
        data-testid="account-panel"
      >
        <div className="mb-4 flex items-center gap-1" role="tablist" aria-label="Account">
          {tabButton('settings', 'Account')}
          {tabButton('ai', 'AI')}
          {tabButton('history', 'History')}
          <button
            type="button"
            onClick={() => setTab(null)}
            aria-label="Close"
            className="ml-auto grid h-8 w-8 place-items-center rounded-full text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
        {tab === 'settings' ? <Settings /> : tab === 'ai' ? <AiSettings /> : <History />}
      </div>
    </div>,
    document.body,
  );
}
