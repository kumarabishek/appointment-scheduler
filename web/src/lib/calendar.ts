/** Land a booked appointment on a calendar.
 *
 * Pushes a real Google Calendar event when Google is configured; otherwise
 * falls back to a local .ics file (handy for dev / offline). The rest of the
 * app calls upsertEvent and doesn't care which path runs.
 */
import { promises as fs } from "fs";
import path from "path";
import { googleConfigured } from "./config";
import { createEvent } from "./googleCalendar";
import { sendInfo } from "./push";
import { CallRecord } from "./types";

const ICS = path.join(process.cwd(), "data", "appointments.ics");

export async function upsertEvent(rec: CallRecord, tentative = false): Promise<void> {
  if (googleConfigured()) {
    const result = await createEvent(rec, tentative);
    if (!result.ok) {
      // Don't silently lose the appointment — tell the owner to add it manually.
      await sendInfo(
        `⚠️ Couldn't add to calendar: ${rec.request.patient.name}`,
        `${rec.chosenSlot?.startsAt ?? "appointment"} at ${rec.request.providerName}. ` +
          `Add it manually. (${result.reason})`,
      );
    }
    return;
  }
  await writeIcs(rec, tentative);
}

async function writeIcs(rec: CallRecord, tentative: boolean): Promise<void> {
  const slot = rec.chosenSlot;
  if (!slot) return;
  const status = tentative ? "TENTATIVE" : "CONFIRMED";
  const summary = `${rec.request.reason} — ${rec.request.patient.name}`;
  const desc = `At ${rec.request.providerName}. Provider: ${slot.provider ?? "TBD"}. ${slot.notes ?? ""}`.trim();
  const block =
    "BEGIN:VEVENT\n" +
    `UID:${rec.id}@appointment-scheduler\n` +
    `SUMMARY:${summary}\n` +
    `STATUS:${status}\n` +
    `DESCRIPTION:${desc} (time as offered: ${slot.startsAt})\n` +
    `LOCATION:${slot.location ?? rec.request.providerName}\n` +
    "END:VEVENT\n";

  await fs.mkdir(path.dirname(ICS), { recursive: true });
  let content: string;
  try {
    content = await fs.readFile(ICS, "utf8");
  } catch {
    content = "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR\n";
  }
  content = content.replace("END:VCALENDAR\n", block + "END:VCALENDAR\n");
  await fs.writeFile(ICS, content);
}
