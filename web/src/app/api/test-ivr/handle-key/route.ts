/** Handles a keypress from the multi-level test IVR.
 *
 * The current menu arrives as ?menu=<key> (set by each Gather's action URL) and
 * the pressed key as `Digits`. The transition — descend to a submenu, connect
 * to the operator, or reprompt — lives in src/lib/testIvr.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { transition, twimlResponse } from "@/lib/testIvr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function digitsFrom(req: NextRequest): Promise<string> {
  if (req.method === "POST") {
    const form = await req.formData().catch(() => null);
    if (form) return String(form.get("Digits") ?? "");
  }
  return req.nextUrl.searchParams.get("Digits") ?? "";
}

async function handle(req: NextRequest): Promise<Response> {
  // Off unless explicitly enabled (this route is public and can dial the operator).
  if (!config.testIvrEnabled) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const menuKey = req.nextUrl.searchParams.get("menu") ?? "main";
  const digit = await digitsFrom(req);
  return twimlResponse(transition(menuKey, digit));
}

export const GET = handle;
export const POST = handle;
