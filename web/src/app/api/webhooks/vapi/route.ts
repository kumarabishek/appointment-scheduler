import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { dispatchTool } from "@/lib/booking";
import { sendInfo } from "@/lib/push";
import * as store from "@/lib/store";
import { CallRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The decide_and_book tool can hold the line up to DECISION_TIMEOUT_SECONDS (~45s)
// polling the DB for your tap-to-approve. Allow the function room to wait; must
// cover the Vapi tool server timeout (60s in agent.ts).
export const maxDuration = 60;

type VapiMsg = {
  type?: string;
  call?: { id?: string; metadata?: { request_id?: string } };
  toolCalls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }>;
  toolCallList?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }>;
  functionCall?: { name?: string; parameters?: unknown };
  analysis?: { summary?: string };
};

async function recordFor(msg: VapiMsg): Promise<CallRecord | null> {
  const vapiId = msg.call?.id ?? "";
  let rec = await store.getByVapiId(vapiId);
  if (rec) return rec;
  const reqId = msg.call?.metadata?.request_id;
  if (reqId) {
    rec = await store.getByRequestId(reqId);
    if (rec && !rec.vapiCallId) {
      rec.vapiCallId = vapiId;
      await store.save(rec);
    }
  }
  return rec;
}

/** args === null means the model sent unparseable JSON — don't dispatch (a
 *  tool like decide_and_book would misread {} as "no slots"); tell it to retry. */
function* iterToolCalls(msg: VapiMsg) {
  const list = msg.toolCalls ?? msg.toolCallList;
  if (list) {
    for (const tc of list) {
      let args: unknown = tc.function?.arguments ?? {};
      if (typeof args === "string") {
        try {
          args = JSON.parse(args);
        } catch {
          args = null;
        }
      }
      yield { id: tc.id, name: tc.function?.name ?? "", args };
    }
  } else if (msg.functionCall) {
    yield { id: undefined, name: msg.functionCall.name ?? "", args: msg.functionCall.parameters ?? {} };
  }
}

/** Constant-time compare (hash both sides to fixed length first). */
function secretMatches(given: string, expected: string): boolean {
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(given), h(expected));
}

export async function POST(req: NextRequest) {
  // Fail closed: this route is public (Clerk-exempt, since Vapi can't log in),
  // so the shared secret is the ONLY thing protecting it. If it isn't
  // configured, reject everything rather than accept unauthenticated calls.
  if (!config.vapiWebhookSecret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }
  if (!secretMatches(req.headers.get("x-vapi-secret") ?? "", config.vapiWebhookSecret)) {
    return NextResponse.json({ error: "bad webhook secret" }, { status: 401 });
  }

  const body = (await req.json()) as { message?: VapiMsg } & VapiMsg;
  const msg: VapiMsg = body.message ?? body;
  const rec = await recordFor(msg);

  if (msg.type === "tool-calls" || msg.type === "function-call") {
    const results = [];
    for (const tc of iterToolCalls(msg)) {
      const result =
        tc.args === null
          ? "Invalid tool arguments (bad JSON). Call the tool again with valid arguments."
          : await dispatchTool(rec, tc.name, tc.args as Record<string, unknown>);
      results.push({ toolCallId: tc.id, result });
    }
    return NextResponse.json({ results });
  }

  if (msg.type === "end-of-call-report" && rec) {
    // "confirmed" means a slot was approved but finalize_booking never came —
    // the call dropped mid-booking. Without this it shows "Booking…" forever.
    if (
      rec.status === "pending" ||
      rec.status === "awaiting_confirmation" ||
      rec.status === "confirmed"
    ) {
      const midBooking = rec.status === "confirmed";
      rec.status = "failed";
      rec.transcriptSummary =
        msg.analysis?.summary ??
        (midBooking
          ? "Call ended before the booking was finalized — call the office to check."
          : "Call ended without a confirmed booking.");
      await store.save(rec);
      await sendInfo(
        midBooking ? "❓ Call dropped mid-booking" : "❓ Call ended without a booking",
        "Open the app to review and maybe call back.",
      );
    }
  }

  if (msg.type === "status-update" && rec && !rec.vapiCallId) {
    rec.vapiCallId = msg.call?.id;
    await store.save(rec);
  }

  return NextResponse.json({ received: true });
}
