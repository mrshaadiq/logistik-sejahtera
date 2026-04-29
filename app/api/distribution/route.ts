import { NextResponse } from "next/server";

import { listDistributionItems } from "@/lib/logistics-data";

export async function GET() {
  try {
    const items = await listDistributionItems();
    return NextResponse.json(items);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load distribution items.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
