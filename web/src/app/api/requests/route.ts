import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { config } from "@/lib/config";
import { placeCall } from "@/lib/vapi";
import * as store from "@/lib/store";
import { AppointmentRequest, CallRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Create a booking request -> place the outbound call. */
export async function POST(req: NextRequest) {
  // The owning user (middleware already requires a session; double-check here).
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Abuse guard: cap calls per user per rolling 24h (each call costs money).
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
