/** Core booking logic invoked by the Vapi webhook when the agent calls a tool.
 *
 * Returns the string result handed back to the agent (it reads "action: ...").
 */
import { upsertEvent } from "./calendar";
import { config } from "./config";
import { isPending, waitForDecision } from "./decisions";
import { driftedOutsideZone, earliestOverall, parseSlot, pickBest } from "./matching";
import { sendDecisionRequest, sendInfo } from "./push";
import * as store from "./store";
import { CallRecord, OfferedSlot } from "./types";

type Args = Record<string, unknown>;

export async function dispatchTool(
  rec: CallRecord | null,
  name: string,
  args: Args,
): Promise<string> {
  // No record means we can't authorize, verify, or persist anything. A bare
  // "Acknowledged." here left the agent improvising with the operator; give it
  // an explicit exit instead.
  if (!rec) {
    return (
      "action: escalate — something went wrong on our end and this call can't " +
      "be completed. Apologize, say the patient will call back, and end the call."
    );
  }
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
/** MMDDYYYY digits for keying a YYYY-MM-DD date of birth into an IVR. */
function keypadDob(dob: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  return m ? `${m[2]}${m[3]}${m[1]}` : null;
}

function getPatientDetails(rec: CallRecord, args: Args): string {
  const p = rec.request.patient;
  const asked = Array.isArray(args.fields) ? (args.fields as string[]) : ["date_of_birth", "insurance"];
  const out: string[] = [];
  if (asked.includes("date_of_birth")) {
    const pad = p.dateOfBirth ? keypadDob(p.dateOfBirth) : null;
    out.push(
      `Date of birth: ${p.dateOfBirth || "not on file"}` +
        (pad ? ` (to key into a phone menu, dtmf: ${pad})` : ""),
    );
  }
  if (asked.includes("callback_number")) {
    out.push(`Callback number: ${p.callbackNumber || "not on file"}`);
  }
  if (asked.includes("postal_code")) {
    // Zip is digits already, so it doubles as its own keypad string. US zips
    // are the common case; anything non-numeric (UK, CA) can only be spoken.
    const zip = p.postalCode?.trim();
    const keyable = zip && /^\d+$/.test(zip);
    out.push(
      zip
        ? `Zip code: ${zip}` + (keyable ? ` (to key into a phone menu, dtmf: ${zip})` : "")
        : "Zip code: not on file — do NOT guess one; offer another identifier or ask for staff",
    );
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

function authorize(
  rec: CallRecord,
  slot: OfferedSlot,
  zone: string,
  why: string,
): Promise<string> {
  rec.chosenSlot = slot;
  rec.status = "confirmed";
  // Echo the server's parse of the spoken time back to the agent: if STT or
  // chrono misread the date, the read-back with the office catches it here
  // instead of landing a wrong event on the calendar.
  const parsed = parseSlot(slot.startsAt, zone);
  const heard = parsed
    ? ` We understood that as ${parsed.toFormat("EEEE MMMM d yyyy, h:mm a")} — ` +
      `confirm that exact date and time with the office.`
    : "";
  return store.save(rec).then(
    () =>
      `action: book — approved (${why}). Book this exact slot with the office now: ` +
      `${slot.startsAt}${slot.provider ? ` with ${slot.provider}` : ""}.${heard} ` +
      `Then call finalize_booking (don't ask for a confirmation number; include ` +
      `one only if they offer it).`,
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

  // Green zone: a slot that fits your rules -> book on the spot. Preferred
  // provider wins over an earlier time with someone else.
  const best = pickBest(
    slots,
    rec.request.acceptableWindows,
    zone,
    rec.request.preferredProvider,
  );
  if (best) return authorize(rec, best, zone, "fits your preferred window");

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
      return authorize(rec, slots[idx], zone, "you approved it");
    }
    rec.status = "failed";
    rec.transcriptSummary = "Owner declined offered slots.";
    await store.save(rec);
    return "action: decline — none approved. Politely decline and end the call.";
  }

  // No tap in time -> fallback.
  return applyFallback(rec, slots, zone, "no reply in time");
}

/** No slot fits and we're not asking live: apply the request's own fallback
 *  choice (form: "book closest anyway" vs "decline politely"). */
async function applyFallback(
  rec: CallRecord,
  slots: OfferedSlot[],
  zone: string,
  why: string,
): Promise<string> {
  if (rec.request.allowOutsideWindows) {
    const slot = earliestOverall(slots, zone, rec.request.preferredProvider);
    if (slot) {
      await sendInfo(
        "⏱️ Booked the closest time",
        "It was outside your window (you allowed this). Open the app for details.",
      );
      return authorize(rec, slot, zone, `${why}; closest option`);
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
  // Trust boundary: the model could call finalize_booking without ever getting
  // (or despite being denied) approval from decide_and_book. Only a call whose
  // slot was authorized ("confirmed", or "booked" for a duplicate finalize) may
  // record a booking; otherwise send it back to decide_and_book.
  if (rec.status !== "confirmed" && rec.status !== "booked") {
    return (
      "action: none — no slot has been approved for booking. Do NOT commit to " +
      "a time with the office yet. Call decide_and_book with the offered " +
      'times first, and only book after it returns action "book".'
    );
  }

  const zone = rec.request.timezone || config.defaultTimezone;
  // The office has already verbally confirmed by the time finalize_booking
  // runs, so record what was actually booked — but if it drifted from the
  // approved slot AND falls outside the green zone, flag it for review rather
  // than reporting a clean success.
  let driftedOutOfZone = false;
  if (args.slot) {
    const s = args.slot as Record<string, unknown>;
    const finalized = OfferedSlot.parse({
      startsAt: s.starts_at,
      provider: s.provider,
      location: s.location,
      notes: s.notes,
    });
    driftedOutOfZone = driftedOutsideZone(
      finalized.startsAt,
      rec.chosenSlot?.startsAt,
      rec.request.acceptableWindows,
      zone,
    );
    rec.chosenSlot = finalized;
  }
  rec.status = "booked";
  const conf = args.confirmation_number as string | undefined;
  const prep = args.prep_instructions as string | undefined;
  rec.transcriptSummary =
    [
      conf ? `Confirmation: ${conf}` : null,
      prep ? `Prep: ${prep}` : null,
      driftedOutOfZone
        ? "⚠️ Booked time differs from the approved slot and is outside your windows — review."
        : null,
    ]
      .filter(Boolean)
      .join(" | ") || "Booked.";
  await store.save(rec);
  await upsertEvent(rec, false);
  await sendInfo(
    driftedOutOfZone ? "⚠️ Booked outside your window" : "✅ Appointment booked",
    driftedOutOfZone
      ? "The final time differs from the approved slot. Open the app to review."
      : "Open the app for the time and confirmation number.",
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
  const who =
    rec.request.patient.callerRelationship === "self"
      ? "the patient"
      : "a family member";
  return `action: escalate — tell them ${who} will call back, thank them, and end the call.`;
}

export { isPending };
