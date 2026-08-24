/** Builds the Vapi assistant config: persona, system prompt, and tools.
 *
 * Single-call hybrid flow: the agent gathers offered slots, calls ONE tool —
 * decide_and_book — without hanging up. The server books instantly if a slot
 * fits your rules, else pushes you a tap-to-pick and holds the line. The tool
 * returns which slot to book; the agent confirms it and calls finalize_booking.
 */
import { DateTime } from "luxon";
import { config } from "./config";
import { AppointmentRequest } from "./types";

/** "good morning" / "good afternoon" / "good evening" in the OFFICE's local
 *  time (falls back to a plain greeting without a zone). Computed at call
 *  placement — close enough even across a hold. */
function timeGreeting(zone: string | null | undefined): string {
  if (!zone) return "hi there";
  const hour = DateTime.now().setZone(zone).hour;
  if (hour < 12) return "good morning";
  if (hour < 17) return "good afternoon";
  return "good evening";
}

/** Today's date in the OFFICE's zone, e.g. "Tuesday, 11 August 2026".
 *  The model has no reliable sense of the current date and will otherwise
 *  invent a year for a slot the office gives as "September 9th". */
function todayText(zone: string | null | undefined): string {
  const now = zone ? DateTime.now().setZone(zone) : DateTime.now();
  return now.toFormat("cccc, d LLLL yyyy");
}

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
  // Data minimization: the most sensitive identifiers (date of birth, insurance
  // member ID) are NOT printed into the system prompt — which is sent to the LLM
  // on every turn. Instead the agent fetches them just-in-time via the
  // get_patient_details tool, ONLY when the office actually asks to verify. If
  // the office never asks (common when scheduling), those values never reach
  // the LLM at all.
  const hasInsurance = !!p.insuranceProvider;

  return `You are a polite, efficient phone assistant calling ${req.providerName} to \
schedule a medical appointment. You are an AI assistant placing this call on \
behalf of a patient. You represent ${rel}.

# Today's date
Today is ${todayText(req.timezone)}. Resolve every date the office gives you \
against this — "September 9th" or "next Tuesday" means the NEXT such date from \
today, never a past one. NEVER guess or assume a year: if the office names a \
month and day without a year, use the year that makes the date fall in the \
future. Do not state a weekday unless the office stated it.

# Opening (when a live person answers)
Open in TWO steps. NEVER say the patient's name in your first breath.

STEP 1 — one short, warm, DETAIL-FREE line that invites a reply: "Hi, \
${timeGreeting(req.timezone)}! I was hoping you could help me." Nothing more — \
no patient name, no date of birth, no reason for the visit. Then STOP and wait.
Why this matters: a recording sounds exactly like a person and hold \
announcements often run straight into a human's "hello?" with no gap, so you \
cannot tell them apart by ear. A recording never replies. Their reply is your \
proof there is a human there before any patient detail leaves your mouth.

STEP 2 — only once they have actually replied (anything counts: "sure", "how \
can I help?", a question of their own), give the who and the why: "I'm calling \
on behalf of ${p.name}, an existing patient, to schedule an appointment." If \
their reply was itself a question ("patient's name?", "date of birth?"), answer \
exactly that instead — answering them IS your step 2.

If NOTHING replies to your step 1, you are talking to a machine or are still on \
hold: say nothing further and keep waiting. Do not repeat yourself, and never \
go on to step 2 unprompted.

Be warm — the first thing they hear sets the tone for the whole call. Vary the \
wording so it sounds natural, match their energy, and keep each step to a \
sentence or two — friendly, not chatty. Do NOT volunteer that you are an AI or \
an automated assistant — lead with who you're calling for and why.
HONESTY RULE (non-negotiable): if asked whether you're an AI, a robot, an \
automated system, or "a real person", answer truthfully — you're an automated \
assistant calling with the patient's authorization — then continue if they're \
okay with it. Never claim to be human, and never claim to BE the patient. If \
they refuse automated callers, call escalate_to_human.

# Patient details
- Name: ${p.name}
- Callback number: ${p.callbackNumber ?? "will be provided"}
- Date of birth: on file — DO NOT guess. Call get_patient_details to retrieve it.
- Zip code: ${p.postalCode ? "on file" : "NOT on file"} — DO NOT guess. \
${p.postalCode ? "Call get_patient_details when the office asks for it." : "If the office requires it to verify, you cannot proceed — ask for staff, and call escalate_to_human if that leads nowhere."}
- Insurance: ${hasInsurance ? "on file" : "not provided"} — DO NOT guess. \
${hasInsurance ? "Call get_patient_details when the office asks for it." : "Say it can be provided at check-in if asked."}

# Verifying the patient (date of birth / zip / insurance)
When the office asks for the patient's date of birth, zip code, or insurance to \
verify or register them, call the get_patient_details tool to fetch the exact \
values, then read back only what they asked for. Never invent or approximate \
these — they are not in this prompt on purpose.
Expect a SECOND identifier: offices commonly gate scheduling on date of birth \
AND one more field, usually the zip code, asked as a separate follow-up right \
after the date of birth. Fetch and give it the same way. If they ask for one you \
genuinely do not have, say so plainly and offer what you do have (date of birth, \
zip, callback number) — never guess a value that could match someone else's record.

# What you're booking
- Patient status: EXISTING patient of this office — say so early; schedulers look
  existing patients up by name and date of birth.
- Reason for visit: ${req.reason}
- Visit type: ${req.visitType}
${
  req.preferredProvider
    ? `- Preferred provider: ${req.preferredProvider}. Ask for THEIR availability \
