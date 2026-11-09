/**
 * Sign in, create an account, confirm the emailed code, finish the profile, reset a forgotten
 * password — or continue as a guest. One floating glass dialog (DESIGN.md), one view at a time.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { passwordMinLength, passwordProblem, usernameProblem } from '@worldlens/shared';
import { useConfig } from '../hooks/useData';
import { account, authClient, authMessage, signInWithGoogle } from '../lib/account';
import { useAccount, type AuthView } from '../state/account';
import { Icon } from './ui';

/* ------------------------------------------------------------------ building blocks */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="px-1 text-[11px] text-white/50">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="px-1 text-[11px] text-white/85" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="px-1 text-[11px] text-white/40">{hint}</p>
      ) : null}
    </div>
  );
}

export const INPUT =
  'h-10 w-full min-w-0 rounded-[var(--radius-inner)] bg-white/[0.06] px-3 text-[13px] text-white/90 placeholder:text-white/30 transition-colors focus:bg-white/[0.1] disabled:text-white/35';

export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  disabled,
  testId,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  disabled?: boolean;
  testId?: string;
  autoFocus?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        autoFocus={autoFocus}
        maxLength={128}
        className={`${INPUT} pr-10`}
        data-testid={testId}
      />
      <button
        type="button"
        onClick={() => setShown(!shown)}
        disabled={disabled}
        aria-label={shown ? 'Hide password' : 'Show password'}
        className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-full text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
      >
        <Icon name={shown ? 'eye-off' : 'eye'} className="h-4 w-4" />
      </button>
    </div>
  );
}

/** The rule while typing: 12+ letters, 8+ with a number or a symbol, 6+ with both. */
export function PasswordHint({ value }: { value: string }) {
  if (!value) return <>12+ characters, or 8 with a number or symbol, or 6 with both.</>;
  const problem = passwordProblem(value);
  if (problem) return <>{problem}</>;
  return (
    <>
      {value.length >= passwordMinLength(value) + 4
        ? 'Strong password.'
        : 'Good. Longer is stronger.'}
    </>
  );
}

export function CodeInput({
  id,
  value,
  onChange,
  testId,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  return (
    <input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus
      placeholder="6-digit code"
      className={`${INPUT} tabular tracking-[0.3em]`}
      data-testid={testId ?? 'auth-code'}
    />
  );
}

export function Primary({
  children,
  busy,
  disabled,
  testId,
}: {
  children: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="h-10 w-full rounded-full bg-[var(--active-bg)] text-[13px] text-[var(--active-fg)] transition-colors hover:bg-white disabled:bg-white/[0.08] disabled:text-white/35"
      data-testid={testId}
    >
      {busy ? 'One moment…' : children}
    </button>
  );
}

export function Quiet({
  children,
  onClick,
  testId,
}: {
  children: ReactNode;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-2 py-1 text-[12px] text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white"
      data-testid={testId}
    >
      {children}
    </button>
  );
}

function GoogleButton({ label }: { label: string }) {
  const config = useConfig();
  const available = config.data?.auth?.google ?? false;
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={!available || busy}
        onClick={() => {
          setBusy(true);
          signInWithGoogle(config.data?.auth?.appUrl);
        }}
        className="flex h-10 w-full items-center justify-center gap-2.5 rounded-full border border-white/15 text-[13px] text-white/90 transition-colors hover:bg-white/[0.06] disabled:text-white/35 disabled:hover:bg-transparent"
        data-testid="auth-google"
      >
        {/* Google's mark keeps its colours (Google sign-in branding). */}
        <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden>
          <path
            fill="#FFC107"
            d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"
          />
          <path
            fill="#FF3D00"
            d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
          />
          <path
            fill="#4CAF50"
            d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
          />
          <path
            fill="#1976D2"
            d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z"
          />
        </svg>
        {busy ? 'Opening Google…' : label}
      </button>
      {!available && (
        <p className="px-1 text-center text-[11px] text-white/35">
          Google sign-in is not set up on this server yet.
        </p>
      )}
    </div>
  );
}

