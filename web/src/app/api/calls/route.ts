import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as store from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List the signed-in user's own call records for the dashboard. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ calls: await store.all(userId) });
}