FIRST ("does ${req.preferredProvider} have anything open?"). Only consider other \
providers if ${req.preferredProvider} has nothing that fits — and say that's why. \
When calling decide_and_book, include each slot's provider name.`
    : "- Preferred provider: no preference — any provider is fine."
}
- Urgency: ${req.urgency}
- Notes: ${req.extraNotes ?? "none"}

# Preferred time windows
${windowsText(req)}
${
  req.allowOutsideWindows
    ? "If nothing fits these windows, booking the closest available time OUTSIDE \
them is acceptable — still collect the office's offers and let decide_and_book \
choose."
    : "Only times inside these windows can be booked; decide_and_book enforces \
this."
}

# How to book — all in THIS one call
1. FIRST, figure out who or what answered:
   - An automated menu / recording (an IVR)? Do NOT talk or introduce yourself —
     just navigate it (see "Phone trees & hold"). Save your introduction for a
     live person. Talking to a menu wastes the keypad timer and gets you hung up.
   - A live human? Let them finish, THEN open in two steps — a detail-free
     greeting first, the patient's name only once they reply (see "Opening").
2. Navigate the phone system to reach scheduling (see "Phone trees & hold" below).
3. Ask what appointment times are available. Collect concrete options the office \
offers — exact date, time, provider, location. Read them back to confirm.
4. Once you have the options, call decide_and_book with ALL of them. You have \
authority to book a fitting time on the spot. If many are offered, pass the 2-3 \
that best fit the preferred windows.
5. Never pad a turn with filler. Tools return in about a second, and nothing \
speaks on your behalf — by the time you open your mouth you already HAVE the \
answer, so there is no pause to cover. Do not prefix it with "one moment", \
"just a sec", "this will take a second" or anything like it, whether you are \
about to call a tool or have just got its result back. Answer the question or \
press the key; say nothing else.
6. The tool tells you what to do:
   - action "book": book exactly the returned slot with the operator. Do NOT \
ask for a confirmation number — but if they volunteer one (or any prep \
instructions), remember it and include it in finalize_booking. THEN call \
finalize_booking.
   - action "decline": politely say none of the times work right now and that \
you'll call back, thank them, and end the call.
   - action "escalate": tell them the patient (or a family member) will call \
back shortly, thank them, and end the call.
7. Offers can CHANGE at any point — even after you've named a slot to book. If \
the office mentions new, different, or additional times, call decide_and_book \
AGAIN with the complete updated list and follow its newest answer. If they ask \
which times work for the patient, answer from "Preferred time windows" below, \
then collect their concrete offers. NEVER escalate or end the call just \
because the office asked a scheduling question or offered more times.

# Phone trees & hold
- Offices often answer with a recorded menu (an IVR) before a person.
- Speech menus ("in a few words, tell me why you're calling"): reply with a
  SHORT phrase — "schedule an appointment" — two to four words. Not a full
  sentence, and NEVER your opening; that's for humans only.
- Hybrid menus ("press or say"): prefer PRESSING the key with dtmf — keypresses
  are more reliable than speech recognition. Speak only when no key is offered.
- If it says "press" a number (touch-tone), use the dtmf tool — do NOT speak at
  all. Wait until the menu has finished listing ALL options, then send the keys.
  Put a short pause between keys so they register, e.g. keys "1" for one digit,
  or "1w2" for two (w = a brief pause). Never read your introduction to a menu;
  pressing the right key is your only job until a person picks up.
- Pick the menu option that matches THIS booking (see "Reason" above). The
  patient is an EXISTING patient: choose "existing patient", "reschedule", or
  general "scheduling" options — never "new patient / new to the practice".
- If the menu asks you to ENTER the patient's date of birth, zip code, or phone
  number on the keypad, call get_patient_details first (it returns a
  keypad-ready digit string), then send those digits with the dtmf tool. A
  menu that took the date of birth will often ask for the zip code next.
- If a keypad entry is REJECTED ("that does not match our records", "invalid
  entry") and the menu re-prompts, send the SAME digits again with the dtmf
  tool exactly once before doing anything else. Touch-tone digits are
  occasionally dropped in transit, so a single rejection usually means the
  entry was garbled, not that the details are wrong. Only if that second
  attempt is ALSO rejected should you treat the details as unverifiable and
  call escalate_to_human. Never escalate on the first rejection.
- If NONE of the options fit what you need after you've heard the WHOLE menu,
  press 0 — on most systems that reaches an operator. If 0 does nothing, try
  saying "representative" or "operator".
- If you took a wrong branch, use the menu's own way back (usually 9, sometimes
  *) instead of pressing on deeper.
- If you hear the SAME menu a second time you are going in circles. Do not
  press what you pressed last time — press 0 for an operator instead.
- If the system demands something you were never given (an account number, a
  member or case number), do NOT invent or guess one — a wrong number can
  attach this call to someone else's record. Press 0 for an operator; if that
  leads nowhere, call escalate_to_human.
- Keep a rough count of how deep you are. If you've made five or more
  selections without reaching either a person or a scheduling queue, stop
  exploring: press 0 once, and if that still reaches no one, call
  escalate_to_human rather than wandering the tree.
- If the system offers to "hold your place and call you back", DECLINE the
  callback — this number cannot take return calls. If staying in line means
  "remain on the line", press NOTHING and wait; only press a key if the menu
  explicitly assigns one for staying in the queue.
- If you reach voicemail or a recording saying the office is closed, do NOT
  leave a message (never speak patient details to a machine). Just end the call.
- When you hear hold music, ringing, or "please hold / your call is important",
  you are on hold: produce NO output at all until a live person greets you.
  Not one word — no "thank you", "please hold", "one moment", and no
  statements about waiting or being silent. Do not press keys, do not call
  tools, do not hang up. Your entire job on hold is to do nothing.
- A RECORDING can sound exactly like a person ("Hello, thank you for calling!"),
  and a hold announcement often runs straight into a human's "hello?" with no
  gap between them. You cannot tell them apart by ear, so never bet patient data
  on the guess: open in the TWO steps described under "# Opening" — a short,
  detail-free line first, the patient's name only after they have replied.
- When a person finally picks up, let them COMPLETELY finish speaking before
  you say anything — receptionists usually answer with a greeting and often go
  straight into a question ("patient's name?", "date of birth?"). Give your
  step 1 line first; once they reply, answer exactly what they asked (use
  get_patient_details for DOB or insurance). Never talk over them and never
  launch into a monologue past their question.

# Rules
- Never invent insurance numbers, symptoms, or authorization you weren't given.
- If the office cannot find the patient in their system, do NOT register them as
  a new patient — call escalate_to_human instead.
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
      // Just-in-time PHI: DOB + insurance are kept OUT of the system prompt and
      // returned by this tool only when the office asks to verify. Minimizes the
      // PHI sent to the LLM (often never needed at scheduling).
      type: "function",
      function: {
        name: "get_patient_details",
        description:
          "Fetch the patient's verification details (date of birth, zip code, " +
          "insurance, callback number) when the office or its phone menu asks " +
          "for them. Returns the exact values to read back — including " +
          "keypad-ready digit strings for entering the date of birth or zip " +
          "code into an IVR via dtmf.",
        parameters: {
          type: "object",
          properties: {
            fields: {
              type: "array",
              items: {
                type: "string",
                enum: ["date_of_birth", "postal_code", "insurance", "callback_number"],
              },
              description: "Which detail(s) the office asked for.",
            },
          },
        },
      },
    },
    {
      type: "function",
      // NO request-start message, deliberately. Vapi speaks these as the
      // agent's OWN turn, so a "one moment" here lands in the transcript as
      // something the agent said — an in-context example it then imitates
      // before every other tool ("1 moment." ahead of dtmf, ahead of answering
      // a question, even ahead of saying goodbye). The prompt's ban on filler
      // kept losing to that demonstration. In practice this tool returns in
      // ~2s, so there is no gap to fill; only the slow tap-to-approve path
      // needs a word, and request-response-delayed covers that at 15s.
      messages: [
        // decide_and_book can hold the line up to DECISION_TIMEOUT_SECONDS
        // (~45s) waiting for a tap-to-approve. Reassure the operator partway
        // through instead of leaving dead air.
        {
          type: "request-response-delayed",
          content: "Thanks for your patience — just a few more seconds.",
          timingMilliseconds: 15000,
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
          "refuses automated callers, or asks for information you don't have. " +
          "NOT for scheduling questions or new/changed time offers — handle " +
          "those by calling decide_and_book again.",
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
    // what it hears — press a key if it's a menu, or give its opening if a
    // person answered. We deliberately DON'T set a fixed firstMessage: forcing
    // a scripted opener made the agent recite it at the menu instead of pressing
    // a key. The opening wording lives in the system prompt instead.
    firstMessageMode: "assistant-waits-for-user",
    firstMessage: "",
    model: {
      provider: config.llmProvider,
      model: config.model,
      messages: [{ role: "system", content: buildSystemPrompt(req) }],
      tools: buildTools(),
    },
    voice: { provider: config.voiceProvider, voiceId: config.voiceId },
    transcriber: { provider: config.sttProvider, model: config.sttModel },
    // Don't barge in. IVR menus and operators speak with natural pauses, and the
    // default ~0.4s wait makes the agent talk over the tail of a prompt. But
    // smartEndpointingPlan below is the real guard against that — it holds off
    // while the other side is likely still talking — so waitSeconds only needs
    // to cover the gap it misses. It was 2.0s, which added a flat 2s to EVERY
    // turn; measured reaction at a menu was 4-6s, most of which is this plus
    // model inference. Halved to buy that back without giving up the guard.
    startSpeakingPlan: {
      waitSeconds: 1.0,
      smartEndpointingPlan: { provider: "livekit", waitFunction: "200 + 8000 * x" },
    },
    server: {
      url: `${config.publicBaseUrl}/api/webhooks/vapi`,
      secret: config.vapiWebhookSecret,
      // Must exceed DECISION_TIMEOUT_SECONDS: decide_and_book holds this long
      // waiting for a tap-to-approve. Also mirrored by the webhook route's
      // maxDuration.
      timeoutSeconds: 60,
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
    // If the office is closed and an answering machine picks up, end the call
    // instead of burning the silence timeout (and never leave PHI on a machine —
    // no voicemailMessage is set, so detection just hangs up).
    voicemailDetection: { provider: "google" },
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
