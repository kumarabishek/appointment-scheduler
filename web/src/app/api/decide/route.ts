import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { verifyDecideToken } from "@/lib/decideToken";
import { isPending, resolveDecision } from "@/lib/decisions";
import * as store from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolve a live decision when you tap a button in the push notification.
 *
 *  This route is PUBLIC (Clerk-exempt in middleware.ts): the ntfy app POSTs the
 *  button URL with no session cookies. Authorization is the signed token in the
 *  URL — HMAC over {call, choice, expiry}, minted server-side when the push was
 *  sent (see decideToken.ts). A signed-in owner (browser) is accepted too.
 *
 *  POST only: a GET with side effects would be CSRF-able via a crafted link.
 */
export async function POST(req: NextRequest) {
  const call = req.nextUrl.searchParams.get("call") ?? "";
  const choice = req.nextUrl.searchParams.get("choice") ?? "";
  const token = req.nextUrl.searchParams.get("token") ?? "";

  // Existence + authorization. Never reveal whether other calls exist.
  const owner = await store.ownerOf(call);
  let authorized = owner !== null && verifyDecideToken(call, choice, token);
  if (!authorized && owner !== null) {
    const { userId } = await auth();
    authorized = !!userId && owner === userId;
  }
  if (!authorized) {
    return NextResponse.json({ ok: false, detail: "unknown call" });
  }

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
