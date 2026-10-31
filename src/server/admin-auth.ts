import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { Types } from "mongoose";
import type { StaffRole } from "./models/constants.ts";
import { StaffPasswordResetModel, StaffSessionModel, StaffUserModel } from "./models/staff.ts";
import { sameOrigin } from "./http.ts";

const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const PASSWORD_BYTES = 32;
export const ADMIN_SESSION_COOKIE = "falken_admin_session";
export const ADMIN_CSRF_COOKIE = "falken_admin_csrf";

export type AdminAuthConfig = { sessionSecret: string; sessionTtlSeconds: number };
export type AdminPrincipal = { id: string; email: string; displayName: string; role: StaffRole };
export type AdminSession = { principal: AdminPrincipal; sessionId: string };
export type CreatedAdminSession = AdminSession & { token: string; csrfToken: string };

function derivePasswordKey(password: string, salt: Buffer, N = SCRYPT_N, r = SCRYPT_R, p = SCRYPT_P): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, PASSWORD_BYTES, { N, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export function getAdminAuthConfig(input: NodeJS.ProcessEnv = process.env): AdminAuthConfig {
  const sessionSecret = input.ADMIN_SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32) throw new Error("Invalid admin authentication configuration");
  const configuredTtl = Number(input.ADMIN_SESSION_TTL_SECONDS ?? 43_200);
  if (!Number.isInteger(configuredTtl) || configuredTtl < 900 || configuredTtl > 604_800) throw new Error("Invalid admin authentication configuration");
  return { sessionSecret, sessionTtlSeconds: configuredTtl };
}

