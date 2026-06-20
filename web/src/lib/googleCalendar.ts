/** Create real Google Calendar events for booked appointments.
 *
 * Uses an OAuth2 refresh token (one-time setup; see scripts/google-auth.ts).
 * Needs a concrete datetime, so we parse the office's spoken time with
 * chrono-node. If it won't parse, we DON'T invent an event — we report back so
 * the caller can fall back / notify instead of dropping a wrong time on you.
 */
import { google } from "googleapis";
import { config } from "./config";
import { parseSlot } from "./matching";
import { CallRecord } from "./types";

export type CalendarResult = { ok: boolean; htmlLink?: string; reason?: string };

function zoneFor(rec: CallRecord): string {
  return rec.request.timezone || config.defaultTimezone;
}

function client() {
  const auth = new google.auth.OAuth2(config.googleClientId, config.googleClientSecret);
  auth.setCredentials({ refresh_token: config.googleRefreshToken });
  return google.calendar({ version: "v3", auth });
}

export async function createEvent(
  rec: CallRecord,
  tentative = false,
): Promise<CalendarResult> {
  const slot = rec.chosenSlot;
  if (!slot) return { ok: false, reason: "no chosen slot" };

  const zone = zoneFor(rec);
  const start = parseSlot(slot.startsAt, zone);
  if (!start) {
    return { ok: false, reason: `could not parse time "${slot.startsAt}"` };
  }
  const end = start.plus({ minutes: config.appointmentMinutes });

  const summary = `${rec.request.reason} — ${rec.request.patient.name}`;
  const description =
    `Booked by the appointment agent at ${rec.request.providerName}.\n` +
    `Provider: ${slot.provider ?? "TBD"}.\n` +
    `Time as offered by the office: ${slot.startsAt}.` +
    (rec.transcriptSummary ? `\n${rec.transcriptSummary}` : "");

  try {
    const res = await client().events.insert({
      calendarId: config.googleCalendarId,
      requestBody: {
        summary,
        description,
        location: slot.location ?? rec.request.providerName,
        status: tentative ? "tentative" : "confirmed",
        start: { dateTime: start.toISO() ?? undefined, timeZone: zone },
        end: { dateTime: end.toISO() ?? undefined, timeZone: zone },
        // Stable id so re-runs update rather than duplicate. Google requires
        // base32hex (lowercase a-v + 0-9); strip anything else from our id.
        ...idFor(rec.id),
      },
    });
    return { ok: true, htmlLink: res.data.htmlLink ?? undefined };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

function idFor(recordId: string): { id?: string } {
  const cleaned = recordId.toLowerCase().replace(/[^a-v0-9]/g, "");
  return cleaned.length >= 5 ? { id: cleaned } : {};
}