function Or() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-white/30" aria-hidden>
      <span className="h-px flex-1 bg-white/10" />
      or
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}

function DevCodeNote() {
  const config = useConfig();
  if (config.data?.auth?.mail !== 'log') return null;
  return (
    <p className="rounded-[var(--radius-inner)] bg-white/[0.04] px-3 py-2 text-[11px] leading-relaxed text-white/45">
      Development server: no email is sent — the code is printed in the API&apos;s console.
    </p>
  );
}

/** After a session starts: the account, then its profile if it is new. */
async function signedIn() {
  const user = await account.current();
  if (user) useAccount.getState().setUser(user);
  return user;
}

/* -------------------------------------------------------------------------- views */

function SignIn() {
  const notice = useAccount((s) => s.notice);
  const open = useAccount((s) => s.openDialog);
  const guest = useAccount((s) => s.continueAsGuest);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const who = login.trim();
    if (!who || !password) return setError('Enter your email or username and your password.');
    setBusy(true);
    setError(null);
    const byEmail = who.includes('@');
    const { error: err } = byEmail
      ? await authClient.signIn.email({ email: who, password })
      : await authClient.signIn.username({ username: who, password });
    if (err) {
      setBusy(false);
      if (err.code === 'EMAIL_NOT_VERIFIED' && byEmail) {
        await authClient.emailOtp.sendVerificationOtp({ email: who, type: 'email-verification' });
        return open('verify', { email: who });
      }
      return setError(authMessage(err, 'Could not sign in.'));
    }
    await signedIn();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-testid="auth-sign-in">
      <Heading title="Sign in to WorldLens" sub="Your AI chats and history, on any device." />
      {notice && <p className="px-1 text-[12px] text-white/80">{notice}</p>}
      <GoogleButton label="Continue with Google" />
      <Or />
      <Field label="Email or username">
        {(id) => (
          <input
            id={id}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            autoFocus
            className={INPUT}
            data-testid="auth-login"
          />
        )}
      </Field>
      <Field label="Password" error={error}>
        {(id) => (
          <PasswordInput
            id={id}
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            testId="auth-password"
          />
        )}
      </Field>
      <div className="-mt-1 flex justify-end">
        <Quiet onClick={() => open('forgot', { email: login.includes('@') ? login.trim() : '' })}>
          Forgot password?
        </Quiet>
      </div>
      <Primary busy={busy} testId="auth-submit">
        Sign in
      </Primary>
      <div className="flex items-center justify-between pt-1">
        <Quiet onClick={() => open('sign-up')} testId="auth-to-sign-up">
          Create an account
        </Quiet>
        <Quiet onClick={guest} testId="auth-guest">
          Continue as guest
        </Quiet>
      </div>
    </form>
  );
}

function SignUp() {
  const open = useAccount((s) => s.openDialog);
  const guest = useAccount((s) => s.continueAsGuest);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) return setError('Enter your email address.');
    const weak = passwordProblem(password);
    if (weak) return setError(weak);
    if (password !== confirm) return setError('The passwords do not match.');
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signUp.email({ email: address, password, name: '' });
    setBusy(false);
    if (err) return setError(authMessage(err, 'Could not create the account.'));
    open('verify', { email: address });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-testid="auth-sign-up">
      <Heading title="Create your account" sub="Keep your AI chats and history." />
      <GoogleButton label="Sign up with Google" />
      <Or />
      <Field label="Email">
        {(id) => (
          <input
            id={id}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            className={INPUT}
            data-testid="auth-email"
          />
        )}
      </Field>
      <Field label="Password" hint={<PasswordHint value={password} />}>
        {(id) => (
          <PasswordInput
            id={id}
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            testId="auth-new-password"
          />
        )}
      </Field>
      <Field label="Confirm password" error={error}>
        {(id) => (
          <PasswordInput
            id={id}
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            testId="auth-confirm-password"
          />
        )}
      </Field>
      <Primary busy={busy} testId="auth-submit">
        Create account
      </Primary>
      <div className="flex items-center justify-between pt-1">
        <Quiet onClick={() => open('sign-in')}>I have an account</Quiet>
        <Quiet onClick={guest}>Continue as guest</Quiet>
      </div>
    </form>
  );
}