export function normaliseStaffEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derivePasswordKey(password, salt);
  return ["scrypt-v1", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64url"), derived.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [version, rawN, rawR, rawP, encodedSalt, encodedHash, ...extra] = encoded.split("$");
  if (version !== "scrypt-v1" || extra.length || !encodedSalt || !encodedHash) return false;
  const N = Number(rawN), r = Number(rawR), p = Number(rawP);
  if (N !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P) return false;
  try {
    const salt = Buffer.from(encodedSalt, "base64url");
    const expected = Buffer.from(encodedHash, "base64url");
    if (salt.length !== 16 || expected.length !== PASSWORD_BYTES) return false;
    const actual = await derivePasswordKey(password, salt, N, r, p);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function createStaffUser(input: { email: string; displayName: string; password: string; role: StaffRole; bootstrapAdmin?: boolean }) {
  if (input.password.length < 8) throw new Error("Staff passwords must contain at least 8 characters");
  if (!input.displayName.trim()) throw new Error("Staff display name is required");
  return StaffUserModel.create({
    email: normaliseStaffEmail(input.email),
    displayName: input.displayName.trim(),
    passwordHash: await hashPassword(input.password),
    role: input.role,
    bootstrapAdmin: input.bootstrapAdmin ?? false,
    active: true,
  });
}

/** The caller must perform the out-of-band bootstrap authorization before calling this one-time operation. */
export async function createInitialAdmin(input: { email: string; displayName: string; password: string }) {
  if (await StaffUserModel.exists({ role: "ADMIN" })) throw new Error("An initial ADMIN already exists; bootstrap is one-time only");
  try {
    return await createStaffUser({ ...input, role: "ADMIN", bootstrapAdmin: true });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11_000) {
      throw new Error("An initial ADMIN already exists; bootstrap is one-time only");
    }
    throw error;
  }
}

function tokenHash(value: string, config: AdminAuthConfig): string {
  return createHmac("sha256", config.sessionSecret).update(value).digest("base64url");
}

function csrfHash(value: string, config: AdminAuthConfig): string {
  return createHmac("sha256", config.sessionSecret).update(`csrf:${value}`).digest("base64url");
}

function readCookie(request: Request, name: string): string | null {
  const prefix = `${name}=`;
  const part = request.headers.get("cookie")?.split(";").map((v) => v.trim()).find((v) => v.startsWith(prefix));
  if (!part) return null;
  try { return decodeURIComponent(part.slice(prefix.length)); } catch { return null; }
}

function equalHash(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function authenticateStaff(email: string, password: string): Promise<{ id: Types.ObjectId; email: string; displayName: string; role: StaffRole; authVersion: number } | null> {
  const user = await StaffUserModel.findOne({ email: normaliseStaffEmail(email), active: true }).select("+passwordHash").lean();
  if (!user || !(await verifyPassword(password, user.passwordHash))) return null;
  return { id: user._id, email: user.email, displayName: user.displayName, role: user.role as StaffRole, authVersion: user.authVersion };
}

export async function createAdminSession(user: { id: Types.ObjectId; email: string; displayName: string; role: StaffRole; authVersion: number }, config: AdminAuthConfig, now = new Date()): Promise<CreatedAdminSession> {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + config.sessionTtlSeconds * 1000);
  const session = await StaffSessionModel.create({ tokenHash: tokenHash(token, config), csrfTokenHash: csrfHash(csrfToken, config), userId: user.id, authVersion: user.authVersion, expiresAt, lastSeenAt: now });
  return { principal: { id: String(user.id), email: user.email, displayName: user.displayName, role: user.role }, sessionId: String(session._id), token, csrfToken };
}

export async function getAdminSession(request: Request, config: AdminAuthConfig, now = new Date()): Promise<(AdminSession & { token: string }) | null> {
  const token = readCookie(request, ADMIN_SESSION_COOKIE);
  if (!token) return null;
  const session = await StaffSessionModel.findOne({ tokenHash: tokenHash(token, config), revokedAt: null, expiresAt: { $gt: now } }).lean();
  if (!session) return null;
  const user = await StaffUserModel.findOne({ _id: session.userId, active: true, authVersion: session.authVersion }).lean();
  if (!user) return null;
  void StaffSessionModel.updateOne({ _id: session._id, revokedAt: null }, { $set: { lastSeenAt: now } });
  return { principal: { id: String(user._id), email: user.email, displayName: user.displayName, role: user.role as StaffRole }, sessionId: String(session._id), token };
}

export function setAdminSessionCookies(response: Response, request: Request, credentials: Pick<CreatedAdminSession, "token" | "csrfToken">, config: AdminAuthConfig): void {
  const secure = request.headers.get("x-forwarded-proto") === "https" || new URL(request.url).protocol === "https:";
  const attrs = `Path=/; Max-Age=${config.sessionTtlSeconds}; SameSite=Lax${secure ? "; Secure" : ""}`;
  response.headers.append("set-cookie", `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(credentials.token)}; ${attrs}; HttpOnly`);
  response.headers.append("set-cookie", `${ADMIN_CSRF_COOKIE}=${encodeURIComponent(credentials.csrfToken)}; ${attrs}`);
}

export function clearAdminSessionCookies(response: Response, request: Request): void {
  const secure = request.headers.get("x-forwarded-proto") === "https" || new URL(request.url).protocol === "https:";
  const attrs = `Path=/; Max-Age=0; SameSite=Lax${secure ? "; Secure" : ""}`;
  response.headers.append("set-cookie", `${ADMIN_SESSION_COOKIE}=; ${attrs}; HttpOnly`);
  response.headers.append("set-cookie", `${ADMIN_CSRF_COOKIE}=; ${attrs}`);
}

export async function revokeAdminSession(sessionId: string, now = new Date()): Promise<void> {
  await StaffSessionModel.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: now } });
}

export async function revokeAllStaffSessions(userId: Types.ObjectId | string, now = new Date()): Promise<void> {
  await StaffSessionModel.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: now } });
}

export async function changeStaffPassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
  const user = await StaffUserModel.findOne({ _id: userId, active: true }).select("+passwordHash").lean();
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) return false;
  const newHash = await hashPassword(newPassword);
  const result = await StaffUserModel.updateOne(
    { _id: user._id, active: true, passwordHash: user.passwordHash, authVersion: user.authVersion },
    { $set: { passwordHash: newHash }, $inc: { authVersion: 1 } },
  );
  if (result.modifiedCount !== 1) return false;
  await revokeAllStaffSessions(user._id);
  return true;
}

export async function requireAdmin(request: Request, config: AdminAuthConfig): Promise<{ ok: true; session: AdminSession & { token: string } } | { ok: false; status: 401 }> {
  const session = await getAdminSession(request, config);
  if (!session) return { ok: false, status: 401 };
  return { ok: true, session };
}

