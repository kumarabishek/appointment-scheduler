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
  } catch (e) {
    return NextResponse.json({ error: "invalid request", detail: String(e) }, { status: 400 });
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
    return NextResponse.json({ error: "call failed", detail: String(e), record }, { status: 502 });
  }

  return NextResponse.json({ record });
}
