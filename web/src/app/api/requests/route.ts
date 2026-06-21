import { NextRequest, NextResponse } from "next/server";
import { placeCall } from "@/lib/vapi";
import * as store from "@/lib/store";
import { AppointmentRequest, CallRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create a booking request -> place the outbound call. */
export async function POST(req: NextRequest) {
  let request: AppointmentRequest;
  try {
    request = AppointmentRequest.parse(await req.json());
  } catch {
    // Don't echo the raw validation error (avoid leaking internals).
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const record = CallRecord.parse({ request });
  await store.save(record); // save first so the webhook can find it mid-call

  try {
    const vapiCallId = await placeCall(request);
    record.vapiCallId = vapiCallId;
    await store.save(record);
  } catch (e) {
    record.status = "failed";
    record.transcriptSummary = `Could not place call: ${String(e)}`;
    await store.save(record);
    // Return a generic error + the call id; don't leak the raw error or the
    // full record (which contains PHI) in the HTTP response.
    return NextResponse.json({ error: "call failed", callId: record.id }, { status: 502 });
  }

  return NextResponse.json({ record });
}