function Verify() {
  const email = useAccount((s) => s.pendingEmail) ?? '';
  const open = useAccount((s) => s.openDialog);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return setError('Enter the 6-digit code.');
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.emailOtp.verifyEmail({ email, otp: code });
    if (err) {
      setBusy(false);
      return setError(authMessage(err, 'Could not confirm the code.'));
    }
    if (!(await signedIn())) open('sign-in', { notice: 'Email confirmed. Sign in to continue.' });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-testid="auth-verify">
      <Heading
        title="Check your email"
        sub={
          <>
            We sent a 6-digit code to <span className="text-white/85">{email}</span>. Enter it to
            confirm your address.
          </>
        }
      />
      <Field label="Code" error={error}>
        {(id) => <CodeInput id={id} value={code} onChange={setCode} />}
      </Field>
      <DevCodeNote />
      <Primary busy={busy} testId="auth-submit">
        Confirm email
      </Primary>
      <div className="flex items-center justify-between pt-1">
        <Quiet onClick={() => open('sign-up')}>Use another email</Quiet>
        <Quiet
          onClick={async () => {
            await authClient.emailOtp.sendVerificationOtp({ email, type: 'email-verification' });
            setSent(true);
          }}
        >
          {sent ? 'New code sent' : 'Send a new code'}
        </Quiet>
      </div>
    </form>
  );
}

