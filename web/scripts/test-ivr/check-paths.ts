/** Regression test for the test-IVR menu tree — no server or phone needed.
 *
 *   npm run test:ivr
 *
 * Asserts the menu wiring in src/lib/testIvr.ts: each keypress resolves to the
 * right submenu / connect / hangup, invalid keys reprompt, and the expected
 * multi-level sequences actually reach a scheduler. Exits non-zero on failure.
 */
import { MENUS, renderMenu, transition } from "../../src/lib/testIvr";

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

/** Single-keypress transitions render the expected TwiML. */
function checkTransitions() {
  console.log("Transitions:");
  const has = (menu: string, digit: string, needle: string) =>
    transition(menu, digit).includes(needle);

  ok("main 1 → appointments submenu", has("main", "1", "menu=appointments"));
  ok("main 2 → billing hangup", has("main", "2", "<Hangup/>") && !has("main", "2", "<Gather"));
  ok("main 9 → repeats main", has("main", "9", "menu=main"));
  ok("main 5 → invalid reprompt", has("main", "5", "didn't catch that") && has("main", "5", "menu=main"));

  ok("appointments 1 → new submenu", has("appointments", "1", "menu=new"));
  ok("appointments 2 → DOB gate", has("appointments", "2", "menu=dob"));
  ok("appointments 3 → connect (hold)", has("appointments", "3", "Please hold"));
  ok("appointments 9 → back to main", has("appointments", "9", "menu=main"));

  ok("new 1 → connect (hold)", has("new", "1", "Please hold"));
  ok("new 2 → connect (hold)", has("new", "2", "Please hold"));
  ok("new 9 → back to appointments", has("new", "9", "menu=appointments"));

  // DOB gate: collects 8 digits; only the test patient's MMDDYYYY advances.
  ok("dob gathers 8 digits", renderMenu("dob").includes('numDigits="8"'));
  ok("dob correct entry → callback offer", has("dob", "01011990", "menu=callback"));
  ok(
    "dob wrong entry → reprompt",
    has("dob", "12345678", "does not match our records") &&
      has("dob", "12345678", "menu=dob"),
  );

  // Callback offer: pressing 1 is the wrong move (call ends, no booking);
  // silence times out into hold → operator.
  ok(
    "callback 1 → accepted + hangup (failure path)",
    has("callback", "1", "receive a callback") && has("callback", "1", "<Hangup/>"),
  );
  ok(
    "callback silence → hold → operator",
    renderMenu("callback").includes("Please hold for the next available scheduler"),
  );

  // Speech-driven main menu (hybrid: speech + DTMF both accepted).
  const say = (menu: string, phrase: string, needle: string) =>
    transition(menu, "", phrase).includes(needle);
  ok("main gather is hybrid (speech dtmf)", renderMenu("main").includes('input="speech dtmf"'));
  ok(
    'speech "schedule an appointment" → appointments',
    say("main", "I'd like to schedule an appointment", "menu=appointments"),
  );
  ok('speech "annual checkup" → appointments', say("main", "an annual checkup please", "menu=appointments"));
  ok('speech "billing question" → billing hangup', say("main", "a billing question", "<Hangup/>"));
  ok(
    "unrecognized speech → didn't-catch reprompt",
    say("main", "I want to order a pizza", "didn't catch that") &&
      say("main", "I want to order a pizza", "menu=main"),
  );
  ok("digits still win on the hybrid menu", has("main", "1", "menu=appointments"));
}

/** Walk the tree by digits, mirroring the runtime transitions. */
function walk(digits: string[]): { terminal?: string; menu?: string; stuckAt?: string } {
  let menu = "main";
  for (const d of digits) {
    const t = MENUS[menu]?.options[d];
    if (!t) return { stuckAt: `${menu}:${d}` };
    if (t === "CONNECT" || t === "HANGUP") return { terminal: t };
    menu = t;
  }
  return { menu };
}

/** Multi-level sequences reach the right place. */
function checkSequences() {
  console.log("Sequences:");
  const reaches = (digits: string[], terminal: string) => walk(digits).terminal === terminal;
  const lands = (digits: string[], menu: string) => walk(digits).menu === menu;

  ok("existing patient 1→2 reaches DOB gate", lands(["1", "2"], "dob"));
  ok(
    "existing patient 1→2→DOB reaches callback offer",
    lands(["1", "2", "01011990"], "callback"),
  );
  ok(
    "accepting the callback ends the call (failure path)",
    lands(["1", "2", "01011990", "1"], "callback_accepted"),
  );
  ok("lab 1→3 reaches operator", reaches(["1", "3"], "CONNECT"));
  ok("new primary 1→1→1 reaches operator", reaches(["1", "1", "1"], "CONNECT"));
  ok("new specialist 1→1→2 reaches operator", reaches(["1", "1", "2"], "CONNECT"));
  ok("billing 2 ends (no connect)", lands(["2"], "billing"));
  ok("back-nav 1→1→9 returns to appointments", lands(["1", "1", "9"], "appointments"));
}

/** Every non-special menu target points at a real menu (no dangling keys). */
function checkIntegrity() {
  console.log("Integrity:");
  let dangling = "";
  for (const [key, menu] of Object.entries(MENUS)) {
    for (const [digit, target] of Object.entries(menu.options)) {
      if (target !== "CONNECT" && target !== "HANGUP" && !MENUS[target]) {
        dangling += ` ${key}:${digit}→${target}`;
      }
    }
    const t = menu.timeoutTarget;
    if (t && t !== "CONNECT" && !MENUS[t]) dangling += ` ${key}:timeout→${t}`;
    for (const [fragment, target] of Object.entries(menu.speech ?? {})) {
      if (target !== "CONNECT" && target !== "HANGUP" && !MENUS[target]) {
        dangling += ` ${key}:"${fragment}"→${target}`;
      }
    }
  }
  ok("no dangling menu targets", dangling === "", `dangling:${dangling}`);
}

checkTransitions();
checkSequences();
checkIntegrity();

console.log(`\n${failed ? "❌" : "✅"} ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
