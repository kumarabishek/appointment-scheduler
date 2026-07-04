/** Signed, expiring tokens for the tap-to-approve decide links.
 *
 * The ntfy push buttons POST to /api/decide from the ntfy app on your phone —
 * a client with NO Clerk session. So the route is public (Clerk-exempt) and
 * each button URL instead carries an HMAC token binding {call, choice, expiry}.
 * A token authorizes exactly one choice on one call for a few minutes: it can't
 * be replayed for another call, another slot, or after the window closes.
 *
 * Keyed off PHI_ENCRYPTION_KEY (already required for the app to store anything),
 * so no extra secret to provision.
 */
import { createHmac, timingSafeEqual } from "crypto";

import { config } from "./config";

// Long enough to notice the push and tap; the live decision window itself is
// ~25s, and /api/decide independently checks the call is still pending.
const TTL_MS = 10 * 60 * 1000;

function sign(callId: string, choice: string, exp: number): string {
  return createHmac("sha256", config.phiEncryptionKey)
    .update(`${callId}|${choice}|${exp}`)
    .digest("base64url");
}

export function mintDecideToken(callId: string, choice: string, ttlMs = TTL_MS): string {
  if (!config.phiEncryptionKey) {
    throw new Error("PHI_ENCRYPTION_KEY is not set — cannot sign decide links.");
  }
  const exp = Date.now() + ttlMs;
  return `${exp}.${sign(callId, choice, exp)}`;
}

export function verifyDecideToken(callId: string, choice: string, token: string): boolean {
  if (!config.phiEncryptionKey || !token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || !sig || Date.now() > exp) return false;
  const expected = Buffer.from(sign(callId, choice, exp));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
