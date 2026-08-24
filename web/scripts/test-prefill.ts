/** What the booking wizard is allowed to remember between sessions.
 *  Guards two things: the office/doctor never carry over, and patient details
 *  always do — including through payloads written before the split existed. */
import {
  LEGACY_PREFILL_KEY,
  PER_CALL_FIELDS,
  persistable,
  prefillKey,
  restorable,
} from "../src/lib/prefill";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`);
  }
}

// Mirrors EMPTY_FORM in booking-form.tsx.
const FORM = {
  patientName: "Test Patient",
  dateOfBirth: "1990-01-01",
  postalCode: "94301",
  callerRelationship: "self",
  insuranceProvider: "Test Health",
  insuranceMemberId: "TEST123456",
  callbackNumber: "+15555550123",
  providerName: "Wellness Partners",
  providerPhone: "+15551234567",
  reason: "annual checkup",
  preferredProvider: "Dr. Chan",
  urgency: "routine",
  timezone: "America/Los_Angeles",
  days: ["mon"],
  earliest: "08:00",
  latest: "11:00",
  notBeforeDate: "",
  notAfterDate: "",
  allowOutsideWindows: false,
  extraNotes: "",
};

console.log("Persisted subset:");
const kept = persistable(FORM);
for (const f of ["patientName", "dateOfBirth", "postalCode", "callerRelationship"]) {
  ok(`${f} persists`, f in kept);
}
for (const f of ["insuranceProvider", "insuranceMemberId", "callbackNumber"]) {
  ok(`${f} persists`, f in kept);
}
ok("scheduling windows persist", "days" in kept && "earliest" in kept);

console.log("Per-call fields never persist:");
for (const f of ["providerName", "providerPhone", "preferredProvider", "timezone"]) {
  ok(`${f} dropped on write`, !(f in kept));
}

console.log("Restore:");
// A payload written by the OLD code, carrying office + doctor fields.
const legacy = { ...FORM };
const restored = restorable(legacy, FORM);
for (const f of ["providerName", "providerPhone", "preferredProvider", "timezone"]) {
  ok(`legacy ${f} not restored`, !(f in restored));
}
ok("legacy patient details still restored", restored.patientName === "Test Patient");
ok("legacy zip still restored", restored.postalCode === "94301");
ok(
  "unknown keys in a stale payload are ignored",
  !("injected" in restorable({ ...legacy, injected: "x" }, FORM)),
);
ok("round-trip is stable", JSON.stringify(restorable(persistable(FORM) as Record<string, unknown>, FORM)) === JSON.stringify(kept));
ok(
  "every per-call field is a real form key",
  [...PER_CALL_FIELDS].every((f) => f in FORM),
);

console.log("Per-user scoping:");
ok("two users get different keys", prefillKey("user_aaa") !== prefillKey("user_bbb"));
ok("the same user gets a stable key", prefillKey("user_aaa") === prefillKey("user_aaa"));
ok("the user id is what scopes the key", prefillKey("user_aaa").includes("user_aaa"));
ok(
  "no scoped key can collide with the legacy one",
  prefillKey("user_aaa") !== LEGACY_PREFILL_KEY,
);
ok(
  "the legacy key is not a prefix match for a scoped key",
  !prefillKey("user_aaa").startsWith(LEGACY_PREFILL_KEY + "_"),
);

console.log(fail === 0 ? `\n✅ ${pass} passed, 0 failed` : `\n❌ ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
