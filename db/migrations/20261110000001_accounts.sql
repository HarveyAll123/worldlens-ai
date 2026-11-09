-- Accounts (Better Auth, apps/api/src/auth/auth.ts — column names must match its field mapping):
-- users, their sign-in methods (a password and/or Google), sessions and one-time codes. Then what
-- an account keeps: its AI conversations and the events and countries it opened. Guests have
-- no rows anywhere.

create table if not exists users (
  id                   text primary key,
  name                 text not null,
  email                text not null unique,
  email_verified       boolean not null default false,
  image                text,
  -- Lower-cased by Better Auth's username plugin; display_username keeps the typed form.
  username             text unique,
  display_username     text,
  first_name           text,
  last_name            text,
  -- Last change in account settings: the next one waits a month (apps/api/src/auth).
  username_changed_at  timestamptz,
  -- AI settings: the assistant may recall earlier chats, and read the account's history.
  ai_memory            boolean not null default true,
  ai_reads_history     boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists accounts (
  id                        text primary key,
  account_id                text not null,
  provider_id               text not null,
  user_id                   text not null references users(id) on delete cascade,
  access_token              text,
  refresh_token             text,
  id_token                  text,
  access_token_expires_at   timestamptz,
  refresh_token_expires_at  timestamptz,
  scope                     text,
  -- Password hash of the "credential" provider (email/username and password).
  password                  text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists accounts_user_idx on accounts (user_id);
create unique index if not exists accounts_provider_account_idx on accounts (provider_id, account_id);

create table if not exists sessions (
  id          text primary key,
  token       text not null unique,
  user_id     text not null references users(id) on delete cascade,
  expires_at  timestamptz not null,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions (user_id);

create table if not exists verifications (
  id          text primary key,
  identifier  text not null,
  value       text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists verifications_identifier_idx on verifications (identifier);

-- An account's AI conversations, as the web app keeps them (lib/chats.ts: 30 chats, 40 turns).
create table if not exists user_chats (
  user_id     text not null references users(id) on delete cascade,
  id          text not null check (length(id) <= 64),
  title       text not null check (length(title) <= 200),
  pinned      boolean not null default false,
  turns       jsonb not null default '[]' check (jsonb_typeof(turns) = 'array'),
  created_at  timestamptz not null,
  updated_at  timestamptz not null,
  primary key (user_id, id)
);
create index if not exists user_chats_recent_idx on user_chats (user_id, updated_at desc);

-- What an account searched for and the events and countries it opened (not its AI chats): one
-- row per item, doing it again moves it to the top. The assistant reads it to understand the user.
create table if not exists user_history (
  user_id    text not null references users(id) on delete cascade,
  kind       text not null check (kind in ('search', 'event', 'country')),
  ref        text not null check (length(ref) <= 300),
  title      text not null check (length(title) <= 300),
  -- What reopening needs: a search's chosen result, an event's time and place, or a country's
  -- dated selection.
  detail     jsonb not null default '{}' check (jsonb_typeof(detail) = 'object'),
  viewed_at  timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
create index if not exists user_history_recent_idx on user_history (user_id, viewed_at desc);
