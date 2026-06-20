"""Builds the Vapi assistant config: persona, system prompt, and tools.

Single-call flow (hybrid auto-book):
- The agent gathers the slots the office offers, then calls ONE tool —
  `decide_and_book` — with those slots, WITHOUT hanging up.
- The server decides instantly:
    * a slot fits your pre-approved rules -> "book it" (the common case), OR
    * nothing fits -> you get a tap-to-pick push and the agent holds the line a
      few seconds for your answer.
- The tool returns which slot to book (or to decline / escalate). The agent then
  confirms that exact slot with the operator and calls `finalize_booking`.
Everything happens in the one live call.
"""
from __future__ import annotations

from typing import Dict

from .config import get_settings
from .models import AppointmentRequest


def _windows_text(req: AppointmentRequest) -> str:
    if not req.acceptable_windows:
        return "Any time the office offers is acceptable; prefer the earliest."
    lines = []
    for w in req.acceptable_windows:
        days = ", ".join(w.days) if w.days else "any day"
        span = f"{w.earliest}-{w.latest}"
        bounds = []
        if w.not_before_date:
            bounds.append(f"on/after {w.not_before_date}")
        if w.not_after_date:
            bounds.append(f"on/before {w.not_after_date}")
        bound_txt = f" ({'; '.join(bounds)})" if bounds else ""
        lines.append(f"- {days}, {span}{bound_txt}")
    return "\n".join(lines)


def build_system_prompt(req: AppointmentRequest) -> str:
    p = req.patient
    rel = (
        "the patient themselves"
        if p.caller_relationship == "self"
        else f"the patient's {p.caller_relationship}, calling on their behalf"
    )
    insurance = (
        f"{p.insurance_provider}, member ID {p.insurance_member_id}"
        if p.insurance_provider
        else "not provided — say you can give it when booking is finalized"
    )
    return f"""You are a polite, efficient phone assistant calling {req.provider_name} to \
schedule a medical appointment. You are an AI assistant placing this call on \
behalf of a patient. You represent {rel}.

# Disclosure (say this naturally near the start)
"Hi, I'm an AI assistant calling on behalf of {p.name} to schedule an appointment. \
Is it alright if I go ahead?" If asked, confirm you're an automated assistant and \
that the patient has authorized this call.

# Patient details (share only what's needed, when asked)
- Name: {p.name}
- Date of birth: {p.date_of_birth}
- Insurance: {insurance}
- Callback number: {p.callback_number or 'will be provided'}

# What you're booking
- Reason for visit: {req.reason}
- Visit type: {req.visit_type}
- Preferred provider: {req.preferred_provider or 'no preference'}
- Urgency: {req.urgency}
- Notes: {req.extra_notes or 'none'}

# Preferred time windows
{_windows_text(req)}

# How to book — all in THIS one call
1. Greet, disclose you're an AI, state who you're calling for and why.
2. Navigate any phone menu; wait politely on hold without filling silence.
3. Ask what appointment times are available. Collect the concrete options the \
office offers — exact date, time, provider, location. Read them back to confirm.
4. Once you have the available options, call `decide_and_book` with ALL of them. \
You have authority to book a fitting time on the spot. If many are offered, pass \
the 2-3 that best fit the preferred windows.
5. While the tool runs you may need a brief moment — it's fine to say "one \
moment while I confirm the best time" and keep the operator on the line.
6. The tool tells you what to do:
   - action "book": book exactly the returned slot with the operator. Get a \
confirmation number and any prep instructions, then call `finalize_booking`.
   - action "decline": politely say none of the times work right now and that \
you'll call back, thank them, and end the call.
   - action "escalate": tell them a family member will call back shortly, thank \
them, and end the call.

# Rules
- Never invent insurance numbers, symptoms, or authorization you weren't given.
- Only commit to a booking AFTER `decide_and_book` returns action "book". Never \
book a time on your own judgment.
- If the office requires the patient on the line, refuses AI callers, or asks \
for information you don't have, call `escalate_to_human` instead of guessing.
- Keep replies short and natural — this is a live phone call. Don't monologue.
- Be warm and respectful to the operator; they're busy.
"""


def build_tools() -> list:
    slot_schema = {
        "type": "object",
        "properties": {
            "starts_at": {
                "type": "string",
                "description": "Date and time, e.g. 'Tue Jun 17 2026 9:30 AM'. Be specific.",
            },
            "provider": {"type": "string"},
            "location": {"type": "string"},
            "notes": {"type": "string"},
        },
        "required": ["starts_at"],
    }
    return [
        {
            "type": "function",
            "messages": [
                {
                    "type": "request-start",
                    "content": "One moment while I confirm the best time.",
                }
            ],
            "function": {
                "name": "decide_and_book",
                "description": (
                    "Submit the appointment slots the office offered. Returns "
                    "which slot to book, or to decline/escalate. Call once you "
                    "have the available options. May take a few seconds."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "offered_slots": {
                            "type": "array",
                            "items": slot_schema,
                            "description": "Concrete slots the office offered.",
                        },
                        "no_slots": {
                            "type": "boolean",
                            "description": "True if the office has no availability at all.",
                        },
                    },
                    "required": ["offered_slots"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "finalize_booking",
                "description": (
                    "Record that the booking is confirmed with the office. Call "
                    "after the operator confirms the appointment is made."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "slot": slot_schema,
                        "confirmation_number": {"type": "string"},
                        "prep_instructions": {"type": "string"},
                    },
                    "required": ["slot"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "escalate_to_human",
                "description": (
                    "Hand off to a human when the office requires the patient on "
                    "the line, refuses automated callers, or asks for information "
                    "you don't have."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {"reason": {"type": "string"}},
                    "required": ["reason"],
                },
            },
        },
    ]


def build_assistant(req: AppointmentRequest) -> Dict:
    """Full assistant payload for Vapi's outbound-call API."""
    s = get_settings()
    return {
        "name": f"Scheduler for {req.patient.name}",
        "firstMessageMode": "assistant-speaks-first",
        "firstMessage": (
            f"Hi, I'm an AI assistant calling on behalf of {req.patient.name} "
            "to schedule an appointment. Is now an okay time?"
        ),
        "model": {
            "provider": s.llm_provider,
            "model": s.model,
            "messages": [{"role": "system", "content": build_system_prompt(req)}],
            "tools": build_tools(),
        },
        "voice": {"provider": s.voice_provider, "voiceId": s.eleven_voice_id},
        "transcriber": {"provider": s.stt_provider, "model": s.stt_model},
        "server": {
            "url": f"{s.public_base_url}/webhooks/vapi",
            "secret": s.vapi_webhook_secret,
            # Must exceed DECISION_TIMEOUT_SECONDS so the held call can wait for
            # your tap without Vapi timing the tool call out.
            "timeoutSeconds": 30,
        },
        "maxDurationSeconds": 900,
        "endCallFunctionEnabled": True,
    }
