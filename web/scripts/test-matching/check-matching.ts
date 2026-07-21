/** Unit tests for the slot-matching core — no server or phone needed.
 *
 *   npm run test:matching
 *
 * These functions decide WHAT GETS BOOKED (parse the office's spoken time,
 * check it against the green zone, pick the best slot, flag finalize drift),
 * so they get deterministic tests: fixed reference dates in 2030, explicit
 * IANA zones. Exits non-zero on failure.
 */
import { DateTime } from "luxon";
import {
  driftedOutsideZone,
  earliestOverall,
  inGreenZone,
  parseSlot,
  pickBest,
} from "../../src/lib/matching";
import { TimeWindow } from "../../src/lib/types";

const ZONE = "America/New_York";
// Monday noon, well in the future so forwardDate never bites (verified: Jun 10
// 2030 is a Monday, Jun 17 a Monday, Jun 18 a Tuesday).
const REF = DateTime.fromObject(
  { year: 2030, month: 6, day: 10, hour: 12 },
  { zone: ZONE },
);

/** Build a TimeWindow via the zod defaults, like real requests do. */
const win = (o: Partial<TimeWindow> = {}): TimeWindow => TimeWindow.parse(o);

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function checkParseSlot() {
  console.log("parseSlot:");
  ok("reference date is a Monday (test sanity)", REF.weekday === 1);

  const abs = parseSlot("Jun 17 2030 at 9:30 AM", ZONE, REF);
  ok(
    "absolute date+time parses to the right wall clock",
    !!abs && abs.toISODate() === "2030-06-17" && abs.hour === 9 && abs.minute === 30,
    String(abs),
  );
  ok(
    "wall clock is anchored to the office's zone (EDT, UTC-4)",
    !!abs && abs.offset === -240 && abs.toUTC().hour === 13,
    String(abs),
  );

  const la = parseSlot("Jun 17 2030 at 9:30 AM", "America/Los_Angeles", REF);
  ok(
    "same words in a different zone = a different instant",
    !!abs && !!la && la.toMillis() - abs.toMillis() === 3 * 60 * 60 * 1000,
  );

  const tue = parseSlot("Tuesday at 2 PM", ZONE, REF);
  ok(
    "bare weekday resolves forward from the reference date",
    !!tue && tue.toISODate() === "2030-06-11" && tue.hour === 14,
    String(tue),
  );

  // ref is noon — a bare "9:30 AM" resolves to TODAY 9:30, already in the
  // past. Past instants must never be auto-bookable (chrono's forwardDate
  // doesn't roll bare times forward), so parseSlot rejects them.
  ok("time already in the past → null (human review)", parseSlot("9:30 AM", ZONE, REF) === null);
  ok("explicit past date → null (human review)", parseSlot("Jan 5 2020 at 9:30 AM", ZONE, REF) === null);
  ok(
    "bare time still in the future today parses",
    parseSlot("4:30 PM", ZONE, REF)?.toISODate() === "2030-06-10",
  );

  ok("gibberish returns null (falls back to human review)", parseSlot("asdfgh", ZONE, REF) === null);
}

function checkGreenZone() {
  console.log("inGreenZone:");
  const tue10 = DateTime.fromObject(
    { year: 2030, month: 6, day: 18, hour: 10 }, // Tuesday
    { zone: ZONE },
  );
  const weekdays9to5 = [win({ days: ["mon", "tue", "wed", "thu", "fri"], earliest: "09:00", latest: "17:00" })];

  ok("Tuesday 10 AM fits a weekday 9-5 window", inGreenZone(tue10, weekdays9to5));
  ok("wrong day is rejected", !inGreenZone(tue10, [win({ days: ["sat", "sun"] })]));
  ok(
    "time after the window is rejected",
    !inGreenZone(tue10.set({ hour: 20 }), weekdays9to5),
  );
  ok(
    "window edges are inclusive",
    inGreenZone(tue10.set({ hour: 9, minute: 0 }), weekdays9to5) &&
      inGreenZone(tue10.set({ hour: 17, minute: 0 }), weekdays9to5),
  );
  ok(
    "notBeforeDate excludes earlier dates",
    !inGreenZone(tue10, [win({ notBeforeDate: "2030-06-19" })]) &&
      inGreenZone(tue10, [win({ notBeforeDate: "2030-06-18" })]),
  );
  ok(
    "notAfterDate excludes later dates",
    !inGreenZone(tue10, [win({ notAfterDate: "2030-06-17" })]),
  );
  ok("no windows = everything acceptable", inGreenZone(tue10, []));
  ok(
    "any one of several windows suffices",
    inGreenZone(tue10, [win({ days: ["sat"] }), win({ days: ["tue"] })]),
  );
}

function checkPickBest() {
  console.log("pickBest / earliestOverall:");
  const slots = [
    { startsAt: "Jun 20 2030 at 3:00 PM" },
    { startsAt: "Jun 18 2030 at 10:00 AM" },
    { startsAt: "Jun 19 2030 at 8:00 PM" }, // outside 08:00-18:00
  ];
  const business = [win({ earliest: "08:00", latest: "18:00" })];

  ok(
    "picks the EARLIEST slot that fits, not the first listed",
    pickBest(slots, business, ZONE)?.startsAt === "Jun 18 2030 at 10:00 AM",
  );
  ok(
    "returns null when nothing fits (falls back to asking you)",
    pickBest([{ startsAt: "Jun 19 2030 at 8:00 PM" }], business, ZONE) === null,
  );
  ok(
    "unparseable slots are skipped, not booked",
    pickBest([{ startsAt: "whenever works" }, ...slots], business, ZONE)?.startsAt ===
      "Jun 18 2030 at 10:00 AM",
  );
  ok(
    "earliestOverall ignores the green zone (closest fallback)",
    earliestOverall(
      [{ startsAt: "Jun 19 2030 at 8:00 PM" }, { startsAt: "Jun 18 2030 at 7:00 PM" }],
      ZONE,
    )?.startsAt === "Jun 18 2030 at 7:00 PM",
  );
}

function checkDrift() {
  console.log("driftedOutsideZone (finalize guard):");
  const business = [win({ earliest: "08:00", latest: "18:00" })];
  const approved = "Jun 18 2030 at 10:00 AM";

  ok(
    "identical time → no flag",
    !driftedOutsideZone(approved, approved, business, ZONE),
  );
  ok(
    "same time, different wording → no flag",
    !driftedOutsideZone("Tuesday June 18th 2030, 10 AM", approved, business, ZONE),
  );
  ok(
    "small shift within tolerance → no flag",
    !driftedOutsideZone("Jun 18 2030 at 10:04 AM", approved, business, ZONE),
  );
  ok(
    "big shift but still inside the window → no flag",
    !driftedOutsideZone("Jun 18 2030 at 2:00 PM", approved, business, ZONE),
  );
  ok(
    "big shift OUTSIDE the window → flagged",
    driftedOutsideZone("Jun 18 2030 at 8:00 PM", approved, business, ZONE),
  );
  ok(
    "no approved slot + outside window → flagged",
    driftedOutsideZone("Jun 18 2030 at 8:00 PM", null, business, ZONE),
  );
  ok(
    "no approved slot but inside window → no flag",
    !driftedOutsideZone("Jun 18 2030 at 10:00 AM", null, business, ZONE),
  );
  ok(
    "unverifiable (unparseable) finalized time → flagged",
    driftedOutsideZone("the same time we said", approved, business, ZONE),
  );
}

checkParseSlot();
checkGreenZone();
checkPickBest();
checkDrift();

console.log(`\n${failed ? "❌" : "✅"} ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
