"""Push notifications with tap-to-pick buttons, via ntfy.sh.

ntfy gives us real actionable notifications (HTTP action buttons) with no app to
build: install the ntfy app, subscribe to your private topic, and each offered
slot becomes a button that POSTs straight back to our /decide endpoint.

ntfy allows up to 3 action buttons, so we show up to 2 slots + a Decline button.
If the office offered more, the agent is told to read back only its top 2.
"""
from __future__ import annotations

from typing import List
from urllib.parse import urlencode

import httpx

from .config import get_settings
from .models import CallRecord, OfferedSlot

_MAX_SLOT_BUTTONS = 2


def _decide_url(call_id: str, choice: str) -> str:
    s = get_settings()
    return f"{s.public_base_url}/decide?" + urlencode({"call": call_id, "choice": choice})


def send_decision_request(record: CallRecord, slots: List[OfferedSlot]) -> None:
    """Notify the owner with tap-to-pick buttons for the offered slots."""
    s = get_settings()
    s.require("ntfy_topic", "public_base_url")

    shown = slots[:_MAX_SLOT_BUTTONS]
    actions = []
    for i, slot in enumerate(shown):
        actions.append(
            {
                "action": "http",
                "label": slot.starts_at[:24],
                "url": _decide_url(record.id, str(i)),
                "method": "POST",
                "clear": True,
            }
        )
    actions.append(
        {
            "action": "http",
            "label": "Decline",
            "url": _decide_url(record.id, "no"),
            "method": "POST",
            "clear": True,
        }
    )

    req = record.request
    body = {
        "topic": s.ntfy_topic,
        "title": f"Approve appointment? {req.patient.name}",
        "message": (
            f"{req.provider_name} offered times outside your usual window "
            f"for: {req.reason}. Tap to pick or decline."
        ),
        "priority": 5,  # max — make the phone buzz now; the operator is holding
        "tags": ["calendar"],
        "actions": actions,
    }
    httpx.post(s.ntfy_server, json=body, timeout=15).raise_for_status()


def send_info(title: str, message: str) -> None:
    """Fire-and-forget informational push (booked / escalated / no slots)."""
    s = get_settings()
    if not s.ntfy_topic:
        return
    httpx.post(
        s.ntfy_server,
        json={"topic": s.ntfy_topic, "title": title, "message": message, "tags": ["bell"]},
        timeout=15,
    )
