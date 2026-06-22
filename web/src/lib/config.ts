/** Central configuration from environment. */
function env(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export const config = {
  // Vapi
  vapiApiKey: env("VAPI_API_KEY"),
  vapiPhoneNumberId: env("VAPI_PHONE_NUMBER_ID"),
  vapiWebhookSecret: env("VAPI_WEBHOOK_SECRET"),

  // LLM brain — provider key lives in the Vapi dashboard, not here.
  llmProvider: env("LLM_PROVIDER", "google"),
  model: env("AGENT_MODEL", "gemini-2.0-flash"),

  // Voice (TTS) — ElevenLabs, key in the Vapi dashboard.
  voiceProvider: env("VOICE_PROVIDER", "11labs"),
  elevenVoiceId: env("ELEVEN_VOICE_ID", "21m00Tcm4TlvDq8ikWAM"),

  // Ears (STT) — Deepgram, key in the Vapi dashboard.
  sttProvider: env("STT_PROVIDER", "deepgram"),
  sttModel: env("STT_MODEL", "nova-2"),

  // Push (ntfy) — tap-to-pick decisions for edge cases.
  ntfyServer: env("NTFY_SERVER", "https://ntfy.sh").replace(/\/$/, ""),
  ntfyTopic: env("NTFY_TOPIC"),

  // How long the agent holds the operator while waiting for your tap (ms).
  // Must be < the Vapi tool server timeout (set to 30s in agent.ts).
  decisionTimeoutMs: Number(env("DECISION_TIMEOUT_SECONDS", "25")) * 1000,

  // Edge-case fallback when you don't tap in time: "closest" | "decline".
  edgeFallback: env("EDGE_FALLBACK", "closest"),

  // Per-user abuse guard: max outbound calls a user can place per rolling 24h.
  // Each call is billed to your Vapi/LLM account, so cap it.
  dailyCallLimit: Number(env("DAILY_CALL_LIMIT", "3")),

  // Secret used to encrypt PHI (insurance details) at rest in data/calls.json.
  // Any string works; generate a strong one, e.g. `openssl rand -base64 32`.
  // Leave empty in dev to store unencrypted (do NOT do that with real PHI).
  phiEncryptionKey: env("PHI_ENCRYPTION_KEY"),

  // Vapi HIPAA mode: when on, Vapi stores no recordings/transcripts. Defaults
  // ON. Set HIPAA_MODE=false ONLY for testing (with fake data) so you can review
  // call logs/transcripts in the Vapi dashboard.
  hipaaMode: env("HIPAA_MODE", "true") !== "false",

  // Test IVR: the phone number to ring as the "operator" once the agent presses
  // the scheduling option. Set to your own cell to role-play the scheduler.
  testOperatorPhone: env("TEST_OPERATOR_PHONE"),

  // The fake test-IVR routes are a local dev harness. They're PUBLIC (Twilio is
  // a machine), so they must be OFF by default — otherwise anyone could fetch
  // the TwiML and learn/ring the operator number. Set TEST_IVR_ENABLED=true only
  // while actively testing.
  testIvrEnabled: env("TEST_IVR_ENABLED") === "true",

  // Public URL for inbound webhooks (ngrok in dev).
  publicBaseUrl: env("PUBLIC_BASE_URL").replace(/\/$/, ""),

  // Google Calendar push. If these are set, booked appointments are created as
  // real calendar events; otherwise we fall back to a local .ics file.
  googleClientId: env("GOOGLE_CLIENT_ID"),
  googleClientSecret: env("GOOGLE_CLIENT_SECRET"),
  googleRefreshToken: env("GOOGLE_REFRESH_TOKEN"),
  googleCalendarId: env("GOOGLE_CALENDAR_ID", "primary"),
  // Fallback zone only if a request somehow arrives without one (the browser
  // normally provides it per request). Spoken times like "9:30 AM" carry no zone.
  defaultTimezone: env("CALENDAR_TIMEZONE", "America/Los_Angeles"),
  appointmentMinutes: Number(env("APPOINTMENT_DURATION_MINUTES", "30")),
};

export function googleConfigured(): boolean {
  return Boolean(
    config.googleClientId && config.googleClientSecret && config.googleRefreshToken,
  );
}

export function requireConfig(...keys: (keyof typeof config)[]): void {
  const missing = keys.filter((k) => !config[k]);
  if (missing.length) {
    throw new Error(
      `Missing required settings: ${missing.join(", ")}. ` +
        `Copy .env.example to .env.local and fill them in.`,
    );
  }
}
