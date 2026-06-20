"""FastAPI webhook server (single-call hybrid flow).

Endpoints:
- POST /webhooks/vapi   <- Vapi tool calls (decide_and_book, finalize_booking, escalate)
- POST /decide          <- you tapping a slot in the ntfy push (edge cases)
- GET  /calls           <- inspect call records (debug)
"""
from __future__ import annotations

from datetime import datetime

from fastapi import FastAPI, Header, HTTPException, Request

from . import calendar, decisions, matching, notify, push, store
from .config import get_settings
from .models import CallStatus, OfferedSlot

app = FastAPI(title="Appointment Scheduler")


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/calls")
def list_calls():
    return [r.model_dump() for r in store.all_records()]


# ───────────────────────── Vapi webhook ─────────────────────────
@app.post("/webhooks/vapi")
async def vapi_webhook(request: Request, x_vapi_secret: str = Header(default="")):
    s = get_settings()
    if s.vapi_webhook_secret and x_vapi_secret != s.vapi_webhook_secret:
        raise HTTPException(status_code=401, detail="bad webhook secret")

    body = await request.json()
    msg = body.get("message", body)
    mtype = msg.get("type")

    if mtype in ("tool-calls", "function-call"):
        return await _handle_tool_calls(msg)
    if mtype == "end-of-call-report":
        _handle_end_of_call(msg)
    if mtype == "status-update":
        _handle_status_update(msg)
    return {"received": True}


def _record_for(msg: dict):
    call = msg.get("call", {})
    rec = store.get_by_vapi_id(call.get("id", ""))
    if rec:
        return rec
    request_id = (call.get("metadata") or {}).get("request_id")
    if request_id:
        for r in store.all_records():
            if r.request.id == request_id:
                if not r.vapi_call_id:
                    r.vapi_call_id = call.get("id")
                    store.save(r)
                return r
    return None


def _iter_tool_calls(msg: dict):
    if "toolCalls" in msg or "toolCallList" in msg:
        for tc in msg.get("toolCalls") or msg.get("toolCallList") or []:
            fn = tc.get("function", {})
            yield tc.get("id"), fn.get("name"), fn.get("arguments") or {}
    else:
        fc = msg.get("functionCall", {})
        yield None, fc.get("name"), fc.get("parameters") or {}


async def _handle_tool_calls(msg: dict) -> dict:
    rec = _record_for(msg)
    results = []
    for call_id, name, args in _iter_tool_calls(msg):
        reply = await _dispatch_tool(rec, name, args)
        results.append({"toolCallId": call_id, "result": reply})
    return {"results": results}


async def _dispatch_tool(rec, name: str, args: dict) -> str:
    if rec is None:
        return "Acknowledged."

    if name == "decide_and_book":
        return await _decide_and_book(rec, args)
    if name == "finalize_booking":
        return _finalize_booking(rec, args)
    if name == "escalate_to_human":
        reason = args.get("reason", "unspecified")
        rec.status = CallStatus.ESCALATED
        rec.transcript_summary = f"Escalated: {reason}"
        store.save(rec)
        notify.notify_escalation(rec, reason)
        push.send_info(f"⚠️ Needs you: {rec.request.provider_name}", reason)
        return (
            "action: escalate — tell them a family member will call back, thank "
            "them, and end the call."
        )
    return "Acknowledged."


