import { database } from "@/lib/db/client";
import { hashPassword, randomToken, tokenHash, verifyPassword } from "./auth-crypto";
import { sessionMaxAgeSeconds } from "./auth-config";
import type { UserPermission } from "./permissions";

type UserRow = {
  id: string;
  email: string;
  email_normalized: string;
  display_name: string | null;
  password_hash: string | null;
  email_verified_at: number | null;
  permission: UserPermission;
};

type SessionUser = Pick<UserRow, "id" | "email" | "display_name" | "email_verified_at" | "permission">;

export type AuthenticatedUser = SessionUser;

const sessionLifetimeMs = sessionMaxAgeSeconds * 1_000;
const emailTokenLifetimes: Record<AuthEmailTokenPurpose, number> = {
  "email-verification": 30 * 60 * 1_000,
  "password-reset": 15 * 60 * 1_000,
  "account-deletion": 5 * 60 * 1_000,
};

type AuthEmailTokenPurpose = "email-verification" | "password-reset" | "account-deletion";

export const normalizeEmail = (email: string) => email.trim().toLocaleLowerCase("en-US");

async function userByEmail(email: string): Promise<UserRow | null> {
  return database()
    .prepare(
      "SELECT id, email, email_normalized, display_name, password_hash, email_verified_at, permission FROM users WHERE email_normalized=?",
    )
    .bind(normalizeEmail(email))
    .first<UserRow>();
}

async function createUser({
  email,
  passwordHash = null,
  displayName = null,
  emailVerifiedAt = null,
}: {
  email: string;
  passwordHash?: string | null;
  displayName?: string | null;
  emailVerifiedAt?: number | null;
}): Promise<UserRow> {
  const now = Date.now();
  const user: UserRow = {
    id: crypto.randomUUID(),
    email,
    email_normalized: normalizeEmail(email),
    display_name: displayName,
    password_hash: passwordHash,
    email_verified_at: emailVerifiedAt,
    permission: "user",
  };
  await database()
    .prepare(
      "INSERT INTO users (id, email, email_normalized, display_name, password_hash, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      user.id,
      user.email,
      user.email_normalized,
      user.display_name,
      user.password_hash,
      user.email_verified_at,
      now,
      now,
    )
    .run();
  return user;
}

export async function consumeRateLimit({
  scope,
  subjectHash,
  limit,
  windowMs,
}: {
  scope: string;
  subjectHash: string;
  limit: number;
  windowMs: number;
}): Promise<boolean> {
  const DB = database();
  const now = Date.now();
  const windowStartThreshold = now - windowMs;
  const consumed = await DB.prepare(
    `INSERT INTO auth_rate_limits (scope, subject_hash, window_started_at, count)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(scope, subject_hash) DO UPDATE SET
       window_started_at=CASE
         WHEN auth_rate_limits.window_started_at <= ? THEN excluded.window_started_at
         ELSE auth_rate_limits.window_started_at
       END,
       count=CASE
         WHEN auth_rate_limits.window_started_at <= ? THEN 1
         ELSE auth_rate_limits.count + 1
       END
     WHERE auth_rate_limits.window_started_at <= ? OR auth_rate_limits.count < ?
     RETURNING count`,
  )
    .bind(
      scope,
      subjectHash,
      now,
      windowStartThreshold,
      windowStartThreshold,
      windowStartThreshold,
      limit,
    )
    .first<{ count: number }>();
  return consumed !== null;
}

export async function registerWithPassword({ email, password }: { email: string; password: string }) {
  const normalizedEmail = normalizeEmail(email);
  if (await userByEmail(normalizedEmail)) throw new Error("ACCOUNT_EXISTS");
  const user = await createUser({
    email: normalizedEmail,
    passwordHash: await hashPassword(password),
  });
  return user;
}

async function createAuthEmailToken(userId: string, purpose: AuthEmailTokenPurpose): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  const DB = database();
  await DB.prepare("DELETE FROM auth_email_tokens WHERE user_id=? AND purpose=?")
    .bind(userId, purpose)
    .run();
  await DB.prepare(
    "INSERT INTO auth_email_tokens (id, user_id, token_hash, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), userId, tokenHash(token), purpose, now + emailTokenLifetimes[purpose], now)
    .run();
  return token;
}

export async function createEmailVerificationToken(userId: string) {
  return createAuthEmailToken(userId, "email-verification");
}

export async function createEmailVerificationTokenForEmail(email: string) {
  const user = await userByEmail(email);
  if (!user || user.email_verified_at) return null;
  return { email: user.email, token: await createEmailVerificationToken(user.id) };
}

