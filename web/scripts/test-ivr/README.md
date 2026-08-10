# Testing IVR navigation (fake doctor's office)

This stands up a fake touch-tone phone tree **served by your own app**, so the
agent has a real "press 1 for scheduling" menu + hold queue to navigate. Use
**fake patient data only**.

```
Agent (Vapi)  ──calls──▶  Twilio number  ──fetches TwiML──▶  /api/test-ivr
                                                                   │ press 1
                                                                   ▼
                                                          /api/test-ivr/handle-key
                                                          hold music ──▶ your cell
                                                          (you play the operator)
```

## One-time setup

1. **Buy a Twilio number** (a trial number is fine).

2. **Run the app with a public URL:**
   ```bash
   npm run dev:tunnel
   ```
   Note the ngrok https URL it prints (also written to `PUBLIC_BASE_URL`).

3. **Point the Twilio number at this app.** In the Twilio Console → your number →
   *Voice → A call comes in* → **Webhook**, set:
   ```
   https://<your-ngrok>/api/test-ivr      (HTTP POST)
   ```

4. **In `.env.local`**, set the "operator" to your own cell and turn off HIPAA
   mode so you can watch the call:
   ```
   TEST_OPERATOR_PHONE=+1YOURCELL
   HIPAA_MODE=false
   ```
   (No operator number? The menu still works — a short scripted scheduler voice
   plays instead of dialing you. Re-set `HIPAA_MODE=true` when done testing.)

## Run a test call

1. Put your **Twilio** number into `test-request.json` as `providerPhone`.
2. With the server running:
   ```bash
   npm run place-call -- scripts/test-ivr/test-request.json
   ```
3. Your cell rings after the menu + hold — pick up and play the scheduler.

## The menu tree (multi-level)

```
main (SPEECH-FIRST: "in a few words, tell me the reason for your call…")
     ├─ say "schedule / appointment / checkup / lab" ▶ appointments
     ├─ say "billing" ▶ billing (closed, hangs up)
     ├─ unrecognized speech ▶ "didn't catch that" reprompt
main ─ 1 ▶ appointments ─ 1 ▶ new ─ 1 ▶ primary care ──▶ HOLD ▶ operator
     │                  │         └─ 2 ▶ specialist  ──▶ HOLD ▶ operator
     │                  │         └─ 9 ▶ back to appointments
     │                  ├─ 2 ▶ existing patient ▶ ENTER DOB (8 digits, MMDDYYYY)
     │                  │        └─ callback offer ─ press 1 ▶ hangs up (FAIL)
     │                  │                          └─ stay silent ▶ HOLD ▶ operator
     │                  ├─ 3 ▶ lab / bloodwork ─────────▶ HOLD ▶ operator
     │                  └─ 9 ▶ back to main
     ├─ 2 ▶ billing (closed, hangs up)
     └─ 9 ▶ repeat main
```

So the agent must press a **sequence**, not one key. The existing-patient path
also exercises two hard cases: a **DOB keypad gate** (the DOB is not in the
agent's prompt — it must fetch it via `get_patient_details` and key it in as
`01011990`, matching `test-request.json`) and a **callback-queue offer** where
the correct move is to stay silent (accepting the callback ends the call with
no booking, since the agent's number can't take return calls). Expected paths:

| Request reason | Correct keypresses | Levels |
|---|---|---|
| existing-patient checkup ("annual checkup") | `1` → `2` → `01011990` → *silence* | 4 |
| lab / bloodwork | `1` → `3` | 2 |
| new patient, primary care | `1` → `1` → `1` | 3 |
| new patient, specialist | `1` → `1` → `2` | 3 |

Change `reason`/`visitType` in your request JSON to steer which branch is
correct, then check the agent navigated it. Invalid keys reprompt the same
menu; `9` goes back up a level.

## What to watch for (Vapi dashboard → Logs)

- at the speech-first main menu: a **short spoken phrase** ("schedule an
  appointment", 2-4 words — not a sentence, not its opening) OR a `1`
  keypress; both are correct since the menu is hybrid, but keys are preferred
- a **sequence** of `dtmf` tool calls (e.g. `"1"` then `"2"`) matching the table
- the agent **waits for each menu to finish** before pressing
- at the DOB gate: a `get_patient_details` call **before** the `dtmf` with the
  8 DOB digits (never guessed — the DOB isn't in its prompt)
- at the callback offer: **no keypress** — it declines the callback by waiting
- the agent **silent during hold music** (no phantom replies)
- when you (the operator) answer: it **waits out your full greeting** — try
  answering with "Wellness Partners, can I get the patient's name and date of
  birth?" and check it answers the question instead of talking over you or
  launching a monologue
- it does **not** volunteer that it's an AI — but ask it "am I talking to a
  robot?" and it must answer honestly (that's the rule that must never break)

## Tuning knobs

- Menus (prompts, digits, depth): `src/lib/testIvr.ts` — edit the `MENUS` map
- Hold music length, operator script, dial timeout: `renderConnect()` in the same file
