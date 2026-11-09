/**
 * Top bar: a guest's "Sign in", or a signed-in account's initial with its menu (History,
 * Account, Sign out). A circle per DESIGN.md (avatars are perfect circles).
 */
import { useEffect, useRef, useState } from 'react';
import { useAccount } from '../state/account';
import { Icon } from './ui';

const MENU_ITEM =
  'flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[12.5px] text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white';

export function AccountButton() {
  const status = useAccount((s) => s.status);
  const user = useAccount((s) => s.user);
  const openDialog = useAccount((s) => s.openDialog);
  const setPanel = useAccount((s) => s.setPanel);
  const signOut = useAccount((s) => s.signOut);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (status !== 'signed-in' || !user)
    return (
      <button
        type="button"
        onClick={() => openDialog('sign-in')}
        disabled={status === 'loading'}
        aria-label="Sign in"
        title="Sign in"
        className="grid h-9 w-8 place-items-center rounded-full sm:w-9 text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white md:w-10"
        data-testid="account-button"
      >
        <Icon name="user" className="h-4 w-4 md:h-5 md:w-5" />
      </button>
    );

  const initial = (user.firstName ?? user.username ?? user.email)[0]!.toUpperCase();
  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user.displayUsername ?? user.email}`}
        className={`grid h-9 w-8 place-items-center rounded-full sm:w-9 transition-colors md:w-10 ${
          open ? 'bg-white/[0.12]' : 'hover:bg-white/[0.08]'
        }`}
        data-testid="account-button"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--active-bg)] text-[11px] text-[var(--active-fg)]">
          {initial}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="glass absolute right-0 top-[calc(100%+10px)] z-40 w-[220px] rounded-[16px] p-1.5"
          data-label-occluder
          data-testid="account-menu"
        >
          <div className="px-3 pb-1.5 pt-1">
            <p className="truncate text-[12.5px] text-white/90">{user.name || user.email}</p>
            {user.username && (
              <p className="truncate text-[11px] text-white/45">
                @{user.displayUsername ?? user.username}
              </p>
            )}
          </div>
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM}
            onClick={pick(() => setPanel('history'))}
            data-testid="menu-history"
          >
            <Icon name="clock" className="h-4 w-4 text-white/45" />
            History
          </button>
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM}
            onClick={pick(() => setPanel('settings'))}
            data-testid="menu-settings"
          >
            <Icon name="user" className="h-4 w-4 text-white/45" />
            Account settings
          </button>
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM}
            onClick={pick(() => setPanel('ai'))}
            data-testid="menu-ai-settings"
          >
            <Icon name="sparkle" className="h-4 w-4 text-white/45" />
            AI settings
          </button>
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM}
            onClick={pick(() => void signOut())}
            data-testid="menu-sign-out"
          >
            <Icon name="arrow-left" className="h-4 w-4 text-white/45" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
