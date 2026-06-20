"""Thin client over the Vapi REST API for placing outbound calls."""
from __future__ import annotations

import httpx

from .agent import build_assistant
from .config import get_settings
from .models import AppointmentRequest

_BASE = "https://api.vapi.ai"


def place_call(req: AppointmentRequest) -> str:
    """Place an outbound call to the provider. Returns the Vapi call id."""
    s = get_settings()
    s.require("vapi_api_key", "vapi_phone_number_id", "public_base_url")

    payload = {
        "phoneNumberId": s.vapi_phone_number_id,
        "customer": {"number": req.provider_phone},
        "assistant": build_assistant(req),
        # Echoed back on every webhook so we can correlate to our CallRecord.
        "metadata": {"request_id": req.id},
    }
    resp = httpx.post(
        f"{_BASE}/call",
        headers={"Authorization": f"Bearer {s.vapi_api_key}"},
        json=payload,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["id"]
