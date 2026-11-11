/**
 * Accounts: Better Auth, hosted in this API under /api/auth, users and sessions in PostgreSQL
 * (in memory without a database — development and tests only).
 *
 * Sign in with Google, or with an email or username and a password. A new email account is
 * confirmed with a 6-digit emailed code before it can sign in, then picks a username (unique)
 * and gives a first name and, optionally, a last name. Codes also reset a forgotten password
 * and confirm a new email address, which replaces the old one only once confirmed. Usernames
 * change in account settings, once a month (see account-routes.ts). Guests use the app without
 * an account; nothing of theirs is stored.
 */
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { memoryAdapter, type MemoryDB } from 'better-auth/adapters/memory';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { emailOTP, username } from 'better-auth/plugins';
import {
  normalizeUsername,
  passwordProblem,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_COOLDOWN_MS,
  USERNAME_PATTERN,
} from '@worldlens/shared';
import { codeMail, type CodePurpose, type Mailer } from '../lib/mailer';

export { normalizeUsername, USERNAME_COOLDOWN_MS, USERNAME_PATTERN };

/** Better Auth routes that take a new password, and the body field that carries it. */
const NEW_PASSWORD_FIELD: Record<string, string> = {
  '/sign-up/email': 'password',
  '/change-password': 'newPassword',
  '/set-password': 'newPassword',
  '/reset-password': 'newPassword',
  '/email-otp/reset-password': 'password',
};

export interface AuthSetup {
  secret: string;
  /** The origin the browser sees the API at (PUBLIC_APP_URL; /api is proxied to the API). */
  baseURL: string;
  trustedOrigins: string[];
  google: { clientId: string; clientSecret: string } | null;
  mailer: Mailer;
  /** A pg-compatible Pool; null keeps accounts in `memory` (lost on restart). */
  pool: unknown | null;
  memory?: MemoryDB;
  secureCookies: boolean;
  /** Runs work after the response (Worker waitUntil); emails are not awaited (timing). */
  defer?: (p: Promise<unknown>) => void;
  /** After an account is deleted: remove what it kept (chats, history). */
  onUserDeleted?: (userId: string) => Promise<void>;
  /**
   * A new instance for every request (the Worker): Better Auth would check the database schema
   * again for each one before answering. The schema is ours (db/migrations), so skip it.
   */
  perRequest?: boolean;
}

export const emptyMemory = (): MemoryDB => ({
  users: [],
  sessions: [],
  accounts: [],
  verifications: [],
});

export function authOptions(s: AuthSetup) {
  const sendCode = (email: string, otp: string, type: CodePurpose) => {
    const sent = s.mailer.send(codeMail(email, otp, type)).catch((err: unknown) => {
      console.error(`[auth] could not send the ${type} email:`, (err as Error).message);
    });
    if (s.defer) s.defer(sent);
  };
  return {
    appName: 'WorldLens',
    baseURL: s.baseURL,
    basePath: '/api/auth',
    secret: s.secret,
    trustedOrigins: s.trustedOrigins,
    database: (s.pool ?? memoryAdapter(s.memory ?? emptyMemory())) as BetterAuthOptions['database'],
    user: {
      modelName: 'users',
      // Deleting needs the password, or (Google-only accounts) a sign-in within the last day.
      deleteUser: {
        enabled: true,
        afterDelete: async (user: { id: string }) => {
          await s.onUserDeleted?.(user.id);
        },
      },
      fields: { emailVerified: 'email_verified', createdAt: 'created_at', updatedAt: 'updated_at' },
      additionalFields: {
        firstName: { type: 'string', required: false, fieldName: 'first_name' },
        lastName: { type: 'string', required: false, fieldName: 'last_name' },
        usernameChangedAt: {
          type: 'date',
          required: false,
          input: false,
          fieldName: 'username_changed_at',
        },
        // AI settings (account settings → AI): changed through /api/me/ai-settings only.
        aiMemory: {
          type: 'boolean',
          required: false,
          defaultValue: true,
          input: false,
          fieldName: 'ai_memory',
        },
        aiReadsHistory: {
          type: 'boolean',
          required: false,
          defaultValue: true,
          input: false,
          fieldName: 'ai_reads_history',
        },
      },
    },
    session: {
      modelName: 'sessions',
      expiresIn: 30 * 24 * 3600,
      updateAge: 24 * 3600,
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
        userId: 'user_id',
      },
    },
    account: {
      modelName: 'accounts',
      fields: {
        accountId: 'account_id',
        providerId: 'provider_id',
        userId: 'user_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
      // Google confirms the address: signing in with Google joins the account with that email.
      accountLinking: { enabled: true, trustedProviders: ['google'] },
    },
    verification: {
      modelName: 'verifications',
      fields: { expiresAt: 'expires_at', createdAt: 'created_at', updatedAt: 'updated_at' },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
    },
    emailVerification: { autoSignInAfterVerification: true },
    ...(s.google
      ? {
          socialProviders: {
            google: {
              clientId: s.google.clientId,
              clientSecret: s.google.clientSecret,
              prompt: 'select_account' as const,
              mapProfileToUser: (p: { given_name?: string; family_name?: string }) => ({
                firstName: p.given_name ?? null,
                lastName: p.family_name ?? null,
              }),
            },
          },
        }
      : {}),
    // Codes confirm an address, reset a password or change the email; they never sign in alone.
    disabledPaths: ['/sign-in/email-otp'],
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/*': { window: 60, max: 10 },
        '/sign-up/*': { window: 60, max: 5 },
        '/email-otp/*': { window: 60, max: 6 },
        '/change-password': { window: 60, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: 'worldlens',
      useSecureCookies: s.secureCookies,
      ...(s.perRequest ? { database: { validateSchema: false } } : {}),
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const body = ctx.body as Record<string, unknown> | undefined;
        // Long and not repetitive (no uppercase, digits or symbols required).
        const field = NEW_PASSWORD_FIELD[ctx.path];
        const password = field ? body?.[field] : undefined;
        const weak = typeof password === 'string' ? passwordProblem(password) : null;
        if (weak) throw new APIError('BAD_REQUEST', { code: 'WEAK_PASSWORD', message: weak });
        // Usernames change only through account settings, which keep the once-a-month rule.
        if (
          ctx.path === '/update-user' &&
          body &&
          ('username' in body || 'displayUsername' in body)
        )
          throw new APIError('BAD_REQUEST', {
            message: 'Change the username in account settings.',
          });
      }),
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
        usernameValidator: (u) => USERNAME_PATTERN.test(u),
        validationOrder: { username: 'post-normalization' },
        schema: { user: { fields: { displayUsername: 'display_username' } } },
      }),
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        sendVerificationOnSignUp: true,
        overrideDefaultEmailVerification: true,
        disableSignUp: true,
        changeEmail: { enabled: true },
        sendVerificationOTP: async ({ email, otp, type }) => sendCode(email, otp, type),
      }),
    ],
  } satisfies BetterAuthOptions;
}

export function createAuth(s: AuthSetup) {
  return betterAuth(authOptions(s));
}

export type Auth = ReturnType<typeof createAuth>;
