/** get_patient_details: the strings the agent reads to the office.
 *
 * Guards two things that failed on real calls: a 10-digit number spoken as one
 * run (took five attempts with a live receptionist), and the keypad form
 * staying free of the punctuation added for speech.
 */
import { readFileSync } from "fs";
import { dispatchTool } from "../src/lib/booking";
import { AppointmentRequest, CallRecord } from "../src/lib/types";

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const base = JSON.parse(readFileSync("scripts/test-ivr/test-request.json", "utf8"));
const rec = (patch: Record<string, unknown>) =>
  CallRecord.parse({ request: AppointmentRequest.parse({ ...base, patient: { ...base.patient, ...patch } }) });
const call = (patch: Record<string, unknown>, fields: string[]) =>
  dispatchTool(rec(patch), "get_patient_details", { fields });

(async () => {
  console.log("Callback number — spoken form:");
  const e164 = await call({ callbackNumber: "+14155550142" }, ["callback_number"]);
  ok("E.164 is grouped 3-3-4", e164.includes("415-555-0142"));
  // Only the spoken half matters here — the bare run inside "dtmf: …" is the
  // keypad form and is meant to have no punctuation.
  ok("spoken half is never a bare 10-digit run", !/\d{10}/.test(e164.split(" (")[0]));
  ok("carries the say-it-in-groups instruction", /three groups/.test(e164));

  ok("bare 10 digits are grouped", (await call({ callbackNumber: "4155550142" }, ["callback_number"])).includes("415-555-0142"));
  ok("leading 1 is stripped", (await call({ callbackNumber: "14155550142" }, ["callback_number"])).includes("415-555-0142"));
  ok("punctuated input is normalised", (await call({ callbackNumber: "(415) 555-0142" }, ["callback_number"])).includes("415-555-0142"));

  console.log("Keypad form stays clean:");
  const kp = /dtmf: (\S+?)\)/.exec(e164);
  ok("a dtmf string is offered at all", !!kp);
  ok("dtmf is bare digits — no hyphens or spaces", !!kp && /^\d{10}$/.test(kp[1]));
  ok("dtmf matches the real number", !!kp && kp[1] === "4155550142");

  console.log("Non-NANP and missing values:");
  const uk = await call({ callbackNumber: "+447700900123" }, ["callback_number"]);
  ok("a non-NANP number is left as stored", uk.includes("+447700900123"));
  ok("and gets no keypad string", !/dtmf:/.test(uk));
  ok("too few digits are left alone", (await call({ callbackNumber: "12345" }, ["callback_number"])).includes("12345"));
  ok("missing number says not on file", (await call({ callbackNumber: null }, ["callback_number"])).includes("not on file"));

  console.log("Other fields still behave:");
  const dob = await call({}, ["date_of_birth"]);
  ok("date of birth keeps its keypad string", /dtmf: \d{8}/.test(dob));
  const zip = await call({}, ["postal_code"]);
  ok("zip keeps its keypad string", /dtmf: \d{5}/.test(zip));

  console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
