import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { reconcileStuckCalls } from "@/lib/reconcile";
import * as store from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List the signed-in user's own call records for the dashboard. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // A call whose end-of-call webhook never landed stays "pending" forever and
  // is drawn as an active call. Correct those before reading, so the dashboard
  // repairs itself rather than needing the database edited by hand.
  await reconcileStuckCalls(userId);
  // Return display-only DTOs (no DOB / insurance / callback / notes).
  return NextResponse.json({ calls: await store.allDTO(userId) });
}
