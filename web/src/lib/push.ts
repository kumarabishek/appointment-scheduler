/** Push notifications with tap-to-pick buttons, via ntfy.sh.
 *
 * ntfy gives real actionable notifications (HTTP action buttons) with no app to
 * build: install ntfy, subscribe to your private topic, and each offered slot
 * becomes a button that POSTs back to our /api/decide route. ntfy allows up to
 * 3 buttons, so we show up to 2 slots + Decline.
 */
import { config, requireConfig } from "./config";
import { CallRecord, OfferedSlot } from "./types";

const MAX_SLOT_BUTTONS = 2;

function decideUrl(callId: string, choice: string): string {
  const qs = new URLSearchParams({ call: callId, choice }).toString();
  return `${config.publicBaseUrl}/api/decide?${qs}`;
}

export async function sendDecisionRequest(
  record: CallRecord,
  slots: OfferedSlot[],
): Promise<void> {
  requireConfig("ntfyTopic", "publicBaseUrl");
  const shown = slots.slice(0, MAX_SLOT_BUTTONS);
  const actions = shown.map((slot, i) => ({
    action: "http",
    label: slot.startsAt.slice(0, 24),
    url: decideUrl(record.id, String(i)),
    method: "POST",
    clear: true,
  }));
  actions.push({
    action: "http",
    label: "Decline",
    url: decideUrl(record.id, "no"),
    method: "POST",
    clear: true,
  });

  // PHI-free push: ntfy is a third-party broker, so no patient name, provider,
  // or reason goes here. Just an action prompt + slot times (a bare time isn't
  // PHI). Open the app to see who/what it's for.
  await fetch(config.ntfyServer, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: config.ntfyTopic,
      title: "Appointment approval needed",
      message: "An offered time is outside your usual window. Tap a time to book, or decline.",
      priority: 5,
      tags: ["calendar"],
      actions,
    }),
  });
}

export async function sendInfo(title: string, message: string): Promise<void> {
  if (!config.ntfyTopic) return;
  await fetch(config.ntfyServer, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: config.ntfyTopic, title, message, tags: ["bell"] }),
  });
}
