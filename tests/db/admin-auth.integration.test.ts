import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { GET as me } from "../../src/app/api/admin/auth/me/route.ts";
import { POST as login } from "../../src/app/api/admin/auth/login/route.ts";
import { POST as logout } from "../../src/app/api/admin/auth/logout/route.ts";
import {
  ADMIN_CSRF_COOKIE,
  ADMIN_SESSION_COOKIE,
  authenticateStaff,
  createAdminSession,
  createInitialAdmin,
  createStaffUser,
  getAdminAuthConfig,
  getAdminSession,
  hashPassword,
  requireAdmin,
  revokeAdminSession,
  verifyPassword,
} from "../../src/server/admin-auth.ts";
import { resetRateLimits } from "../../src/server/rate-limit.ts";
import { StaffSessionModel, StaffUserModel } from "../../src/server/models/staff.ts";

// Integration tests use only the explicitly configured local throwaway database.
const uri = process.env.MONGODB_URI_TEST;
const safe = !!uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/[\w-]*_test(\?.*)?$/.test(uri);
const testSecret = randomBytes(40).toString("base64url");
const originalSessionSecret = process.env.ADMIN_SESSION_SECRET;
let serial = 0;

function email(label: string) {
  serial += 1;
  return `${label}-${serial}@example.test`;
}

function password(label = "staff") {
  return `${label}-${randomBytes(18).toString("base64url")}`;
}

function request(url: string, init: RequestInit = {}) {
  return new Request(url, init);
}

function cookies(response: Response) {
  const raw = response.headers.get("set-cookie") ?? "";
  const session = new RegExp(`${ADMIN_SESSION_COOKIE}=([^;]+)`).exec(raw)?.[1];
  const csrf = new RegExp(`${ADMIN_CSRF_COOKIE}=([^;]+)`).exec(raw)?.[1];
  assert.ok(session, "login must set the HttpOnly session cookie");
  assert.ok(csrf, "login must set the CSRF cookie");
  return { session: decodeURIComponent(session), csrf: decodeURIComponent(csrf), raw };
}

