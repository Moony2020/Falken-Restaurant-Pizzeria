import { createHash, timingSafeEqual } from "node:crypto";
import { connectDb, disconnectDb } from "../src/server/db.ts";
import { createInitialAdmin, normaliseStaffEmail } from "../src/server/admin-auth.ts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safelyEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function main() {
  if (process.env.ADMIN_BOOTSTRAP_ENABLED !== "true") throw new Error("ADMIN_BOOTSTRAP_ENABLED=true is required");
  const suppliedToken = required("ADMIN_BOOTSTRAP_TOKEN");
  const expectedTokenHash = required("ADMIN_BOOTSTRAP_TOKEN_SHA256");
  const actualTokenHash = createHash("sha256").update(suppliedToken).digest("hex");
  if (!/^[a-f0-9]{64}$/i.test(expectedTokenHash) || !safelyEqual(actualTokenHash, expectedTokenHash.toLowerCase())) throw new Error("Admin bootstrap authorization failed");

  const rawUri = required("MONGODB_URI");
  const host = new URL(rawUri).hostname;
  const isLocal = host === "127.0.0.1" || host === "localhost";
  if (!isLocal && process.env.ADMIN_BOOTSTRAP_ALLOW_NONLOCAL !== "true") throw new Error("Admin bootstrap is local-only unless ADMIN_BOOTSTRAP_ALLOW_NONLOCAL=true is explicitly set");

  const email = normaliseStaffEmail(required("ADMIN_BOOTSTRAP_EMAIL"));
  const password = required("ADMIN_BOOTSTRAP_PASSWORD");
  const displayName = required("ADMIN_BOOTSTRAP_NAME").trim();
  if (password.length < 8 || !displayName || displayName.length > 120) throw new Error("Admin bootstrap input is invalid");

  await connectDb();
  try {
    await createInitialAdmin({ email, displayName, password });
    console.log("Initial ADMIN account created. Remove the ADMIN_BOOTSTRAP_* variables before running the application.");
  } finally {
    await disconnectDb();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Admin bootstrap failed");
  process.exitCode = 1;
});