/** Live check of a username: format here, availability from the API. */
export function useUsernameCheck(value: string, current: string | null) {
  const [state, setState] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => {
    const typed = value.trim();
    if (!typed) return setState(null);
    const problem = usernameProblem(typed);
    if (problem) return setState({ text: problem, ok: false });
    if (current && typed.toLowerCase() === current)
      return setState({ text: 'That is your username.', ok: false });
    setState({ text: 'Checking…', ok: false });
    let live = true;
    const t = setTimeout(async () => {
      try {
        const r = await account.usernameAvailable(typed);
        if (!live) return;
        setState(
          r.available
            ? { text: `@${r.username} is available.`, ok: true }
            : {
                text: r.reason === 'TAKEN' ? `@${r.username} is taken.` : 'Not a valid username.',
                ok: false,
              },
        );
      } catch {
        if (live) setState({ text: 'Could not check it right now.', ok: false });
      }
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [value, current]);
  return state;
}

function Profile() {
  const user = useAccount((s) => s.user);
  const setUser = useAccount((s) => s.setUser);
  const [first, setFirst] = useState(user?.firstName ?? '');
  const [last, setLast] = useState(user?.lastName ?? '');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = useUsernameCheck(username, null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!first.trim()) return setError('Enter your first name.');
    if (!check?.ok) return setError(check?.text ?? 'Choose a username.');
    setBusy(true);
    setError(null);
    try {
      const { user: saved } = await account.saveProfile({
        firstName: first.trim(),
        lastName: last.trim() || null,
        username: username.trim(),
      });
      setUser(saved);
    } catch (err) {
      setBusy(false);
      setError(
        (err as { code?: string }).code === 'USERNAME_TAKEN'
          ? 'That username was just taken.'
          : 'Could not save. Try again.',
      );
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-testid="auth-profile">
      <Heading title="Finish your profile" sub={`Signed in as ${user?.email ?? ''}.`} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="First name">
          {(id) => (
            <input
              id={id}
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              autoComplete="given-name"
              autoFocus
              maxLength={60}
              className={INPUT}
              data-testid="profile-first-name"
            />
          )}
        </Field>
        <Field label="Last name (optional)">
          {(id) => (
            <input
              id={id}
              value={last}
              onChange={(e) => setLast(e.target.value)}
              autoComplete="family-name"
              maxLength={60}
              className={INPUT}
              data-testid="profile-last-name"
            />
          )}
        </Field>
      </div>
      <Field
        label="Username"
        hint={check?.text ?? 'Letters, numbers, "_" and ".". You can change it once a month.'}
        error={error}
      >
        {(id) => (
          <input
            id={id}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            maxLength={30}
            className={INPUT}
            data-testid="profile-username"
          />
        )}
      </Field>
      <Primary busy={busy} disabled={!check?.ok} testId="auth-submit">
        Continue
      </Primary>
    </form>
  );
}

function Forgot() {
  const open = useAccount((s) => s.openDialog);
  const [email, setEmail] = useState(useAccount.getState().pendingEmail ?? '');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter the email of your account.');
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.emailOtp.requestPasswordReset({ email: email.trim() });
    setBusy(false);
    if (err) return setError(authMessage(err, 'Could not send a code.'));
    setStep('code');
  };
  const reset = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return setError('Enter the 6-digit code.');
    const weak = passwordProblem(password);
    if (weak) return setError(weak);
    if (password !== confirm) return setError('The passwords do not match.');
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.emailOtp.resetPassword({
      email: email.trim(),
      otp: code,
      password,
    });
    setBusy(false);
    if (err) return setError(authMessage(err, 'Could not change the password.'));
    open('sign-in', { notice: 'Password changed. Sign in with your new password.' });
  };
  return step === 'email' ? (
    <form onSubmit={send} className="flex flex-col gap-3" data-testid="auth-forgot">
      <Heading title="Forgot your password?" sub="We'll email you a code to choose a new one." />
      <Field label="Email" error={error}>
        {(id) => (
          <input
            id={id}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            className={INPUT}
            data-testid="auth-email"
          />
        )}
      </Field>
      <Primary busy={busy} testId="auth-submit">
        Send code
      </Primary>
      <div className="pt-1">
        <Quiet onClick={() => open('sign-in')}>Back to sign in</Quiet>
      </div>
    </form>
  ) : (
    <form onSubmit={reset} className="flex flex-col gap-3" data-testid="auth-forgot-code">
      <Heading
        title="Choose a new password"
        sub={
          <>
            If <span className="text-white/85">{email.trim()}</span> has an account, a code is on
            its way.
          </>
        }
      />
      <Field label="Code">{(id) => <CodeInput id={id} value={code} onChange={setCode} />}</Field>
      <Field label="New password" hint={<PasswordHint value={password} />}>
        {(id) => (
          <PasswordInput
            id={id}
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            testId="auth-new-password"
          />
        )}
      </Field>
      <Field label="Confirm new password" error={error}>
        {(id) => (
          <PasswordInput
            id={id}
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            testId="auth-confirm-password"
          />
        )}
      </Field>
      <DevCodeNote />
      <Primary busy={busy} testId="auth-submit">
        Change password
      </Primary>
      <div className="pt-1">
        <Quiet onClick={() => setStep('email')}>Send another code</Quiet>
      </div>
    </form>
  );
}

function Heading({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-1 pb-1">
      <h2 id="auth-dialog-title" className="text-[16px] text-white">
        {title}
      </h2>
      {sub && <p className="text-[12px] leading-relaxed text-white/50">{sub}</p>}
    </div>
  );
}

const VIEWS: Record<AuthView, () => ReactNode> = {
  'sign-in': () => <SignIn />,
  'sign-up': () => <SignUp />,
  verify: () => <Verify />,
  profile: () => <Profile />,
  forgot: () => <Forgot />,
};

export function AuthDialog() {
  const view = useAccount((s) => s.dialog);
  const status = useAccount((s) => s.status);
  const close = useAccount((s) => s.openDialog);
  const guest = useAccount((s) => s.continueAsGuest);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!view) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A guest who closes the dialog continues as a guest.
      if (status === 'signed-in') close(null);
      else guest();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, status, close, guest]);
  if (!view) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        className="glass scroll-thin relative max-h-[calc(100dvh-2rem)] w-full max-w-[380px] overflow-y-auto rounded-[var(--radius-outer)] p-5"
        data-label-occluder
        data-testid="auth-dialog"
      >
        <button
          type="button"
          onClick={() => (status === 'signed-in' ? close(null) : guest())}
          aria-label="Close"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
        {VIEWS[view]()}
      </div>
    </div>,
    document.body,
  );
}