export async function createPasswordResetToken(email: string): Promise<string | null> {
  const user = await userByEmail(email);
  return user ? createAuthEmailToken(user.id, "password-reset") : null;
}

export function createAccountDeletionToken(userId: string): Promise<string> {
  return createAuthEmailToken(userId, "account-deletion");
}

async function consumeAuthEmailToken(token: string, purpose: AuthEmailTokenPurpose): Promise<string | null> {
  const record = await database()
    .prepare(
      "DELETE FROM auth_email_tokens WHERE token_hash=? AND purpose=? AND expires_at>? RETURNING user_id",
    )
    .bind(tokenHash(token), purpose, Date.now())
    .first<{ user_id: string }>();
  return record?.user_id ?? null;
}

export async function verifyEmailAddress(token: string): Promise<boolean> {
  const userId = await consumeAuthEmailToken(token, "email-verification");
  if (!userId) return false;
  const now = Date.now();
  await database()
    .prepare("UPDATE users SET email_verified_at=COALESCE(email_verified_at, ?), updated_at=? WHERE id=?")
    .bind(now, now, userId)
    .run();
  return true;
}

export async function resetPasswordWithToken({ token, password }: { token: string; password: string }) {
  const userId = await consumeAuthEmailToken(token, "password-reset");
  if (!userId) return null;
  const now = Date.now();
  await database()
    .prepare("UPDATE users SET password_hash=?, updated_at=? WHERE id=?")
    .bind(await hashPassword(password), now, userId)
    .run();
  await database().prepare("DELETE FROM user_sessions WHERE user_id=?").bind(userId).run();
  return userId;
}

export async function deleteAccountWithToken(token: string): Promise<boolean> {
  const result = await database()
    .prepare(
      "DELETE FROM users WHERE id=(SELECT user_id FROM auth_email_tokens WHERE token_hash=? AND purpose='account-deletion' AND expires_at>?) RETURNING id",
    )
    .bind(tokenHash(token), Date.now())
    .first<{ id: string }>();
  return Boolean(result);
}

export async function authenticateWithPassword({ email, password }: { email: string; password: string }) {
  const user = await userByEmail(email);
  if (!user?.password_hash || !(await verifyPassword(password, user.password_hash))) {
    throw new Error("INVALID_CREDENTIALS");
  }
  return user;
}

export async function createSession(userId: string): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  await database()
    .prepare(
      "INSERT INTO user_sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(crypto.randomUUID(), userId, tokenHash(token), now + sessionLifetimeMs, now, now)
    .run();
  return token;
}

export async function deleteSession(token: string | null) {
  if (!token) return;
  await database().prepare("DELETE FROM user_sessions WHERE token_hash=?").bind(tokenHash(token)).run();
}

export async function userForSession(token: string | null): Promise<AuthenticatedUser | null> {
  if (!token) return null;
  const now = Date.now();
  const user = await database()
    .prepare(
      "SELECT u.id, u.email, u.display_name, u.email_verified_at, u.permission FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
    )
    .bind(tokenHash(token), now)
    .first<SessionUser>();
  if (user) {
    await database()
      .prepare("UPDATE user_sessions SET last_seen_at=? WHERE token_hash=?")
      .bind(now, tokenHash(token))
      .run();
  }
  return user;
}

export async function findOrCreateOauthUser({
  provider,
  providerUserId,
  email,
  displayName,
}: {
  provider: "github" | "google";
  providerUserId: string;
  email: string;
  displayName: string | null;
}): Promise<UserRow> {
  const DB = database();
  const existingIdentity = await DB.prepare(
    "SELECT u.id, u.email, u.email_normalized, u.display_name, u.password_hash, u.email_verified_at, u.permission FROM user_identities i JOIN users u ON u.id=i.user_id WHERE i.provider=? AND i.provider_user_id=?",
  )
    .bind(provider, providerUserId)
    .first<UserRow>();
  if (existingIdentity) return existingIdentity;

  const now = Date.now();
  const normalizedEmail = normalizeEmail(email);
  let user = await userByEmail(normalizedEmail);
  if (!user) {
    user = await createUser({
      email: normalizedEmail,
      displayName,
      emailVerifiedAt: now,
    });
  } else {
    await DB.prepare(
      "UPDATE users SET email_verified_at=COALESCE(email_verified_at, ?), display_name=COALESCE(display_name, ?), updated_at=? WHERE id=?",
    )
      .bind(now, displayName, now, user.id)
      .run();
  }
  await DB.prepare(
    "INSERT INTO user_identities (provider, provider_user_id, user_id, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(provider, providerUserId, user.id, now)
    .run();
  return user;
}