function sessionCookie(session: string, csrf: string) {
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(session)}; ${ADMIN_CSRF_COOKIE}=${encodeURIComponent(csrf)}`;
}

async function loginAs(input: { email: string; password: string; ip?: string }) {
  return login(request("https://falken.test/api/admin/auth/login", {
    method: "POST",
    headers: {
      origin: "https://falken.test",
      "content-type": "application/json",
      "x-forwarded-for": input.ip ?? `198.51.100.${serial + 1}`,
    },
    body: JSON.stringify({ email: input.email, password: input.password }),
  }));
}

describe("admin authentication on a local test database", { skip: !uri ? "MONGODB_URI_TEST not set" : false }, () => {
  before(async () => {
    assert.ok(safe, "MONGODB_URI_TEST must be a local mongodb:// URI whose database name ends in _test");
    process.env.ADMIN_SESSION_SECRET = testSecret;
    await mongoose.connect(uri as string, { dbName: "falken_admin_auth_test", serverSelectionTimeoutMS: 5000 });
    await mongoose.connection.dropDatabase();
    await Promise.all([StaffUserModel.init(), StaffSessionModel.init()]);
  });

  after(async () => {
    if (safe) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    if (originalSessionSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = originalSessionSecret;
  });

  beforeEach(() => resetRateLimits());

  test("initial admin bootstrap is a one-time server operation", async () => {
    const attempts = await Promise.allSettled([
      createInitialAdmin({ email: email("initial-admin"), displayName: "Initial Admin", password: password("initial-admin") }),
      createInitialAdmin({ email: email("initial-admin-race"), displayName: "Racing Admin", password: password("initial-admin-race") }),
    ]);
    assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
    assert.equal(await StaffUserModel.countDocuments({ bootstrapAdmin: true }), 1);
    await assert.rejects(
      () => createInitialAdmin({ email: email("initial-admin-second"), displayName: "Second Admin", password: password("initial-admin-second") }),
      /initial ADMIN already exists/,
    );
  });

  test("passwords are salted scrypt hashes and are never returned by the default staff query", async () => {
    const secret = password("hash");
    const hash = await hashPassword(secret);
    assert.match(hash, /^scrypt-v1\$32768\$8\$1\$/);
    assert.notEqual(hash, secret);
    assert.equal(await verifyPassword(secret, hash), true);
    assert.equal(await verifyPassword(`${secret}-wrong`, hash), false);
    assert.equal(await verifyPassword(secret, "not-a-password-hash"), false);

    const created = await createStaffUser({ email: email("hash"), displayName: "Hash Test", password: secret, role: "ADMIN" });
    const stored = await StaffUserModel.findById(created._id).lean();
    assert.ok(stored);
    assert.equal("passwordHash" in stored, false);
  });

  test("login sets safe cookies and me returns only the server-side principal", async () => {
    const userEmail = email("login");
    const userPassword = password("login");
    await createStaffUser({ email: userEmail, displayName: "Admin Login", password: userPassword, role: "ADMIN" });

    const response = await loginAs({ email: userEmail, password: userPassword });
    assert.equal(response.status, 200);
    const body = await response.json() as { staff: { id: string; email: string; displayName: string; role: string } };
    assert.deepEqual(body.staff, { id: body.staff.id, email: userEmail, displayName: "Admin Login", role: "ADMIN" });
    const issued = cookies(response);
    assert.match(issued.raw, new RegExp(`${ADMIN_SESSION_COOKIE}=[^;]+;[^\r\n]*HttpOnly`));
    assert.match(issued.raw, /SameSite=Lax/);
    assert.match(issued.raw, /Secure/); // Production HTTPS requests receive secure cookies.

    const who = await me(request("https://falken.test/api/admin/auth/me", { headers: { cookie: sessionCookie(issued.session, issued.csrf) } }));
    assert.equal(who.status, 200);
    assert.deepEqual(await who.json(), { staff: body.staff });

    const anonymous = await me(request("https://falken.test/api/admin/auth/me"));
    assert.equal(anonymous.status, 401);
  });

  test("failed login responses do not reveal whether an account exists", async () => {
    const userEmail = email("failure");
    const userPassword = password("failure");
    await createStaffUser({ email: userEmail, displayName: "Failure Test", password: userPassword, role: "ADMIN" });

    const unknown = await loginAs({ email: email("unknown"), password: userPassword, ip: "198.51.100.41" });
    const wrong = await loginAs({ email: userEmail, password: `${userPassword}-wrong`, ip: "198.51.100.42" });
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.deepEqual(await unknown.json(), { error: "invalid_credentials" });
    assert.deepEqual(await wrong.json(), { error: "invalid_credentials" });
  });

  test("login rate limits repeated attempts for the same account without blocking a different account", async () => {
    const target = email("limited");
    for (let index = 0; index < 8; index += 1) {
      const attempt = await loginAs({ email: target, password: password("wrong"), ip: `198.51.101.${index}` });
      assert.equal(attempt.status, 401);
    }
    const ninth = await loginAs({ email: target, password: password("wrong"), ip: "198.51.101.9" });
    assert.equal(ninth.status, 429);
    assert.deepEqual(await ninth.json(), { error: "rate_limited" });
  });

  test("logout requires same-origin CSRF proof, revokes the session, and clears both cookies", async () => {
    const userEmail = email("logout");
    const userPassword = password("logout");
    await createStaffUser({ email: userEmail, displayName: "Logout Test", password: userPassword, role: "ADMIN" });
    const issued = cookies(await loginAs({ email: userEmail, password: userPassword }));

    const noCsrf = await logout(request("https://falken.test/api/admin/auth/logout", {
      method: "POST", headers: { origin: "https://falken.test", cookie: sessionCookie(issued.session, issued.csrf) },
    }));
    assert.equal(noCsrf.status, 403);

    const crossSite = await logout(request("https://falken.test/api/admin/auth/logout", {
      method: "POST", headers: { origin: "https://attacker.example", cookie: sessionCookie(issued.session, issued.csrf), "x-csrf-token": issued.csrf },
    }));
    assert.equal(crossSite.status, 403);

    const ended = await logout(request("https://falken.test/api/admin/auth/logout", {
      method: "POST", headers: { origin: "https://falken.test", cookie: sessionCookie(issued.session, issued.csrf), "x-csrf-token": issued.csrf },
    }));
    assert.equal(ended.status, 204);
    assert.match(ended.headers.get("set-cookie") ?? "", new RegExp(`${ADMIN_SESSION_COOKIE}=;[^\r\n]*Max-Age=0`));
    assert.equal((await me(request("https://falken.test/api/admin/auth/me", { headers: { cookie: sessionCookie(issued.session, issued.csrf) } }))).status, 401);
  });

  test("revoked, expired, and disabled accounts cannot retain access", async () => {
    const userEmail = email("revoked");
    const userPassword = password("revoked");
    const created = await createStaffUser({ email: userEmail, displayName: "Revocation Test", password: userPassword, role: "ADMIN" });
    const config = getAdminAuthConfig();
    const user = await authenticateStaff(userEmail, userPassword);
    assert.ok(user);
    const issued = await createAdminSession(user, config);
    const protectedRequest = request("https://falken.test/api/admin/auth/me", { headers: { cookie: sessionCookie(issued.token, issued.csrfToken) } });
    assert.equal((await me(protectedRequest)).status, 200);
    await revokeAdminSession(issued.sessionId);
    assert.equal((await me(protectedRequest)).status, 401);

    const expired = await createAdminSession(user, config, new Date(Date.now() - (config.sessionTtlSeconds + 1) * 1000));
    assert.equal(await getAdminSession(request("https://falken.test", { headers: { cookie: sessionCookie(expired.token, expired.csrfToken) } }), config), null);

    const activeSession = await createAdminSession(user, config);
    await StaffUserModel.updateOne({ _id: created._id }, { $set: { active: false } });
    assert.equal(await getAdminSession(request("https://falken.test", { headers: { cookie: sessionCookie(activeSession.token, activeSession.csrfToken) } }), config), null);
  });

  test("only ADMIN is a valid staff capability and it is determined by the server-side account", async () => {
    const userEmail = email("role");
    const userPassword = password("role");
    await createStaffUser({ email: userEmail, displayName: "Admin Role", password: userPassword, role: "ADMIN" });
    const user = await authenticateStaff(userEmail, userPassword);
    assert.ok(user);
    const issued = await createAdminSession(user, getAdminAuthConfig());
    const staffRequest = request("https://falken.test/api/admin/example", { headers: { cookie: sessionCookie(issued.token, issued.csrfToken) } });
    const admin = await requireAdmin(staffRequest, getAdminAuthConfig());
    assert.equal(admin.ok, true);
    if (admin.ok) assert.equal(admin.session.principal.role, "ADMIN");

    const invalidPasswordHash = await hashPassword(password("invalid-role"));
    await assert.rejects(
      () => StaffUserModel.create({ email: email("invalid-role"), displayName: "Invalid Role", passwordHash: invalidPasswordHash, role: "KITCHEN" }),
      /valid enum value/,
    );
  });
});
