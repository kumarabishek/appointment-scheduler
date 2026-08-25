/** Repair call records whose end-of-call webhook never arrived.
 *
 * Every terminal transition depends on Vapi POSTing `end-of-call-report`. When
 * that delivery fails — the tunnel is down, a deploy is mid-flight, the request
 * times out — nothing else ever moves the record, so it sits in a live state
 * forever and the dashboard reports an active call that ended hours ago.
 *
 * Vapi is the authority on whether a call is over, so ask it rather than
 * guessing from age. A record can legitimately stay live for the whole
 * `maxDurationSeconds` (30 min) while the agent sits in a hold queue making no
 * tool calls, so a timeout alone would mark real calls dead.
 */
import { config } from "./config";
import * as store from "./store";
import { CallRecord } from "./types";

/** Statuses the dashboard renders as an in-flight call. */
const LIVE = new Set(["pending", "confirmed", "awaiting_confirmation"]);

/** Leave very recent records alone: an active call updates itself on every tool
 *  call, so only a quiet one is worth an API round trip. */
const QUIET_FOR_MS = 3 * 60 * 1000;

type VapiCall = { status?: string; endedReason?: string; analysis?: { summary?: string } };

async function fetchCall(vapiCallId: string): Promise<VapiCall | null> {
  try {
    const resp = await fetch(`https://api.vapi.ai/call/${vapiCallId}`, {
      headers: { Authorization: `Bearer ${config.vapiApiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    return resp.ok ? ((await resp.json()) as VapiCall) : null;
  } catch {
    return null; // Never let a reconciliation failure break the dashboard.
  }
}

/** True if this record was left stranded and has now been corrected. */
async function repair(rec: CallRecord): Promise<boolean> {
  if (!rec.vapiCallId || !LIVE.has(rec.status)) return false;
  const remote = await fetchCall(rec.vapiCallId);
  if (!remote || remote.status !== "ended") return false;

  // Mirror the webhook's own reasoning: "confirmed" means a slot was approved
  // but finalize_booking never came, so the booking may or may not exist.
  const midBooking = rec.status === "confirmed";
  rec.status = "failed";
  rec.transcriptSummary =
    remote.analysis?.summary ??
    (midBooking
      ? "Call ended before the booking was finalized — call the office to check."
      : `Call ended without a confirmed booking (${remote.endedReason ?? "reason unknown"}).`);
  await store.save(rec);
  return true;
}

/** Correct any of this user's records that are stuck mid-call. Returns how many
 *  were repaired. Safe to call on every dashboard load: it only touches live
 *  records that have gone quiet, and only after Vapi confirms the call ended. */
export async function reconcileStuckCalls(userId: string): Promise<number> {
  const cutoff = Date.now() - QUIET_FOR_MS;
  const stale = (await store.all(userId)).filter(
    (r) => LIVE.has(r.status) && r.vapiCallId && Date.parse(r.updatedAt) < cutoff,
  );
  if (!stale.length) return 0;
  const results = await Promise.all(stale.map(repair));
  return results.filter(Boolean).length;
}
