import { createHmac, timingSafeEqual } from "node:crypto";

// A public order number (publicId) is something a customer may share or that may be guessed over time;
// it is not permission to act on the order. Pay / cancel / look-at-details endpoints will require this
// access token instead. It is an HMAC of the publicId under a server secret, so:
//  - it can be recomputed (a retried request after a lost response gets the same token back),
//  - nothing secret is stored in the database,
//  - a token for one order is useless for any other order.

const MIN_SECRET_LENGTH = 32;

export function deriveAccessToken(publicId: string, secret: string): string {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error("ORDER_TOKEN_SECRET must be at least 32 characters");
  return createHmac("sha256", secret).update(`order-access:v1:${publicId}`).digest("base64url");
}

export function verifyAccessToken(publicId: string, token: string | null | undefined, secret: string): boolean {
  if (!token || token.length > 200) return false;
  const expected = Buffer.from(deriveAccessToken(publicId, secret));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
