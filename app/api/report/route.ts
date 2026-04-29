import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import {
  listDistributionItems,
  listHistoryLogs,
  listInventoryItems,
} from "@/lib/logistics-data";

type ReportType = "inventory" | "distribution" | "history";

function escapeCsvCell(value: string | number | null) {
  const normalizedValue = value === null ? "" : String(value);
  const escaped = normalizedValue.replaceAll('"', '""');
  return `"${escaped}"`;
}

function createCsv(rows: Array<Array<string | number | null>>) {
  return rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")).join("\n");
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) {
      return auth;
    }

    const { searchParams } = new URL(request.url);
    const type = (searchParams.get("type") ?? "inventory") as ReportType;

    if (type === "inventory") {
      const items = await listInventoryItems();
      const csv = createCsv([
        ["ID", "Nama Barang", "Jumlah", "Status", "Expired", "Dibuat"],
        ...items.map((item) => [
          item.id,
          item.nama,
          item.jumlah,
          item.status,
          item.expired,
          item.created,
        ]),
      ]);

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="laporan-inventori.csv"',
        },
      });
    }

    if (type === "distribution") {
      const items = await listDistributionItems();
      const csv = createCsv([
        [
          "ID Distribusi",
          "ID Barang Gudang",
          "Nama Barang",
          "Jumlah",
          "Status",
          "Expired",
          "Asal",
          "Queue",
          "Didistribusikan",
        ],
        ...items.map((item) => [
          item.id,
          item.inventoryItemId,
          item.nama,
          item.jumlah,
          item.status,
          item.expired,
          item.sourceLocation,
          item.queueStatus,
          item.distributedAt,
        ]),
      ]);

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="laporan-distribusi.csv"',
        },
      });
    }

    if (type === "history") {
      const items = await listHistoryLogs();
      const csv = createCsv([
        ["Waktu", "Aktivitas"],
        ...items.map((item) => [item.time, item.action]),
      ]);

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="laporan-riwayat.csv"',
        },
      });
    }

    return NextResponse.json({ error: "Tipe laporan tidak dikenali." }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to export report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
