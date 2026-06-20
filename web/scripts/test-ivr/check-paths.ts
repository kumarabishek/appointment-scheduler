/** Regression test for the test-IVR menu tree — no server or phone needed.
 *
 *   npm run test:ivr
 *
 * Asserts the menu wiring in src/lib/testIvr.ts: each keypress resolves to the
 * right submenu / connect / hangup, invalid keys reprompt, and the expected
 * multi-level sequences actually reach a scheduler. Exits non-zero on failure.
 */
import { MENUS, transition } from "../../src/lib/testIvr";

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
  ok("main 5 → invalid reprompt", has("main", "5", "isn't a valid option") && has("main", "5", "menu=main"));

  ok("appointments 1 → new submenu", has("appointments", "1", "menu=new"));
  ok("appointments 2 → connect (hold)", has("appointments", "2", "Please hold"));
  ok("appointments 3 → connect (hold)", has("appointments", "3", "Please hold"));
  ok("appointments 9 → back to main", has("appointments", "9", "menu=main"));

  ok("new 1 → connect (hold)", has("new", "1", "Please hold"));
  ok("new 2 → connect (hold)", has("new", "2", "Please hold"));
  ok("new 9 → back to appointments", has("new", "9", "menu=appointments"));
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

  ok("checkup 1→2 reaches operator", reaches(["1", "2"], "CONNECT"));
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
  }
  ok("no dangling menu targets", dangling === "", `dangling:${dangling}`);
}

checkTransitions();
checkSequences();
checkIntegrity();

console.log(`\n${failed ? "❌" : "✅"} ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
