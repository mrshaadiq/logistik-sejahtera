import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { createHistoryLog, listInventoryItems } from "@/lib/logistics-data";
import type { ItemStatus } from "@/lib/logistics-types";
import { supabaseAdmin } from "@/lib/supabase-admin";

type CreateInventoryPayload = {
  nama?: string;
  jumlah?: number;
  status?: ItemStatus;
  expired?: string;
};

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) {
      return auth;
    }

    const items = await listInventoryItems();
    return NextResponse.json(items);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load inventory items.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) {
      return auth;
    }

    const body = (await request.json()) as CreateInventoryPayload;
    const nama = body.nama?.trim();
    const jumlah = Number(body.jumlah);
    const status = body.status ?? "Gudang";
    const expired = body.expired;

    if (!nama || Number.isNaN(jumlah) || jumlah <= 0 || !expired) {
      return NextResponse.json(
        { error: "Data barang tidak lengkap atau tidak valid." },
        { status: 400 },
      );
    }

    if (status !== "Gudang" && status !== "Distribusi") {
      return NextResponse.json(
        { error: "Status barang tidak valid." },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("inventory_items")
      .insert({
        nama,
        jumlah,
        status,
        expired_at: expired,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Failed to create inventory item: ${error.message}`);
    }

    await createHistoryLog(`Input barang baru: ${nama} sejumlah ${jumlah} Pcs`);

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create inventory item.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
