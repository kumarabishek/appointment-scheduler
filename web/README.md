# Appointment Scheduler — Web (TypeScript / Next.js)

The TypeScript port of the appointment-booking agent, with a **web app** entry
point: fill out a form, hit *Call & book*, and watch the call's status update
live on the dashboard. (The original Python prototype lives in `../app`.)

Single-call hybrid flow: the agent calls the office and books a slot that fits
your rules on the spot. If nothing fits, it applies your `EDGE_FALLBACK` rule
(book the closest time, or decline) and shows the result on the dashboard.

> Optional live approval: set `NTFY_TOPIC` to get a tap-to-pick push for edge
> cases (the agent holds the line while you decide). Left blank, it's disabled
> and the fallback runs automatically — recommended for a simple personal setup.

## Stack

| Layer | Tech | File |
|---|---|---|
| Front-end (form + live dashboard) | React / Next.js | `src/app/page.tsx` |
| Telephony + orchestration | **Vapi** | `src/lib/vapi.ts` |
| Brain (LLM) | **Gemini Flash** (via Vapi) | `src/lib/agent.ts` |
| Voice (TTS) | **ElevenLabs** (via Vapi) | `src/lib/agent.ts` |
| Ears (STT) | **Deepgram** (via Vapi) | `src/lib/agent.ts` |
| Webhook + tool handling | Next API routes | `src/app/api/webhooks/vapi/route.ts` |
| Green-zone matching | chrono-node | `src/lib/matching.ts` |
| Live tap-to-approve (optional) | ntfy.sh + in-memory promises | `src/lib/push.ts`, `src/lib/decisions.ts` |
| Calendar push | **Google Calendar** (→ `.ics` fallback) | `src/lib/googleCalendar.ts`, `src/lib/calendar.ts` |
| Types (single source of truth) | zod | `src/lib/types.ts` |
| Storage (PHI, local only) | JSON file | `src/lib/store.ts` |

## Setup

```bash
npm install
cp .env.example .env.local        # fill in Vapi values (ntfy optional)
ngrok http 8000                   # paste https URL into PUBLIC_BASE_URL
npm run dev                       # http://localhost:8000
```

Provider keys (Gemini, ElevenLabs, Deepgram) go in the **Vapi dashboard →
Providers**, not `.env.local`. Vapi makes those calls.

### Google Calendar (optional)

Booked appointments land on your Google Calendar if configured, else in a local
`data/appointments.ics` file. To enable Google:

1. Google Cloud Console → enable the **Calendar API**, create an **OAuth 2.0
   Web client**, add `http://localhost:5858/oauth2callback` as a redirect URI.
2. Mint a refresh token (one time):
   ```bash
   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run google-auth
   ```
   Follow the printed URL, approve, and copy the `GOOGLE_REFRESH_TOKEN` it prints
   into `.env.local` (along with the client id/secret).
3. Timezone is **auto-detected per request** from the booker's browser (the
   editable "Office timezone" field), since spoken times like "9:30 AM" carry no
   zone. `CALENDAR_TIMEZONE` is only a server-side fallback. Default events are
   30 min (`APPOINTMENT_DURATION_MINUTES`).

If a spoken time can't be parsed into a real datetime, no event is created and
you get a push to add it manually — the agent never guesses a calendar time.

## API surface

- `POST /api/requests` — create a booking → places the Vapi call
- `GET  /api/calls` — list call records (the dashboard polls this)
- `POST /api/webhooks/vapi` — Vapi tool calls (decide_and_book / finalize / escalate)
- `GET|POST /api/decide?call=&choice=` — your ntfy tap resolves a live decision

## Notes / caveats

- The live-hold decision registry (`decisions.ts`) is **in-memory**, so it works
  in a single Node process (`next dev` or self-hosted `next start`). For
  serverless/multi-instance, back it with Redis pub/sub.
- Spoken-time parsing (`matching.ts`) is best-effort via chrono-node; unparseable
  slots safely fall through to asking you rather than guessing.
- Same compliance caveats as the Python version apply: AI disclosure, call-
  recording consent law, and PHI handling. Not a HIPAA-compliant system. Test
  against your own cell before calling a real office.
