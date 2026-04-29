import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST() {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) {
      return auth;
    }

    const { error: distributionError } = await supabaseAdmin
      .from("distribution_items")
      .delete()
      .gte("id", 0);

    if (distributionError && distributionError.code !== "PGRST205") {
      throw new Error(`Failed to delete distribution items: ${distributionError.message}`);
    }

    const { error: historyError } = await supabaseAdmin
      .from("history_logs")
      .delete()
      .gte("id", 0);

    if (historyError) {
      throw new Error(`Failed to delete history logs: ${historyError.message}`);
    }

    const { error: inventoryError } = await supabaseAdmin
      .from("inventory_items")
      .delete()
      .gte("id", 0);

    if (inventoryError) {
      throw new Error(`Failed to delete inventory items: ${inventoryError.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reset application data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
