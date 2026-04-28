import { NextResponse } from "next/server";

import { createHistoryLog } from "@/lib/logistics-data";
import type { ItemStatus } from "@/lib/logistics-types";
import { supabaseAdmin } from "@/lib/supabase-admin";

type InventoryRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type UpdateInventoryPayload = {
  status?: ItemStatus;
};

async function getItemName(id: number) {
  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .select("nama")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(`Failed to load inventory item: ${error.message}`);
  }

  return data.nama as string;
}

export async function PATCH(request: Request, context: InventoryRouteContext) {
  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);

    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "ID barang tidak valid." }, { status: 400 });
    }

    const body = (await request.json()) as UpdateInventoryPayload;
    const status = body.status;

    if (status !== "Gudang" && status !== "Distribusi") {
      return NextResponse.json({ error: "Status barang tidak valid." }, { status: 400 });
    }

    const itemName = await getItemName(id);

    const { error } = await supabaseAdmin
      .from("inventory_items")
      .update({ status })
      .eq("id", id);

    if (error) {
      throw new Error(`Failed to update inventory item: ${error.message}`);
    }

    await createHistoryLog(`Barang [${itemName}] dipindahkan ke ${status}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update inventory item.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: InventoryRouteContext) {
  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);

    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "ID barang tidak valid." }, { status: 400 });
    }

    const itemName = await getItemName(id);

    const { error } = await supabaseAdmin.from("inventory_items").delete().eq("id", id);

    if (error) {
      throw new Error(`Failed to delete inventory item: ${error.message}`);
    }

    await createHistoryLog(`Penghapusan data barang: ${itemName}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete inventory item.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