async def _decide_and_book(rec, args: dict) -> str:
    slots = [OfferedSlot(**s) for s in (args.get("offered_slots") or [])]
    rec.offered_slots = slots
    rec.updated_at = datetime.utcnow()

    if args.get("no_slots") or not slots:
        rec.status = CallStatus.NO_SLOTS
        store.save(rec)
        push.send_info(
            f"❌ No availability: {rec.request.provider_name}",
            f"for {rec.request.patient.name} ({rec.request.reason}).",
        )
        return "action: decline — no slots available. Politely end the call."

    # Green zone: a slot that fits your pre-set rules -> book on the spot.
    best = matching.pick_best(slots, rec.request.acceptable_windows)
    if best:
        slot, _dt = best
        return _authorize(rec, slot, why="fits your preferred window")

    # Edge case: nothing fits. Ask you live via tap-to-pick push.
    s = get_settings()
    decisions.open_decision(rec.id)
    push.send_decision_request(rec, slots)
    rec.status = CallStatus.AWAITING_CONFIRMATION
    store.save(rec)

    decision = await decisions.wait_for_decision(rec.id, s.decision_timeout_seconds)

    if decision is not None:
        choice = decision.get("choice", "no")
        if choice.isdigit() and 0 <= int(choice) < len(slots):
            return _authorize(rec, slots[int(choice)], why="you approved it")
        rec.status = CallStatus.FAILED
        rec.transcript_summary = "Owner declined offered slots."
        store.save(rec)
        return "action: decline — none approved. Politely decline and end the call."

    # Timed out waiting for your tap -> apply fallback rule.
    if s.edge_fallback == "closest":
        slot = matching.earliest_overall(slots)
        push.send_info(
            f"⏱️ Auto-booked closest: {rec.request.patient.name}",
            f"No reply in time; booking {slot.starts_at}.",
        )
        return _authorize(rec, slot, why="no reply in time; closest option")
    rec.status = CallStatus.FAILED
    rec.transcript_summary = "No owner response; declined per fallback."
    store.save(rec)
    push.send_info(
        f"⏱️ Declined (no reply): {rec.request.provider_name}",
        "You can call back to book.",
    )
    return "action: decline — no response in time. Politely decline and end the call."


def _authorize(rec, slot: OfferedSlot, why: str) -> str:
    """Mark a slot as approved-to-book and tell the agent to book it now."""
    rec.chosen_slot = slot
    rec.status = CallStatus.CONFIRMED
    store.save(rec)
    return (
        f"action: book — approved ({why}). Book this exact slot with the office "
        f"now: {slot.starts_at}"
        + (f" with {slot.provider}" if slot.provider else "")
        + ". Get a confirmation number, then call finalize_booking."
    )


def _finalize_booking(rec, args: dict) -> str:
    if args.get("slot"):
        rec.chosen_slot = OfferedSlot(**args["slot"])
    rec.status = CallStatus.BOOKED
    conf = args.get("confirmation_number")
    prep = args.get("prep_instructions")
    rec.transcript_summary = " | ".join(
        x for x in [f"Confirmation: {conf}" if conf else None,
                    f"Prep: {prep}" if prep else None] if x
    ) or "Booked."
    store.save(rec)
    calendar.upsert_event(rec, tentative=False)
    notify.notify_booked(rec)
    slot = rec.chosen_slot
    push.send_info(
        f"✅ Booked: {rec.request.patient.name}",
        f"{slot.starts_at} at {rec.request.provider_name}."
        + (f" Conf# {conf}." if conf else ""),
    )
    return "action: done — recorded. Thank them and end the call."


def _handle_end_of_call(msg: dict) -> None:
    rec = _record_for(msg)
    if rec is None:
        return
    if rec.status in (CallStatus.PENDING, CallStatus.AWAITING_CONFIRMATION):
        rec.status = CallStatus.FAILED
        rec.transcript_summary = (msg.get("analysis") or {}).get(
            "summary"
        ) or "Call ended without a confirmed booking."
        store.save(rec)
        push.send_info(
            f"❓ Call ended unbooked: {rec.request.provider_name}",
            f"for {rec.request.patient.name}. You may want to call back.",
        )


def _handle_status_update(msg: dict) -> None:
    rec = _record_for(msg)
    if rec and not rec.vapi_call_id:
        rec.vapi_call_id = msg.get("call", {}).get("id")
        store.save(rec)


# ───────────────── Owner tap-to-pick (ntfy action) ─────────────────
@app.api_route("/decide", methods=["GET", "POST"])
async def decide(call: str, choice: str):
    """Resolve a live decision when you tap a button in the push notification."""
    rec = store.get(call)
    if rec is None:
        return {"ok": False, "detail": "unknown call"}
    if not decisions.is_pending(call):
        return {"ok": False, "detail": "decision window closed — agent already moved on"}
    delivered = decisions.resolve(call, {"choice": choice})
    label = "declined" if choice in ("no", "skip") else f"slot {choice}"
    return {"ok": delivered, "you_chose": label}
