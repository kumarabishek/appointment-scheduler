/** Data-driven multi-level test IVR (fake doctor's office phone tree).
 *
 * Each menu maps a pressed digit to a target: another menu key, or a special
 * action — "CONNECT" (hold music → operator) or "HANGUP" (say + end). TwiML is
 * stateless, so the current menu travels in the Gather's action URL
 * (?menu=<key>) and handle-key looks up the transition from there.
 *
 * To reach a scheduler the agent must navigate a sequence, e.g.:
 *   existing-patient checkup → 1 (appointments) → 2 (reschedule)        [2 levels]
 *   new primary-care visit   → 1 (appointments) → 1 (new) → 1 (primary) [3 levels]
 */
import { config } from "./config";

type Menu = {
  prompt: string;
  /** digit → menu key | "CONNECT" | "HANGUP". Empty options = terminal. */
  options: Record<string, string>;
};

export const MENUS: Record<string, Menu> = {
  main: {
    prompt:
      "Thank you for calling Wellness Partners. For appointments, press 1. For billing, press 2. To repeat this menu, press 9.",
    options: { "1": "appointments", "2": "billing", "9": "main" },
  },
  appointments: {
    prompt:
      "Appointments. For a new appointment, press 1. To reschedule an existing appointment, press 2. For lab or bloodwork, press 3. To go back, press 9.",
    options: { "1": "new", "2": "CONNECT", "3": "CONNECT", "9": "main" },
  },
  new: {
    prompt:
      "New appointment. For primary care, press 1. For a specialist, press 2. To go back, press 9.",
    options: { "1": "CONNECT", "2": "CONNECT", "9": "appointments" },
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
  return `<Response>
  <Gather numDigits="1" action="/api/test-ivr/handle-key?menu=${menuKey}" method="POST" timeout="10">
    ${SAY(prefix + menu.prompt)}
  </Gather>
  ${SAY("Sorry, we did not receive your selection. Goodbye.")}
  <Hangup/>
</Response>`;
}

/** Hold music, then connect to the "operator" (your cell) or a scripted voice. */
export function renderConnect(): string {
  const operator = config.testOperatorPhone
    ? `<Dial timeout="45"><Number>${config.testOperatorPhone}</Number></Dial>`
    : `${SAY("Scheduling, this is Riley. What day works best for you?")}
  <Pause length="6"/>
  ${SAY("Okay, our earliest opening is Tuesday at 9:30 AM. Does that work?")}
  <Pause length="6"/>
  ${SAY("Great, you're all set. Your confirmation number is 4 8 2 1. Goodbye.")}
  <Hangup/>`;
  return `<Response>
  ${SAY("Please hold for the next available scheduler.")}
  <Pause length="3"/>
  ${operator}
</Response>`;
}

/** Resolve a keypress within a menu to the next TwiML document. */
export function transition(menuKey: string, digit: string): string {
  const menu = MENUS[menuKey] ?? MENUS.main;
  const target = menu.options[digit];
  if (!target) return renderMenu(menuKey, "Sorry, that isn't a valid option. ");
  if (target === "CONNECT") return renderConnect();
  if (target === "HANGUP") return `<Response>\n  ${SAY("Goodbye.")}\n  <Hangup/>\n</Response>`;
  return renderMenu(target);
}
