"""Domain models for appointment-booking calls."""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


class Patient(BaseModel):
    """Who the appointment is for. Keep sensitive fields minimal."""

    name: str
    date_of_birth: str  # YYYY-MM-DD
    # Relationship of the *caller* (you) to the patient, e.g. "self", "son", "spouse".
    caller_relationship: str = "self"
    insurance_provider: Optional[str] = None
    insurance_member_id: Optional[str] = None
    callback_number: Optional[str] = None  # number the office can reach you on


class TimeWindow(BaseModel):
    """An acceptable range. Days are lowercase names; times are HH:MM 24h."""

    days: List[str] = Field(default_factory=list)  # e.g. ["mon","tue","wed"]
    earliest: str = "08:00"
    latest: str = "18:00"
    not_before_date: Optional[str] = None  # YYYY-MM-DD
    not_after_date: Optional[str] = None


class AppointmentRequest(BaseModel):
    id: str = Field(default_factory=lambda: _id("req"))
    patient: Patient
    # Where we're calling.
    provider_name: str  # "Downtown Family Clinic"
    provider_phone: str  # E.164, e.g. +14155550123
    # What we want.
    reason: str  # "annual physical", "blood test for CBC panel", ...
    visit_type: str = "new or existing — let office decide"
    preferred_provider: Optional[str] = None  # specific doctor, if any
    acceptable_windows: List[TimeWindow] = Field(default_factory=list)
    urgency: str = "routine"  # routine | soon | urgent
    extra_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class OfferedSlot(BaseModel):
    """A slot the office offered during the call."""

    starts_at: str  # human or ISO string as spoken by the office
    provider: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class CallStatus(str, Enum):
    PENDING = "pending"  # call placed, in progress
    AWAITING_CONFIRMATION = "awaiting_confirmation"  # slots gathered, texted you
    CONFIRMED = "confirmed"  # you approved a slot
    BOOKED = "booked"  # office confirmed the booking
    NO_SLOTS = "no_slots"
    FAILED = "failed"
    ESCALATED = "escalated"  # needs a human to take the live call


class CallRecord(BaseModel):
    id: str = Field(default_factory=lambda: _id("call"))
    request: AppointmentRequest
    vapi_call_id: Optional[str] = None
    status: CallStatus = CallStatus.PENDING
    offered_slots: List[OfferedSlot] = Field(default_factory=list)
    chosen_slot: Optional[OfferedSlot] = None
    transcript_summary: Optional[str] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)
