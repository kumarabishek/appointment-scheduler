/** Builds the Vapi assistant config: persona, system prompt, and tools.
 *
 * Single-call hybrid flow: the agent gathers offered slots, calls ONE tool —
 * decide_and_book — without hanging up. The server books instantly if a slot
 * fits your rules, else pushes you a tap-to-pick and holds the line. The tool
 * returns which slot to book; the agent confirms it and calls finalize_booking.
 */
import { config } from "./config";
import { AppointmentRequest } from "./types";

function windowsText(req: AppointmentRequest): string {
  if (!req.acceptableWindows.length) {
    return "Any time the office offers is acceptable; prefer the earliest.";
  }
  return req.acceptableWindows
    .map((w) => {
      const days = w.days.length ? w.days.join(", ") : "any day";
      const bounds = [
        w.notBeforeDate ? `on/after ${w.notBeforeDate}` : null,
        w.notAfterDate ? `on/before ${w.notAfterDate}` : null,
      ].filter(Boolean);
      const bt = bounds.length ? ` (${bounds.join("; ")})` : "";
      return `- ${days}, ${w.earliest}-${w.latest}${bt}`;
    })
    .join("\n");
}

export function buildSystemPrompt(req: AppointmentRequest): string {
  const p = req.patient;
  const rel =
    p.callerRelationship === "self"
      ? "the patient themselves"
      : `the patient's ${p.callerRelationship}, calling on their behalf`;
  const insurance = p.insuranceProvider
    ? `${p.insuranceProvider}, member ID ${p.insuranceMemberId}`
    : "not provided — say you can give it when booking is finalized";

  return `You are a polite, efficient phone assistant calling ${req.providerName} to \
schedule a medical appointment. You are an AI assistant placing this call on \
behalf of a patient. You represent ${rel}.

# Disclosure (say this naturally near the start)
"Hi, I'm an AI assistant calling on behalf of ${p.name} to schedule an appointment. \
Is it alright if I go ahead?" If asked, confirm you're an automated assistant and \
that the patient has authorized this call.

# Patient details (share only what's needed, when asked)
- Name: ${p.name}
- Date of birth: ${p.dateOfBirth}
- Insurance: ${insurance}
- Callback number: ${p.callbackNumber ?? "will be provided"}

# What you're booking
- Reason for visit: ${req.reason}
- Visit type: ${req.visitType}
- Preferred provider: ${req.preferredProvider ?? "no preference"}
- Urgency: ${req.urgency}
- Notes: ${req.extraNotes ?? "none"}

# Preferred time windows
${windowsText(req)}

# How to book — all in THIS one call
1. FIRST, figure out who or what answered:
   - An automated menu / recording (an IVR)? Do NOT talk or introduce yourself —
     just navigate it (see "Phone trees & hold"). Save your introduction for a
     live person. Talking to a menu wastes the keypad timer and gets you hung up.
   - A live human? THEN greet, disclose you're an AI, and say who you're calling
     for and why.
2. Navigate the phone system to reach scheduling (see "Phone trees & hold" below).
3. Ask what appointment times are available. Collect concrete options the office \
offers — exact date, time, provider, location. Read them back to confirm.
4. Once you have the options, call decide_and_book with ALL of them. You have \
authority to book a fitting time on the spot. If many are offered, pass the 2-3 \
that best fit the preferred windows.
5. While the tool runs you may need a brief moment — it's fine to say "one moment \
while I confirm the best time" and keep the operator on the line.
6. The tool tells you what to do:
   - action "book": book exactly the returned slot with the operator. Before you \
finish, explicitly ASK "Can I get a confirmation number?" (and any prep \
instructions). If they don't have one, that's fine — proceed. THEN call \
finalize_booking.
   - action "decline": politely say none of the times work right now and that \
you'll call back, thank them, and end the call.
   - action "escalate": tell them a family member will call back shortly, thank \
them, and end the call.

# Phone trees & hold
- Offices often answer with a recorded menu (an IVR) before a person.
- If it says "say the reason for your call" or similar, just SAY it ("scheduling"
  or "appointments").
- If it says "press" a number (touch-tone), use the dtmf tool — do NOT speak at
  all. Wait until the menu has finished listing ALL options, then send the keys.
  Put a short pause between keys so they register, e.g. keys "1" for one digit,
  or "1w2" for two (w = a brief pause). Never read your introduction to a menu;
  pressing the right key is your only job until a person picks up.
- Pick the menu option that matches THIS booking (see "Visit type" and "Reason"
  above). For an existing patient, choose "existing patient", "reschedule", or
  "scheduling" options — NOT "new patient/new appointment". Only pick "new
  patient" if the patient is genuinely new to this office.
- When you hear hold music, ringing, or "please hold / your call is important",
  you are on hold: stay completely silent and keep waiting. Do not talk, do not
  hang up, do not call any tool. Only speak again once a live person greets you.
- When a person finally picks up, restart with your disclosure and request.

# Rules
- Never invent insurance numbers, symptoms, or authorization you weren't given.
- Only commit to a booking AFTER decide_and_book returns action "book".
- If the office requires the patient on the line, refuses AI callers, or asks for \
information you don't have, call escalate_to_human instead of guessing.
- Keep replies short and natural — this is a live phone call. Don't monologue.
- Be warm and respectful to the operator; they're busy.`;
}

