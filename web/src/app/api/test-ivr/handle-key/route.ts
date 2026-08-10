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

/** Twilio posts `Digits` for keypresses and `SpeechResult` for hybrid
 *  (speech-enabled) Gathers — either or both may be present. */
async function inputFrom(req: NextRequest): Promise<{ digits: string; speech: string }> {
  if (req.method === "POST") {
    const form = await req.formData().catch(() => null);
    if (form) {
      return {
        digits: String(form.get("Digits") ?? ""),
        speech: String(form.get("SpeechResult") ?? ""),
      };
    }
  }
  return {
    digits: req.nextUrl.searchParams.get("Digits") ?? "",
    speech: req.nextUrl.searchParams.get("SpeechResult") ?? "",
  };
}

async function handle(req: NextRequest): Promise<Response> {
  // Off unless explicitly enabled (this route is public and can dial the operator).
  if (!config.testIvrEnabled) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const menuKey = req.nextUrl.searchParams.get("menu") ?? "main";
  const { digits, speech } = await inputFrom(req);
  return twimlResponse(transition(menuKey, digits, speech));
}

export const GET = handle;
export const POST = handle;
