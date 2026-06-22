/** A fake doctor's-office IVR for testing the agent's phone-tree navigation.
 *
 * Point a Twilio number's "A call comes in" webhook at:
 *   https://<your-ngrok>/api/test-ivr
 * Then place a scheduler call with providerPhone = that Twilio number. Twilio
 * fetches this TwiML (the top-level menu); each keypress is resolved by
 * /api/test-ivr/handle-key, which walks the nested menus in src/lib/testIvr.ts.
 *
 * Returns TwiML (XML), not JSON.
 */
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { renderMenu, twimlResponse } from "@/lib/testIvr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Off unless explicitly enabled — this route is public and would otherwise leak
// the operator number / act as a bridge to ring it.
const menu = () =>
  config.testIvrEnabled
    ? twimlResponse(renderMenu("main"))
    : NextResponse.json({ error: "not found" }, { status: 404 });

export const GET = () => menu();
export const POST = () => menu();
