"""SMS confirmations to the owner (you) via Twilio.

The agent gathers slots; we text you a numbered list. You reply with the number
to approve (or "no" to decline). Inbound replies hit /webhooks/twilio-sms.
"""
from __future__ import annotations

from typing import List

from .config import get_settings
from .models import CallRecord, OfferedSlot


def _client():
    from twilio.rest import Client  # imported lazily so the app starts without creds

    s = get_settings()
    s.require("twilio_account_sid", "twilio_auth_token", "twilio_from_number")
    return Client(s.twilio_account_sid, s.twilio_auth_token)


def _format_slots(slots: List[OfferedSlot]) -> str:
    lines = []
    for i, slot in enumerate(slots, start=1):
        bits = [slot.starts_at]
        if slot.provider:
            bits.append(f"w/ {slot.provider}")
        if slot.location:
            bits.append(f"@ {slot.location}")
        lines.append(f"{i}. {' '.join(bits)}")
    return "\n".join(lines)


def send_sms(body: str) -> None:
    """Optional SMS. No-ops if Twilio isn't configured (push is primary now)."""
    s = get_settings()
    if not (s.twilio_account_sid and s.twilio_auth_token and s.owner_phone_number):
        return
    _client().messages.create(
        to=s.owner_phone_number, from_=s.twilio_from_number, body=body
    )


def request_confirmation(record: CallRecord) -> None:
    """Text the owner the offered slots and ask them to pick one."""
    req = record.request
    if not record.offered_slots:
        send_sms(
            f"📞 Call to {req.provider_name} for {req.patient.name}: "
            f"no available slots. {record.transcript_summary or ''}".strip()
        )
        return
    body = (
        f"📞 {req.provider_name} offered these for {req.patient.name} "
        f"({req.reason}):\n\n{_format_slots(record.offered_slots)}\n\n"
        f"Reply {record.id} <number> to book (e.g. '{record.id} 1'), "
        f"or '{record.id} no' to skip."
    )
    send_sms(body)


def notify_escalation(record: CallRecord, reason: str) -> None:
    req = record.request
    send_sms(
        f"⚠️ Needs you: call to {req.provider_name} for {req.patient.name} "
        f"couldn't finish automatically.\nReason: {reason}\n"
        f"Call them back at {req.provider_phone}."
    )


def notify_booked(record: CallRecord) -> None:
    slot = record.chosen_slot
    when = slot.starts_at if slot else "the selected time"
    send_sms(
        f"✅ Confirming we'll lock in {when} for {record.request.patient.name} "
        f"at {record.request.provider_name}."
    )
