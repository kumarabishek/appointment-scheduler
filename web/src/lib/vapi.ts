/** Thin client over the Vapi REST API for placing outbound calls. */
import { buildAssistant } from "./agent";
import { config, requireConfig } from "./config";
import { AppointmentRequest } from "./types";

const BASE = "https://api.vapi.ai";

export async function placeCall(req: AppointmentRequest): Promise<string> {
  requireConfig("vapiApiKey", "vapiPhoneNumberId", "publicBaseUrl");

  const resp = await fetch(`${BASE}/call`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.vapiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phoneNumberId: config.vapiPhoneNumberId,
      customer: { number: req.providerPhone },
      assistant: buildAssistant(req),
      metadata: { request_id: req.id }, // echoed back on every webhook
    }),
  });

  if (!resp.ok) {
    throw new Error(`Vapi call failed: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as { id: string };
  return data.id;
}
