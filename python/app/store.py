"""Tiny persistent store for call records.

A JSON file is plenty for a single-household prototype. Swap for SQLite/Postgres
when you outgrow it. Records contain PHI, so the file lives locally and is
git-ignored — do not sync it to anything shared.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Dict, List, Optional

from .models import CallRecord

_DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "calls.json"
_LOCK = threading.Lock()


def _load() -> Dict[str, dict]:
    if not _DATA_FILE.exists():
        return {}
    return json.loads(_DATA_FILE.read_text() or "{}")


def _dump(data: Dict[str, dict]) -> None:
    _DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    _DATA_FILE.write_text(json.dumps(data, indent=2, default=str))


def save(record: CallRecord) -> None:
    with _LOCK:
        data = _load()
        data[record.id] = json.loads(record.model_dump_json())
        _dump(data)


def get(call_id: str) -> Optional[CallRecord]:
    raw = _load().get(call_id)
    return CallRecord.model_validate(raw) if raw else None


def get_by_vapi_id(vapi_call_id: str) -> Optional[CallRecord]:
    for raw in _load().values():
        if raw.get("vapi_call_id") == vapi_call_id:
            return CallRecord.model_validate(raw)
    return None


def all_records() -> List[CallRecord]:
    return [CallRecord.model_validate(r) for r in _load().values()]
