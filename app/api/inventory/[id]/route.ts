import { NextResponse } from "next/server";

import {
  createHistoryLog,
  getInventoryItemById,
  removeDistributionItem,
  syncDistributionItem,
} from "@/lib/logistics-data";
import type { ItemStatus } from "@/lib/logistics-types";
import { supabaseAdmin } from "@/lib/supabase-admin";

type InventoryRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type UpdateInventoryPayload = {
  nama?: string;
  jumlah?: number;
  status?: ItemStatus;
  expired?: string;
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
    const updates: {
      nama?: string;
      jumlah?: number;
      status?: ItemStatus;
      expired_at?: string;
    } = {};

    if (body.nama !== undefined) {
      const nama = body.nama.trim();

      if (!nama) {
        return NextResponse.json(
          { error: "Nama barang tidak boleh kosong." },
          { status: 400 },
        );
      }

      updates.nama = nama;
    }

    if (body.jumlah !== undefined) {
      const jumlah = Number(body.jumlah);

      if (Number.isNaN(jumlah) || jumlah <= 0) {
        return NextResponse.json(
          { error: "Jumlah barang harus lebih dari 0." },
          { status: 400 },
        );
      }

      updates.jumlah = jumlah;
    }

    if (body.status !== undefined) {
      if (body.status !== "Gudang" && body.status !== "Distribusi") {
        return NextResponse.json(
          { error: "Status barang tidak valid." },
          { status: 400 },
        );
      }

      updates.status = body.status;
    }

    if (body.expired !== undefined) {
      if (!body.expired) {
        return NextResponse.json(
          { error: "Tanggal kedaluwarsa wajib diisi." },
          { status: 400 },
        );
      }

      updates.expired_at = body.expired;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Tidak ada data yang dikirim untuk diperbarui." },
        { status: 400 },
      );
    }

    const itemName = await getItemName(id);

    const { error } = await supabaseAdmin
      .from("inventory_items")
      .update(updates)
      .eq("id", id);

    if (error) {
      throw new Error(`Failed to update inventory item: ${error.message}`);
    }

    const updatedItem = await getInventoryItemById(id);

    if (updatedItem.status === "Distribusi") {
      await syncDistributionItem(updatedItem);
    } else {
      await removeDistributionItem(id);
    }

    if (
      Object.keys(updates).length === 1 &&
      updates.status !== undefined &&
      body.nama === undefined &&
      body.jumlah === undefined &&
      body.expired === undefined
    ) {
      await createHistoryLog(`Barang [${itemName}] dipindahkan ke ${updates.status}`);
    } else {
      await createHistoryLog(`Perubahan data barang: ${itemName}`);
    }

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
    await removeDistributionItem(id);

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
