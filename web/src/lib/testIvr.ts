/** Data-driven multi-level test IVR (fake doctor's office phone tree).
 *
 * Each menu maps a pressed digit to a target: another menu key, or a special
 * action — "CONNECT" (hold music → operator) or "HANGUP" (say + end). TwiML is
 * stateless, so the current menu travels in the Gather's action URL
 * (?menu=<key>) and handle-key looks up the transition from there.
 *
 * To reach a scheduler the agent must navigate a sequence, e.g.:
 *   existing-patient checkup → 1 (appointments) → 2 (reschedule)
 *                            → key in DOB (01011990) → decline callback  [4 levels]
 *   new primary-care visit   → 1 (appointments) → 1 (new) → 1 (primary)  [3 levels]
 *
 * Three unannounced branches off the main menu exist to rehearse failure modes
 * rather than the happy path: 3 = a dead end that loops on itself, 4 = a wall
 * demanding an account number the agent was never given, 6 = a closed office
 * whose machine answers. The scheduling path deliberately has NO 0-to-operator
 * shortcut, so the DOB gate still has to be navigated properly.
 */
import { config } from "./config";

type Menu = {
  prompt: string;
  /** Entry → menu key | "CONNECT" | "HANGUP". Empty options = terminal.
   *  Keys are matched against the FULL Gather entry, so a multi-digit menu
   *  (numDigits > 1) can gate on an exact code, e.g. the patient's DOB. */
  options: Record<string, string>;
  /** Digits the Gather collects before submitting (default 1). */
  numDigits?: number;
  /** Spoken before reprompting on a wrong entry (default: generic). */
  invalidPrompt?: string;
  /** Where NO input goes: "CONNECT" sends silent callers to hold → operator
   *  (the callback-offer menu: staying quiet is the correct move). Default:
   *  goodbye + hangup. */
  timeoutTarget?: string;
  /** Speech routing (lowercase keyword fragment → target). Present = the
   *  Gather becomes hybrid (input="speech dtmf"): the caller can SAY the
   *  reason or press a key. First matching fragment wins. */
  speech?: Record<string, string>;
};

export const MENUS: Record<string, Menu> = {
  main: {
    // Speech-first greeting, like modern medical IVRs. Keys still work but are
    // deliberately NOT announced: the agent prefers keys on hybrid menus, so
    // announcing them would let it skip the speech path this menu exists to
    // test. (Humans doing manual runs can still press 1/2/9.)
    prompt:
      "Thank you for calling Wellness Partners. In a few words, please tell me the reason for your call — for example, scheduling an appointment, or billing.",
    // 3/4/6 are deliberately UNANNOUNCED failure-mode branches used in
    // rehearsals: a dead end, an account-number wall, and a closed office.
    // 5 stays unmapped on purpose — the invalid-entry test depends on it.
    options: {
      "1": "appointments",
      "2": "billing",
      "3": "records",
      "4": "account",
      "6": "machine",
      "9": "main",
    },
    speech: {
      appointment: "appointments",
      schedul: "appointments",
      reschedul: "appointments",
      checkup: "appointments",
      "check up": "appointments",
      doctor: "appointments",
      lab: "appointments",
      blood: "appointments",
      billing: "billing",
      bill: "billing",
    },
    invalidPrompt: "Sorry, I didn't catch that. ",
  },
  appointments: {
    prompt:
      "Appointments. For a new appointment, press 1. To schedule or reschedule as an existing patient, press 2. For lab or bloodwork, press 3. To go back, press 9.",
    options: { "1": "new", "2": "dob", "3": "CONNECT", "9": "main" },
  },
  new: {
    prompt:
      "New appointment. For primary care, press 1. For a specialist, press 2. To go back, press 9.",
    options: { "1": "CONNECT", "2": "CONNECT", "9": "appointments" },
  },
  // Identity gate: the agent must fetch the DOB via get_patient_details and key
  // it in as digits — it is deliberately NOT in the agent's system prompt.
  dob: {
    prompt:
      "To access scheduling, please enter the patient's date of birth using your keypad: two digits for the month, two digits for the day, and four digits for the year.",
    // Must match the DOB in scripts/test-ivr/test-request.json (1990-01-01 → MMDDYYYY).
    options: { "01011990": "zip" },
    numDigits: 8,
    invalidPrompt: "That does not match our records. ",
  },
  // Second identity gate, modeled on the real Sutter Health line (2026-08-23):
  // its AI receptionist asks for the date of birth and then, as a SEPARATE
  // follow-up turn, the zip code — and will not route to scheduling without
  // both. Nothing in the old tree tested a second identifier, so an agent that
  // could only supply a DOB looked fine here and would stall on a real call.
  zip: {
    prompt: "And the patient's five digit zip code, please.",
    // Must match postalCode in scripts/test-ivr/test-request.json.
    options: { "94301": "callback" },
    numDigits: 5,
    invalidPrompt: "That zip code does not match the patient's record. ",
  },
  // Callback-queue offer: pressing 1 is the WRONG move (the agent's number
  // can't take return calls) — the correct behavior is to stay silent, which
  // times out into hold → operator.
  callback: {
    prompt:
      "All of our schedulers are currently assisting other callers. To hang up now and receive a callback, press 1. Otherwise, please remain on the line.",
    options: { "1": "callback_accepted" },
    timeoutTarget: "CONNECT",
  },
  callback_accepted: {
    // Terminal: for the agent this is a FAILED call (ends with no booking).
    prompt: "Thank you. You will receive a callback within two business days. Goodbye.",
    options: {},
  },
  // Dead end: a real branch with NO route to scheduling. 1 and 2 loop straight
  // back here, so an agent that keeps pressing gets nowhere; the only ways out
  // are the operator escape (0) or backing out to main (9). Exercises the
  // "same menu twice means you're going in circles" rule.
  records: {
    prompt:
      "Medical records. To request records by fax, press 1. To check the status of an existing request, press 2. To go back, press 9.",
    options: { "0": "CONNECT", "1": "records", "2": "records", "9": "main" },
    invalidPrompt: "Sorry, that isn't a valid option. ",
  },
  // Identity wall: demands a number the caller was never given. Nothing the
  // agent holds can satisfy it, so the correct move is to stop guessing and
  // take the operator escape rather than invent an account number. (Twilio
  // submits whatever it has when the Gather times out, so a lone 0 still
  // reaches CONNECT despite numDigits.)
  account: {
    prompt:
      "Please enter your six digit account number. If you do not have your account number, press 0 to speak with staff.",
    options: { "0": "CONNECT" },
    numDigits: 6,
    invalidPrompt: "We could not find that account number. ",
  },
  // Closed office: an answering machine picks up instead of a hold queue.
  // Terminal — the agent must leave NO patient details, just end the call.
  machine: {
    prompt:
      "You have reached Wellness Partners. Our office is closed. Our hours are Monday through Friday, nine AM to five PM. Please leave your name and number after the tone and we will return your call.",
    options: {},
  },
  billing: {
    // Terminal menu (no options): plays the message and hangs up.
    prompt: "Our billing office is closed. Please call back during business hours. Goodbye.",
    options: {},
  },
};

