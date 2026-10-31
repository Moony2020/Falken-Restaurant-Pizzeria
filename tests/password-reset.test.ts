import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generatePasswordResetEmailHtml,
  generatePasswordResetEmailText,
  sendPasswordResetEmail,
} from "../src/server/email.ts";

test("password reset email html template includes required elements", () => {
  const html = generatePasswordResetEmailHtml("Hanna", "https://example.com/admin/reset-password?token=secret123");
  assert.ok(html.includes("Hej Hanna!"), "must greet recipient by name");
  assert.ok(html.includes("https://example.com/admin/reset-password?token=secret123"), "must contain reset link");
  assert.ok(html.includes("30 minuter"), "must state expiration window");
  assert.ok(html.includes("Falken Restaurang & Pizzeria"), "must have Falken branding");
  assert.ok(html.includes("Återställ lösenord"), "must have button label");
});

test("password reset email text fallback includes reset link and notice", () => {
  const text = generatePasswordResetEmailText("David", "https://example.com/admin/reset-password?token=abc");
  assert.ok(text.includes("Hej David!"), "must greet recipient");
  assert.ok(text.includes("https://example.com/admin/reset-password?token=abc"), "must include link");
  assert.ok(text.includes("30 minuter"), "must include expiration");
});

test("sendPasswordResetEmail in dev mode logs and succeeds cleanly without throwing", async () => {
  const result = await sendPasswordResetEmail({
    to: "admin@example.com",
    name: "Admin",
    resetUrl: "http://localhost:3000/admin/reset-password?token=test_dev_token",
  });

  assert.equal(result.sent, true);
  assert.equal(result.mode, "dev");
  assert.equal(result.resetUrl, "http://localhost:3000/admin/reset-password?token=test_dev_token");
});

