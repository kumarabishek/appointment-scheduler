import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { dispatchTool } from "@/lib/booking";
import { sendInfo } from "@/lib/push";
import * as store from "@/lib/store";
import { CallRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The decide_and_book tool can hold the line up to DECISION_TIMEOUT_SECONDS (~25s)
// polling the DB for your tap-to-approve. Allow the function room to wait.
// NOTE: Vercel Hobby caps functions at 10s — needs Pro, or lower the timeout.
export const maxDuration = 30;

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

function* iterToolCalls(msg: VapiMsg) {
  const list = msg.toolCalls ?? msg.toolCallList;
  if (list) {
    for (const tc of list) {
      const args =
        typeof tc.function?.arguments === "string"
          ? JSON.parse(tc.function.arguments)
          : (tc.function?.arguments ?? {});
      yield { id: tc.id, name: tc.function?.name ?? "", args };
    }
  } else if (msg.functionCall) {
    yield { id: undefined, name: msg.functionCall.name ?? "", args: msg.functionCall.parameters ?? {} };
  }
}

export async function POST(req: NextRequest) {
  if (config.vapiWebhookSecret) {
    const secret = req.headers.get("x-vapi-secret") ?? "";
    if (secret !== config.vapiWebhookSecret) {
      return NextResponse.json({ error: "bad webhook secret" }, { status: 401 });
    }
  }

  const body = (await req.json()) as { message?: VapiMsg } & VapiMsg;
  const msg: VapiMsg = body.message ?? body;
  const rec = await recordFor(msg);

  if (msg.type === "tool-calls" || msg.type === "function-call") {
    const results = [];
    for (const tc of iterToolCalls(msg)) {
      const result = await dispatchTool(rec, tc.name, tc.args as Record<string, unknown>);
      results.push({ toolCallId: tc.id, result });
    }
    return NextResponse.json({ results });
  }

  if (msg.type === "end-of-call-report" && rec) {
    if (rec.status === "pending" || rec.status === "awaiting_confirmation") {
      rec.status = "failed";
      rec.transcriptSummary = msg.analysis?.summary ?? "Call ended without a confirmed booking.";
      await store.save(rec);
      await sendInfo(
        "❓ Call ended without a booking",
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
