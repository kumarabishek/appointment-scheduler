"""Decide whether an offered slot falls inside your pre-approved "green zone".

This is what lets the agent book live, in one call: when the office offers a
slot, we check it against your rules here and answer immediately.

Parsing a spoken time string ("Tue Jun 17 9:30 AM") into a real datetime is
best-effort. If we can't parse it, we treat the slot as NOT auto-approvable and
fall back to asking you — the safe direction.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Tuple

from dateutil import parser as dtparser

from .models import OfferedSlot, TimeWindow

_DAY_INDEX = {
    "mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6,
}


def parse_slot_datetime(text: str, now: Optional[datetime] = None) -> Optional[datetime]:
    now = now or datetime.now()
    try:
        # default fills in missing pieces (year, etc.) from `now`.
        return dtparser.parse(text, fuzzy=True, default=now)
    except (ValueError, OverflowError):
        return None


def _in_window(dt: datetime, w: TimeWindow) -> bool:
    if w.days:
        allowed = {_DAY_INDEX[d.lower()[:3]] for d in w.days if d.lower()[:3] in _DAY_INDEX}
        if allowed and dt.weekday() not in allowed:
            return False
    hm = dt.strftime("%H:%M")
    if not (w.earliest <= hm <= w.latest):
        return False
    d = dt.strftime("%Y-%m-%d")
    if w.not_before_date and d < w.not_before_date:
        return False
    if w.not_after_date and d > w.not_after_date:
        return False
    return True


def in_green_zone(dt: datetime, windows: List[TimeWindow]) -> bool:
    if not windows:
        return True  # no constraints = anything is acceptable
    return any(_in_window(dt, w) for w in windows)


def pick_best(
    slots: List[OfferedSlot], windows: List[TimeWindow]
) -> Optional[Tuple[OfferedSlot, datetime]]:
    """Earliest slot that fits the green zone (rule: soonest acceptable)."""
    candidates = []
    for s in slots:
        dt = parse_slot_datetime(s.starts_at)
        if dt and in_green_zone(dt, windows):
            candidates.append((s, dt))
    if not candidates:
        return None
    return min(candidates, key=lambda pair: pair[1])


def earliest_overall(slots: List[OfferedSlot]) -> Optional[OfferedSlot]:
    """Soonest slot regardless of green zone (used by the 'closest' fallback)."""
    dated = [(s, parse_slot_datetime(s.starts_at)) for s in slots]
    dated = [(s, dt) for s, dt in dated if dt]
    if not dated:
        return slots[0] if slots else None
    return min(dated, key=lambda pair: pair[1])[0]
