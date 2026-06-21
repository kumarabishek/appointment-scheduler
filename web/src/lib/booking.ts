/** Core booking logic invoked by the Vapi webhook when the agent calls a tool.
 *
 * Returns the string result handed back to the agent (it reads "action: ...").
 */
import { upsertEvent } from "./calendar";
import { config } from "./config";
import { isPending, waitForDecision } from "./decisions";
import { earliestOverall, pickBest } from "./matching";
import { sendDecisionRequest, sendInfo } from "./push";
import * as store from "./store";
import { CallRecord, OfferedSlot } from "./types";

type Args = Record<string, unknown>;

export async function dispatchTool(
  rec: CallRecord | null,
  name: string,
  args: Args,
): Promise<string> {
  if (!rec) return "Acknowledged.";
  switch (name) {
    case "get_patient_details":
      return getPatientDetails(rec, args);
    case "decide_and_book":
      return decideAndBook(rec, args);
    case "finalize_booking":
      return finalizeBooking(rec, args);
    case "escalate_to_human":
      return escalate(rec, args);
    default:
      return "Acknowledged.";
  }
}

/** Just-in-time PHI: return DOB / insurance only when the office asks, so these
 *  values aren't carried in the system prompt the LLM sees every turn. `rec`
 *  comes from the store already decrypted. */
function getPatientDetails(rec: CallRecord, args: Args): string {
  const p = rec.request.patient;
  const asked = Array.isArray(args.fields) ? (args.fields as string[]) : ["date_of_birth", "insurance"];
  const out: string[] = [];
  if (asked.includes("date_of_birth")) {
    out.push(`Date of birth: ${p.dateOfBirth || "not on file"}`);
  }
  if (asked.includes("insurance")) {
    out.push(
      p.insuranceProvider
        ? `Insurance: ${p.insuranceProvider}${p.insuranceMemberId ? `, member ID ${p.insuranceMemberId}` : ""}`
        : "Insurance: not provided — offer to give it at check-in.",
    );
  }
  return out.join(". ") + ". Read back only what the office asked for.";
}

function authorize(rec: CallRecord, slot: OfferedSlot, why: string): Promise<string> {
  rec.chosenSlot = slot;
  rec.status = "confirmed";
  return store.save(rec).then(
    () =>
      `action: book — approved (${why}). Book this exact slot with the office now: ` +
      `${slot.startsAt}${slot.provider ? ` with ${slot.provider}` : ""}. ` +
      `Get a confirmation number, then call finalize_booking.`,
  );
}

async function decideAndBook(rec: CallRecord, args: Args): Promise<string> {
  const slots = OfferedSlot.array().parse(
    ((args.offered_slots as Array<Record<string, unknown>>) ?? []).map((s) => ({
      startsAt: s.starts_at,
      provider: s.provider,
      location: s.location,
      notes: s.notes,
    })),
  );
  rec.offeredSlots = slots;

  if (args.no_slots || !slots.length) {
    rec.status = "no_slots";
    await store.save(rec);
    await sendInfo(
      "❌ No availability",
      "The office had no open times. Open the app to review.",
    );
    return "action: decline — no slots available. Politely end the call.";
  }

  const zone = rec.request.timezone || config.defaultTimezone;

  // Green zone: a slot that fits your rules -> book on the spot.
  const best = pickBest(slots, rec.request.acceptableWindows, zone);
  if (best) return authorize(rec, best, "fits your preferred window");

  // Edge case: nothing fits your windows.
  // If push (ntfy) isn't configured, skip the live tap-to-approve entirely and
  // apply your fallback rule straight away — the outcome shows on the dashboard.
  if (!config.ntfyTopic) {
    return applyFallback(rec, slots, zone, "outside your windows");
  }

  // Otherwise: ask you live via tap-to-pick push, holding the line.
  await sendDecisionRequest(rec, slots);
  rec.status = "awaiting_confirmation";
  await store.save(rec);

  const decision = await waitForDecision(rec.id, config.decisionTimeoutMs);
  if (decision) {
    const choice = decision.choice;
    const idx = Number(choice);
    if (/^\d+$/.test(choice) && idx >= 0 && idx < slots.length) {
      return authorize(rec, slots[idx], "you approved it");
    }
    rec.status = "failed";
    rec.transcriptSummary = "Owner declined offered slots.";
    await store.save(rec);
    return "action: decline — none approved. Politely decline and end the call.";
  }

  // No tap in time -> fallback.
  return applyFallback(rec, slots, zone, "no reply in time");
}

/** Apply the EDGE_FALLBACK rule when no slot fits and we're not asking live. */
async function applyFallback(
  rec: CallRecord,
  slots: OfferedSlot[],
  zone: string,
  why: string,
): Promise<string> {
  if (config.edgeFallback === "closest") {
    const slot = earliestOverall(slots, zone);
    if (slot) {
      await sendInfo(
        "⏱️ Auto-booked the closest time",
        "It was outside your usual window. Open the app for details.",
      );
      return authorize(rec, slot, `${why}; closest option`);
    }
  }
  rec.status = "failed";
  rec.transcriptSummary = `Declined per fallback (${why}).`;
  await store.save(rec);
  await sendInfo(
    "Couldn’t book a time",
    "No offered times fit your windows. You can call back. Open the app for details.",
  );
  return "action: decline — none fit your windows. Politely decline and end the call.";
}

async function finalizeBooking(rec: CallRecord, args: Args): Promise<string> {
  if (args.slot) {
    const s = args.slot as Record<string, unknown>;
    rec.chosenSlot = OfferedSlot.parse({
      startsAt: s.starts_at,
      provider: s.provider,
      location: s.location,
      notes: s.notes,
    });
  }
  rec.status = "booked";
  const conf = args.confirmation_number as string | undefined;
  const prep = args.prep_instructions as string | undefined;
  rec.transcriptSummary =
    [conf ? `Confirmation: ${conf}` : null, prep ? `Prep: ${prep}` : null]
      .filter(Boolean)
      .join(" | ") || "Booked.";
  await store.save(rec);
  await upsertEvent(rec, false);
  await sendInfo(
    "✅ Appointment booked",
    "Open the app for the time and confirmation number.",
  );
  return "action: done — recorded. Thank them and end the call.";
}

async function escalate(rec: CallRecord, args: Args): Promise<string> {
  const reason = (args.reason as string) ?? "unspecified";
  rec.status = "escalated";
  rec.transcriptSummary = `Escalated: ${reason}`;
  await store.save(rec);
  // `reason` may contain PHI; keep it out of the push (it's saved on the record).
  await sendInfo("⚠️ A call needs you", "Open the app to take it over.");
  return "action: escalate — tell them a family member will call back, thank them, and end the call.";
}

export { isPending };
