import { NextResponse } from "next/server";

import { listHistoryLogs } from "@/lib/logistics-data";

export async function GET() {
  try {
    const history = await listHistoryLogs();
    return NextResponse.json(history);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load history logs.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
