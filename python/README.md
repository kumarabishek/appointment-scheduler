# Appointment Scheduler

An AI voice agent that **calls** doctors' offices, labs, and hospital scheduling
lines on your behalf, navigates the phone tree / hold queue, talks to the
operator, and **books the appointment — all in a single call**.

Built for the "spent 40 minutes on hold" problem. It uses **hybrid
authorization**: you set your acceptable time windows up front, so the agent can
book a fitting slot on the spot. Only when the office offers nothing that fits
does it ping you for a quick tap-to-approve — while it keeps the operator on the
line. No second call, no waiting.

## How it works

```
book.py ──> Vapi places ONE outbound call ──> Gemini talks to the operator
                                                       │
                            agent collects offered slots, calls decide_and_book
                                                       │
                          ┌────────────────────────────┴───────────────────────┐
                  slot fits your rules?                              nothing fits?
                          │                                                │
                  book it live, now                      push to your phone w/ buttons
                          │                                   (agent holds the line)
                          │                              ┌──────────┴──────────┐
                          │                          you tap a slot      no reply in time
                          │                              │                     │
                          └──────────────┬───────────────┘             fallback: decline
                                         ▼                              (or book closest)
                          finalize_booking ──> calendar (.ics) + ✅ push
```

| Piece | Tech | File |
|------|------|------|
| Telephony + low-latency voice | **Vapi** (managed) | `app/vapi_client.py` |
| The agent's brain | **Gemini Flash** (via Vapi) | `app/agent.py` |
| Voice (TTS) | **ElevenLabs** (via Vapi) | `app/agent.py` |
| Orchestration + webhooks | **FastAPI** | `app/main.py` |
| Green-zone matching | dateutil | `app/matching.py` |
| Live tap-to-approve (edge cases) | **ntfy.sh** push + futures | `app/push.py`, `app/decisions.py` |
| Booking record + calendar | `.ics` | `app/calendar.py` |
| Optional SMS confirmations | **Twilio** | `app/notify.py` |
| Storage (PHI, local only) | JSON file | `app/store.py` |

## Setup

1. **Install**
   ```bash
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. **Accounts:** create a [Vapi](https://vapi.ai) account (private API key + buy a
   phone number → phone number id). In the **Vapi dashboard → Providers**, add
   your **Google/Gemini** API key (the LLM) and your **ElevenLabs** API key (the
   voice) — Vapi makes those calls, so the keys live there, not in `.env`. Then
   install the **ntfy** app
   ([iOS](https://apps.apple.com/app/ntfy/id1625396347) / [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy))
   — pick a private, hard-to-guess topic and subscribe to it. (Twilio is
   optional, only for SMS confirmations.)
3. **Configure**
   ```bash
   cp .env.example .env   # then fill it in (including NTFY_TOPIC)
   ```
4. **Expose your server** (so Vapi + your ntfy taps can reach it):
   ```bash
   ngrok http 8000        # paste the https URL into PUBLIC_BASE_URL in .env
   ```
5. **Run the server**
   ```bash
   uvicorn app.main:app --port 8000 --reload
   ```
6. **Place a call**
   ```bash
   cp requests/blood_test.example.json requests/mom_bloodwork.json  # edit it
   python book.py requests/mom_bloodwork.json
   ```

Most calls finish hands-off. If the office only offers times outside your
windows, your phone buzzes with tap-to-pick buttons while the agent waits — tap
one and it books before hanging up.

## Before you call anyone — please read

- **Disclosure:** the agent states it's an AI calling on the patient's behalf in
  its first message. Keep that — many offices ask, and it's the right thing.
- **Recording/consent law:** Vapi records calls. Several US states require
  two-party consent. Know your state's rule and configure recording accordingly.
- **HIPAA / sensitive data:** patient names, DOBs, and insurance IDs flow through
  this. `data/` is git-ignored and local. Don't sync it anywhere shared, and
  minimize what you store. This prototype is **not** a HIPAA-compliant system.
- **Authorization:** offices may require you to be an authorized representative
  for a family member. The agent will escalate to you (`escalate_to_human` →
  push) when it can't proceed.
- **You're responsible for the calls placed.** Test against your own number
  first (set `provider_phone` to your cell) before calling a real office.

## What's a prototype vs. production

This is a working v1 skeleton. Before real reliance you'd want: parsing the
spoken time into a real calendar datetime, retries/voicemail handling, a proper
DB with encryption at rest, per-patient profiles, and call-recording controls
that match your jurisdiction.
