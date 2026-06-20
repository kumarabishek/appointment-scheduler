#!/usr/bin/env python3
"""Kick off an appointment-booking call from a request JSON file.

    python book.py requests/blood_test.json

The webhook server (app.main) must be running and reachable at PUBLIC_BASE_URL
so Vapi can deliver the agent's function calls back to us.
"""
import json
import sys

from app import store, vapi_client
from app.models import AppointmentRequest, CallRecord


def main(path: str) -> None:
    req = AppointmentRequest.model_validate(json.loads(open(path).read()))
    record = CallRecord(request=req)
    store.save(record)  # save first so the webhook can find it mid-call

    print(f"Placing call to {req.provider_name} ({req.provider_phone}) ...")
    vapi_call_id = vapi_client.place_call(req)

    record.vapi_call_id = vapi_call_id
    store.save(record)
    print(f"Call started. call_record={record.id} vapi_call={vapi_call_id}")
    print("You'll get a text with options once the agent gathers them.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python book.py <request.json>")
        raise SystemExit(1)
    main(sys.argv[1])