const SAY = (text: string) => `<Say voice="alice">${text}</Say>`;

export function twimlResponse(xml: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`, {
    headers: { "Content-Type": "text/xml" },
  });
}

/** Render a menu as a Gather (or a terminal say+hangup if it has no options).
 *  `prefix` lets us prepend a "that wasn't valid" note when reprompting. */
export function renderMenu(menuKey: string, prefix = "", attempt = 1): string {
  // Resolve the key BEFORE building URLs: an unknown name falls back to main,
  // and the Gather/Redirect must then say "main" too. Stamping the bogus name
  // into the action URL would leave the caller hearing one menu while the next
  // hop pointed at another.
  const key = MENUS[menuKey] ? menuKey : "main";
  const menu = MENUS[key];
  if (Object.keys(menu.options).length === 0) {
    return `<Response>\n  ${SAY(prefix + menu.prompt)}\n  <Hangup/>\n</Response>`;
  }
  // No input falls through to whatever follows the Gather: the menu's timeout
  // target (the callback menu connects silent callers), ONE "still there?"
  // reprompt (real IVRs re-ask, and in-band DTMF is occasionally lost — a
  // single missed burst shouldn't kill the call), then goodbye + hangup.
  const afterGather =
    menu.timeoutTarget === "CONNECT"
      ? connectBody()
      : attempt < 2
        ? `<Redirect method="POST">/api/test-ivr/handle-key?menu=${key}&amp;reprompt=2</Redirect>`
        : `${SAY("Sorry, we did not receive your selection. Goodbye.")}\n  <Hangup/>`;
  // Hybrid menus accept speech AND keypresses; hints help Twilio's recognizer.
  const input = menu.speech
    ? ` input="speech dtmf" speechTimeout="auto" hints="appointment, schedule, reschedule, checkup, lab, blood work, billing"`
    : "";
  return `<Response>
  <Gather numDigits="${menu.numDigits ?? 1}"${input} action="/api/test-ivr/handle-key?menu=${key}" method="POST" timeout="10">
    ${SAY(prefix + menu.prompt)}
  </Gather>
  ${afterGather}
</Response>`;
}

/** Hold music, then the "operator" (your cell) or a scripted voice. */
function connectBody(): string {
  const operator = config.testOperatorPhone
    ? `<Dial timeout="45"><Number>${config.testOperatorPhone}</Number></Dial>`
    : `${SAY("Scheduling, this is Riley. What day works best for you?")}
  <Pause length="6"/>
  ${SAY("Okay, our earliest opening is Tuesday at 9:30 AM. Does that work?")}
  <Pause length="6"/>
  ${SAY("Great, you're all set. Your confirmation number is 4 8 2 1. Goodbye.")}
  <Hangup/>`;
  return `${SAY("Please hold for the next available scheduler.")}
  <Pause length="3"/>
  ${operator}`;
}

export function renderConnect(): string {
  return `<Response>\n  ${connectBody()}\n</Response>`;
}

/** Resolve a keypress (or multi-digit entry, or spoken phrase) within a menu
 *  to the next TwiML. Digits win over speech when both arrive. */
export function transition(menuKey: string, digits: string, speech = ""): string {
  const menu = MENUS[menuKey] ?? MENUS.main;
  let target = menu.options[digits];
  if (!target && speech && menu.speech) {
    const said = speech.toLowerCase();
    for (const [fragment, t] of Object.entries(menu.speech)) {
      if (said.includes(fragment)) {
        target = t;
        break;
      }
    }
  }
  if (!target) {
    return renderMenu(menuKey, menu.invalidPrompt ?? "Sorry, that isn't a valid option. ");
  }
  if (target === "CONNECT") return renderConnect();
  if (target === "HANGUP") return `<Response>\n  ${SAY("Goodbye.")}\n  <Hangup/>\n</Response>`;
  return renderMenu(target);
}
