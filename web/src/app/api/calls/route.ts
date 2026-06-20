import { NextResponse } from "next/server";
import * as store from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List all call records for the dashboard. */
export async function GET() {
  return NextResponse.json({ calls: await store.all() });
}
