import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { config } from "@/lib/config";
import { placeCall } from "@/lib/vapi";
import * as store from "@/lib/store";
import { AppointmentRequest, CallRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Normalize common formatting and require E.164, so a bad office number is
 *  rejected here instead of failing (or dialing a short code) once the call is
 *  placed. Returns null if it can't be a valid international number. */
function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{6,14}$/.test(cleaned) ? cleaned : null;
}

/** Create a booking request -> place the outbound call. */
export async function POST(req: NextRequest) {
  // The owning user (middleware already requires a session; double-check here).
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Abuse guard: cap calls per user per rolling 24h (each call costs money).
  // Count-then-create has a small race under parallel requests; acceptable for
  // a soft cost guard (a determined user gains at most a few extra calls).
  const recent = await store.countCallsSince(userId, new Date(Date.now() - DAY_MS));
  if (recent >= config.dailyCallLimit) {
    return NextResponse.json(
      {
        error: `Daily limit reached (${config.dailyCallLimit} calls per 24 hours). Please try again later.`,
        limit: config.dailyCallLimit,
      },
      { status: 429 },
    );
  }

  let request: AppointmentRequest;
  try {
    request = AppointmentRequest.parse(await req.json());
  } catch {
    // Don't echo the raw validation error (avoid leaking internals).
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const phone = normalizePhone(request.providerPhone);
  if (!phone) {
    return NextResponse.json(
      { error: "invalid office phone — use international format, e.g. +14155550123" },
      { status: 400 },
    );
  }
  request.providerPhone = phone;

  const record = CallRecord.parse({ request });
  await store.save(record, userId); // save first so the webhook can find it mid-call

  try {
    const vapiCallId = await placeCall(request);
    record.vapiCallId = vapiCallId;
    await store.save(record, userId);
  } catch (e) {
    record.status = "failed";
    record.transcriptSummary = `Could not place call: ${String(e)}`;
    await store.save(record, userId);
    // Return a generic error + the call id; don't leak the raw error or the
    // full record (which contains PHI) in the HTTP response.
    return NextResponse.json({ error: "call failed", callId: record.id }, { status: 502 });
  }

  // Don't echo the full record (PHI). The UI refetches via /api/calls (DTOs).
  return NextResponse.json({ ok: true, callId: record.id });
}
