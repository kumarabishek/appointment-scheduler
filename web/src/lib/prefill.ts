/** What the booking wizard remembers between sessions.
 *
 * Who the patient is barely changes between bookings; WHERE you're calling
 * changes every time. So the whole form is kept on this device EXCEPT the
 * fields below, which are re-entered per call. Split lives here rather than in
 * the component so the rule — which patient fields reach disk — is testable.
 */

/** Re-entered every call, never restored: the office being dialed and the
 *  doctor being asked for. Carrying these over is how you accidentally dial
 *  last month's clinic. Anything NOT listed here persists, so a new patient
 *  field is remembered by default. */
export const PER_CALL_FIELDS = new Set<string>([
  "providerName",
  "providerPhone",
  "preferredProvider",
  // The office's zone, not the patient's — re-detected from the browser on
  // mount, so persisting it would only let a stale one outlive its office.
  "timezone",
]);

/** The subset of a form that gets written to storage. */
export function persistable<T extends Record<string, unknown>>(form: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(form).filter(([k]) => !PER_CALL_FIELDS.has(k)),
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
    if (key in saved && !PER_CALL_FIELDS.has(key)) picked[key] = saved[key];
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
