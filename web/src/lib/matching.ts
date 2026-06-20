/** Decide whether an offered slot falls inside your pre-approved "green zone".
 *
 * The office speaks times in ITS local zone ("Tuesday 9:30") with no offset.
 * We parse the flexible wording with chrono-node, then anchor the wall-clock
 * components to the request's IANA timezone with luxon — so the absolute
 * instant (and DST) is correct regardless of where the server or booker is.
 *
 * If a slot won't parse, we treat it as NOT auto-approvable and fall back to
 * asking you — the safe direction.
 */
import * as chrono from "chrono-node";
import { DateTime } from "luxon";
import { OfferedSlot, TimeWindow } from "./types";

// luxon weekday: Monday=1 .. Sunday=7
const DAY_INDEX: Record<string, number> = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
};

/** Parse a spoken slot into a zone-anchored DateTime, or null if unparseable. */
export function parseSlot(
  text: string,
  zone: string,
  ref: DateTime = DateTime.now().setZone(zone),
): DateTime | null {
  const results = chrono.parse(text, ref.toJSDate(), { forwardDate: true });
  if (!results.length) return null;
  const c = results[0].start;
  const dt = DateTime.fromObject(
    {
      year: c.get("year") ?? ref.year,
      month: c.get("month") ?? ref.month,
      day: c.get("day") ?? ref.day,
      hour: c.get("hour") ?? 9,
      minute: c.get("minute") ?? 0,
    },
    { zone },
  );
  return dt.isValid ? dt : null;
}

function inWindow(dt: DateTime, w: TimeWindow): boolean {
  if (w.days.length) {
    const allowed = new Set(
      w.days
        .map((x) => DAY_INDEX[x.toLowerCase().slice(0, 3)])
        .filter((n): n is number => n !== undefined),
    );
    if (allowed.size && !allowed.has(dt.weekday)) return false;
  }
  const t = dt.toFormat("HH:mm");
  if (!(w.earliest <= t && t <= w.latest)) return false;
  const date = dt.toISODate() ?? "";
  if (w.notBeforeDate && date < w.notBeforeDate) return false;
  if (w.notAfterDate && date > w.notAfterDate) return false;
  return true;
}

export function inGreenZone(dt: DateTime, windows: TimeWindow[]): boolean {
  if (!windows.length) return true; // no constraints = anything acceptable
  return windows.some((w) => inWindow(dt, w));
}

/** Earliest slot that fits the green zone (rule: soonest acceptable). */
export function pickBest(
  slots: OfferedSlot[],
  windows: TimeWindow[],
  zone: string,
): OfferedSlot | null {
  const candidates: Array<[OfferedSlot, DateTime]> = [];
  for (const s of slots) {
    const dt = parseSlot(s.startsAt, zone);
    if (dt && inGreenZone(dt, windows)) candidates.push([s, dt]);
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a[1].toMillis() - b[1].toMillis());
  return candidates[0][0];
}

/** Soonest offered slot regardless of green zone (used by 'closest' fallback). */
export function earliestOverall(slots: OfferedSlot[], zone: string): OfferedSlot | null {
  const dated = slots
    .map((s) => [s, parseSlot(s.startsAt, zone)] as const)
    .filter((pair): pair is [OfferedSlot, DateTime] => pair[1] !== null);
  if (!dated.length) return slots[0] ?? null;
  dated.sort((a, b) => a[1].toMillis() - b[1].toMillis());
  return dated[0][0];
}