export function verifyAdminCsrf(request: Request, session: AdminSession & { token: string }): boolean {
  if (!sameOrigin(request)) return false;
  const cookieToken = readCookie(request, ADMIN_CSRF_COOKIE);
  const headerToken = request.headers.get("x-csrf-token");
  if (!cookieToken || !headerToken || !equalHash(cookieToken, headerToken)) return false;
  // The session token is only a lookup key. CSRF proof is checked against the server-side session record below.
  return !!session.token;
}

export async function verifyAdminCsrfForSession(request: Request, session: AdminSession & { token: string }, config: AdminAuthConfig): Promise<boolean> {
  if (!verifyAdminCsrf(request, session)) return false;
  const cookieToken = readCookie(request, ADMIN_CSRF_COOKIE)!;
  const stored = await StaffSessionModel.findById(session.sessionId).select("+csrfTokenHash").lean();
  return !!stored && !stored.revokedAt && equalHash(stored.csrfTokenHash, csrfHash(cookieToken, config));
}

export function publicPrincipal(principal: AdminPrincipal) {
  return { id: principal.id, email: principal.email, displayName: principal.displayName, role: principal.role };
}

function resetTokenHash(rawToken: string, config: AdminAuthConfig): string {
  return createHmac("sha256", config.sessionSecret).update(`reset:${rawToken}`).digest("base64url");
}

export async function createPasswordResetToken(
  email: string,
  config: AdminAuthConfig,
  ttlMs = 30 * 60_000,
): Promise<{ ok: true; userFound: boolean; email: string; displayName?: string; rawToken?: string }> {
  const normalisedEmail = normaliseStaffEmail(email);
  const user = await StaffUserModel.findOne({ email: normalisedEmail, active: true }).lean();
  if (!user) {
    return { ok: true, userFound: false, email: normalisedEmail };
  }

  // Invalidate any existing unused reset tokens for this user
  await StaffPasswordResetModel.updateMany(
    { userId: user._id, usedAt: null },
    { $set: { usedAt: new Date() } },
  );

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = resetTokenHash(rawToken, config);
  const expiresAt = new Date(Date.now() + ttlMs);

  await StaffPasswordResetModel.create({
    tokenHash,
    userId: user._id,
    email: user.email,
    expiresAt,
  });

  return {
    ok: true,
    userFound: true,
    email: user.email,
    displayName: user.displayName,
    rawToken,
  };
}

export async function verifyPasswordResetToken(
  rawToken: string,
  config: AdminAuthConfig,
): Promise<
  | { valid: true; user: { id: Types.ObjectId; email: string; displayName: string } }
  | { valid: false; reason: "invalid_or_expired" | "user_not_found" }
> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.length < 16) {
    return { valid: false, reason: "invalid_or_expired" };
  }

  const tokenHash = resetTokenHash(rawToken, config);
  const resetRecord = await StaffPasswordResetModel.findOne({
    tokenHash,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  }).lean();

  if (!resetRecord) {
    return { valid: false, reason: "invalid_or_expired" };
  }

  const user = await StaffUserModel.findOne({ _id: resetRecord.userId, active: true }).lean();
  if (!user) {
    return { valid: false, reason: "user_not_found" };
  }

  return {
    valid: true,
    user: { id: user._id, email: user.email, displayName: user.displayName },
  };
}

export async function resetPasswordWithToken(
  rawToken: string,
  newPassword: string,
  config: AdminAuthConfig,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (newPassword.length < 8) {
    return { ok: false, error: "Lösenordet måste bestå av minst 8 tecken." };
  }

  const check = await verifyPasswordResetToken(rawToken, config);
  if (!check.valid) {
    return { ok: false, error: "Återställningslänken är ogiltig eller har gått ut." };
  }

  const newHash = await hashPassword(newPassword);
  const tokenHash = resetTokenHash(rawToken, config);

  // Atomically update user's password and increment authVersion to revoke all active sessions
  await StaffUserModel.updateOne(
    { _id: check.user.id, active: true },
    { $set: { passwordHash: newHash }, $inc: { authVersion: 1 } },
  );

  // Mark the token as used
  await StaffPasswordResetModel.updateOne(
    { tokenHash },
    { $set: { usedAt: new Date() } },
  );

  // Invalidate any session in DB
  await revokeAllStaffSessions(check.user.id);

  return { ok: true };
}
