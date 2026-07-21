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
};

export const MENUS: Record<string, Menu> = {
  main: {
    prompt:
      "Thank you for calling Wellness Partners. For appointments, press 1. For billing, press 2. To repeat this menu, press 9.",
    options: { "1": "appointments", "2": "billing", "9": "main" },
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
    options: { "01011990": "callback" },
    numDigits: 8,
    invalidPrompt: "That does not match our records. ",
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
export function renderMenu(menuKey: string, prefix = ""): string {
  const menu = MENUS[menuKey] ?? MENUS.main;
  if (Object.keys(menu.options).length === 0) {
    return `<Response>\n  ${SAY(prefix + menu.prompt)}\n  <Hangup/>\n</Response>`;
  }
  // No input falls through to whatever follows the Gather: the menu's timeout
  // target (the callback menu connects silent callers) or a goodbye + hangup.
  const afterGather =
    menu.timeoutTarget === "CONNECT"
      ? connectBody()
      : `${SAY("Sorry, we did not receive your selection. Goodbye.")}\n  <Hangup/>`;
  return `<Response>
  <Gather numDigits="${menu.numDigits ?? 1}" action="/api/test-ivr/handle-key?menu=${menuKey}" method="POST" timeout="10">
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

/** Resolve a keypress (or multi-digit entry) within a menu to the next TwiML. */
export function transition(menuKey: string, digits: string): string {
  const menu = MENUS[menuKey] ?? MENUS.main;
  const target = menu.options[digits];
  if (!target) {
    return renderMenu(menuKey, menu.invalidPrompt ?? "Sorry, that isn't a valid option. ");
  }
  if (target === "CONNECT") return renderConnect();
  if (target === "HANGUP") return `<Response>\n  ${SAY("Goodbye.")}\n  <Hangup/>\n</Response>`;
  return renderMenu(target);
}
