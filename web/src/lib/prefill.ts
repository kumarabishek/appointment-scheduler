/** What the booking wizard remembers between sessions.
 *
 * Who the patient is barely changes between bookings; WHERE you're calling
 * changes every time. So the whole form is kept on this device EXCEPT the
 * fields below, which are re-entered per call. Split lives here rather than in
 * the component so the rule — which patient fields reach disk — is testable.
 */

/** Never written to storage. A field earns a place here for one of two reasons:
 *
 *  1. it belongs to THIS call, not to the patient — carrying it over is how you
 *     end up dialing last month's clinic;
 *  2. it is sensitive enough to be worth re-typing rather than leaving on disk.
 *
 *  Anything NOT listed persists, so a new patient field is remembered by
 *  default. */
export const NEVER_REMEMBERED = new Set<string>([
  // (1) Per-call: where you're calling, and who you're asking for.
  "providerName",
  "providerPhone",
  "preferredProvider",
  // The office's zone, not the patient's — re-detected from the browser on
  // mount, so persisting it would only let a stale one outlive its office.
  "timezone",
  // (2) The member ID is the highest-value identifier on the form, and
  // insurance is already an optional step. The carrier name ("Cigna") still
  // persists — it is the ID specifically that isn't worth leaving in
  // plaintext for a field you re-type once a year.
  "insuranceMemberId",
]);

/** The subset of a form that gets written to storage. */
export function persistable<T extends Record<string, unknown>>(form: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(form).filter(([k]) => !NEVER_REMEMBERED.has(k)),
  ) as Partial<T>;
}

/** The subset of a stored payload that may be restored. Filtered on READ too:
 *  payloads written before this split still carry office and doctor fields,
 *  and must not repopulate them. `shape` bounds it to known form keys so a
 *  stale payload can't inject anything unexpected. */
export function restorable<T extends Record<string, unknown>>(
  saved: Record<string, unknown>,
  shape: T,
): Partial<T> {
  const picked: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) {
    if (key in saved && !NEVER_REMEMBERED.has(key)) picked[key] = saved[key];
  }
  return picked as Partial<T>;
}

/** Saved details are scoped to the Clerk user, so two people sharing a browser
 *  never see each other's patient. Checked on every read rather than cleared on
 *  a sign-out event — an event we'd have to catch in the instant before Clerk
 *  navigates away, and would miss if the tab were simply closed. */
export const prefillKey = (userId: string) => `booking-prefill:${userId}`;

/** The pre-scoping key. Whoever last used the browser wrote it, and there is no
 *  way to tell who that was — so it is deleted on sight rather than migrated
 *  into the current user's scope. Costs one re-type; avoids handing one
 *  person's date of birth to another. */
export const LEGACY_PREFILL_KEY = "booking-prefill";
