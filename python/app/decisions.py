"""In-flight owner decisions for edge cases.

When the agent hits a slot outside your green zone, its tool call blocks here
waiting for you to tap a choice in the push notification. Your tap (the /decide
endpoint) resolves the awaiting future, and the agent — still on the line —
books the slot you picked. All within one call.

Futures live on the running asyncio loop, shared across the webhook request and
the /decide request. Single-process only; for multi-worker you'd back this with
Redis pub/sub.
"""
from __future__ import annotations

import asyncio
from typing import Dict, Optional

# call_record_id -> Future resolving to a decision dict
_PENDING: Dict[str, asyncio.Future] = {}


def open_decision(key: str) -> asyncio.Future:
    loop = asyncio.get_event_loop()
    fut: asyncio.Future = loop.create_future()
    _PENDING[key] = fut
    return fut


async def wait_for_decision(key: str, timeout: float) -> Optional[dict]:
    fut = _PENDING.get(key) or open_decision(key)
    try:
        return await asyncio.wait_for(fut, timeout=timeout)
    except asyncio.TimeoutError:
        return None
    finally:
        _PENDING.pop(key, None)


def resolve(key: str, decision: dict) -> bool:
    """Called by /decide when the owner taps. Returns True if someone was waiting."""
    fut = _PENDING.get(key)
    if fut and not fut.done():
        fut.set_result(decision)
        return True
    return False


def is_pending(key: str) -> bool:
    fut = _PENDING.get(key)
    return bool(fut and not fut.done())
