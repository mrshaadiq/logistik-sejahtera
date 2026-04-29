import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { listHistoryLogs } from "@/lib/logistics-data";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) {
      return auth;
    }

    const history = await listHistoryLogs();
    return NextResponse.json(history);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load history logs.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