const slotSchema = {
  type: "object",
  properties: {
    starts_at: {
      type: "string",
      description: "Date and time, e.g. 'Tue Jun 17 2026 9:30 AM'. Be specific.",
    },
    provider: { type: "string" },
    location: { type: "string" },
    notes: { type: "string" },
  },
  required: ["starts_at"],
};

export function buildTools() {
  return [
    // Native DTMF tool: lets the agent press touch-tone digits to navigate IVR
    // phone trees ("press 1 for scheduling"). The model invokes it as `dtmf`
    // with { keys: "1w2#" } — `w` is a 0.5s pause, `W` a 1s pause. Pauses
    // between digits keep the IVR from misreading a fast sequence.
    { type: "dtmf" },
    {
      type: "function",
      messages: [
        {
          type: "request-start",
          content: "One moment while I confirm the best time.",
        },
      ],
      function: {
        name: "decide_and_book",
        description:
          "Submit the appointment slots the office offered. Returns which slot " +
          "to book, or to decline/escalate. Call once you have the options.",
        parameters: {
          type: "object",
          properties: {
            offered_slots: { type: "array", items: slotSchema },
            no_slots: { type: "boolean" },
          },
          required: ["offered_slots"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "finalize_booking",
        description:
          "Record that the booking is confirmed with the office. Call after the " +
          "operator confirms the appointment is made.",
        parameters: {
          type: "object",
          properties: {
            slot: slotSchema,
            confirmation_number: { type: "string" },
            prep_instructions: { type: "string" },
          },
          required: ["slot"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "escalate_to_human",
        description:
          "Hand off to a human when the office requires the patient on the line, " +
          "refuses automated callers, or asks for information you don't have.",
        parameters: {
          type: "object",
          properties: { reason: { type: "string" } },
          required: ["reason"],
        },
      },
    },
  ];
}

export function buildAssistant(req: AppointmentRequest) {
  return {
    name: `Scheduler for ${req.patient.name}`,
    // We're calling INTO an office, which usually answers with an IVR menu or a
    // greeting. Listen first, then let the MODEL decide its first action based on
    // what it hears — press a key if it's a menu, or give its disclosure if a
    // person answered. We deliberately DON'T set a fixed firstMessage: forcing
    // the disclosure made the agent recite it at the menu instead of pressing a
    // key. The disclosure wording lives in the system prompt instead.
    firstMessageMode: "assistant-waits-for-user",
    firstMessage: "",
    model: {
      provider: config.llmProvider,
      model: config.model,
      messages: [{ role: "system", content: buildSystemPrompt(req) }],
      tools: buildTools(),
    },
    voice: { provider: config.voiceProvider, voiceId: config.elevenVoiceId },
    transcriber: { provider: config.sttProvider, model: config.sttModel },
    // Don't barge in. IVR menus and operators speak with natural pauses; the
    // default ~0.4s wait makes the agent start talking over the tail of a prompt
    // (the abrupt IVR→agent cut-in). Wait longer and use smart endpointing so it
    // only speaks once the other side has genuinely finished.
    startSpeakingPlan: {
      waitSeconds: 2.0,
      smartEndpointingPlan: { provider: "livekit", waitFunction: "200 + 8000 * x" },
    },
    server: {
      url: `${config.publicBaseUrl}/api/webhooks/vapi`,
      secret: config.vapiWebhookSecret,
      timeoutSeconds: 30,
    },
    // Long IVR menus + hold queues are the whole point of this tool, so give the
    // call room to wait. ~30 min cap; raise if your offices hold even longer.
    maxDurationSeconds: 1800,
    // Don't hang up during a quiet stretch on hold. Vapi's default is short
    // (~30s), which would end the call mid-queue; hold music usually isn't true
    // silence, but quiet gaps happen. 600s = 10 min of tolerated silence.
    silenceTimeoutSeconds: 600,
    // Reduce phantom transcripts from hold music / background noise so the agent
    // doesn't "hear" words and respond while waiting on hold.
    backgroundDenoisingEnabled: true,
    endCallFunctionEnabled: true,
    // HIPAA mode: Vapi stores NO recordings or transcripts of the call, so the
    // spoken member ID / diagnosis never lands in Vapi's storage. We still get
    // an end-of-call summary on our webhook. PHI (the member ID) is passed only
    // via this inline assistant on the /call endpoint, which is the sanctioned
    // channel. See https://docs.vapi.ai/security-and-privacy/hipaa
    // Toggle off (HIPAA_MODE=false) only for testing so logs are reviewable.
    compliancePlan: { hipaaEnabled: config.hipaaMode },
  };
}
