"""Drop confirmed appointments onto a calendar.

Prototype implementation writes a local .ics file you can import or subscribe to.
To push directly into Google/Apple Calendar instead, replace `upsert_event` with
a call to your calendar MCP / API — the rest of the app doesn't care how it lands.
"""
from __future__ import annotations

from pathlib import Path

from .models import CallRecord

_ICS = Path(__file__).resolve().parent.parent / "data" / "appointments.ics"


def upsert_event(rec: CallRecord, tentative: bool = False) -> None:
    slot = rec.chosen_slot
    if slot is None:
        return
    status = "TENTATIVE" if tentative else "CONFIRMED"
    summary = f"{rec.request.reason} — {rec.request.patient.name}"
    desc = (
        f"At {rec.request.provider_name}. "
        f"Provider: {slot.provider or 'TBD'}. "
        f"{slot.notes or ''}"
    ).strip()
    # We store the office's spoken time as-is in the description; a production
    # version would parse it to a real DTSTART. Kept simple on purpose.
    block = (
        "BEGIN:VEVENT\n"
        f"UID:{rec.id}@appointment-scheduler\n"
        f"SUMMARY:{summary}\n"
        f"STATUS:{status}\n"
        f"DESCRIPTION:{desc} (time as offered: {slot.starts_at})\n"
        f"LOCATION:{slot.location or rec.request.provider_name}\n"
        "END:VEVENT\n"
    )
    _ICS.parent.mkdir(parents=True, exist_ok=True)
    if not _ICS.exists():
        _ICS.write_text("BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR\n")
    content = _ICS.read_text().replace("END:VCALENDAR\n", block + "END:VCALENDAR\n")
    _ICS.write_text(content)
