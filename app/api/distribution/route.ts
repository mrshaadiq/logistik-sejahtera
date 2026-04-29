import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import {
  createHistoryLog,
  createOrUpdateDistributionItem,
  getInventoryItemRowById,
  listDistributionItems,
} from "@/lib/logistics-data";
import { supabaseAdmin } from "@/lib/supabase-admin";

type CreateDistributionPayload = {
  inventoryItemId?: number;
  quantity?: number;
};

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) {
      return auth;
    }

    const items = await listDistributionItems();
    return NextResponse.json(items);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load distribution items.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) {
      return auth;
    }

    const body = (await request.json()) as CreateDistributionPayload;
    const inventoryItemId = Number(body.inventoryItemId);
    const quantity = Number(body.quantity);

    if (Number.isNaN(inventoryItemId) || inventoryItemId <= 0) {
      return NextResponse.json({ error: "Barang gudang tidak valid." }, { status: 400 });
    }

    if (Number.isNaN(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: "Jumlah distribusi harus lebih dari 0." },
        { status: 400 },
      );
    }

    const inventoryItem = await getInventoryItemRowById(inventoryItemId);

    if (inventoryItem.jumlah < quantity) {
      return NextResponse.json(
        { error: "Jumlah distribusi melebihi stok gudang." },
        { status: 400 },
      );
    }

    const remainingQuantity = inventoryItem.jumlah - quantity;

    await createOrUpdateDistributionItem({
      inventoryItemId,
      nama: inventoryItem.nama,
      jumlah: quantity,
      expired: inventoryItem.expired_at,
    });

    if (remainingQuantity === 0) {
      const { error } = await supabaseAdmin
        .from("inventory_items")
        .delete()
        .eq("id", inventoryItemId);

      if (error) {
        throw new Error(`Failed to delete inventory item: ${error.message}`);
      }
    } else {
      const { error } = await supabaseAdmin
        .from("inventory_items")
        .update({
          jumlah: remainingQuantity,
          status: "Gudang",
        })
        .eq("id", inventoryItemId);

      if (error) {
        throw new Error(`Failed to update inventory item: ${error.message}`);
      }
    }

    await createHistoryLog(
      `Distribusi barang: ${inventoryItem.nama} sebanyak ${quantity} Pcs, sisa stok gudang ${remainingQuantity} Pcs`,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create distribution item.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
