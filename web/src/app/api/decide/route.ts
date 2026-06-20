import { NextRequest, NextResponse } from "next/server";
import { isPending, resolveDecision } from "@/lib/decisions";
import * as store from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolve a live decision when you tap a button in the push notification.
 *  ntfy sends POST; GET is allowed too so you can test from a browser. */
async function handle(req: NextRequest) {
  const call = req.nextUrl.searchParams.get("call") ?? "";
  const choice = req.nextUrl.searchParams.get("choice") ?? "";

  const rec = await store.get(call);
  if (!rec) return NextResponse.json({ ok: false, detail: "unknown call" });
  if (!(await isPending(call))) {
    return NextResponse.json({
      ok: false,
      detail: "decision window closed — agent already moved on",
    });
  }
  const delivered = await resolveDecision(call, { choice });
  const label = choice === "no" || choice === "skip" ? "declined" : `slot ${choice}`;
  return NextResponse.json({ ok: delivered, you_chose: label });
}

export const GET = handle;
export const POST = handle;
