import { supabaseAdmin } from "@/lib/supabase-admin";
import type { HistoryItem, InventoryItem, ItemStatus } from "@/lib/logistics-types";

type InventoryRow = {
  id: number;
  nama: string;
  jumlah: number;
  status: ItemStatus;
  expired_at: string;
  created_at: string;
};

type HistoryRow = {
  action: string;
  created_at: string;
};

const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

function mapInventoryRow(row: InventoryRow): InventoryItem {
  return {
    id: row.id,
    nama: row.nama,
    jumlah: row.jumlah,
    status: row.status,
    expired: row.expired_at,
    created: dateTimeFormatter.format(new Date(row.created_at)),
  };
}

function mapHistoryRow(row: HistoryRow): HistoryItem {
  return {
    action: row.action,
    time: dateTimeFormatter.format(new Date(row.created_at)),
  };
}

export async function listInventoryItems() {
  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .select("id,nama,jumlah,status,expired_at,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load inventory items: ${error.message}`);
  }

  return (data ?? []).map((row) => mapInventoryRow(row as InventoryRow));
}

export async function listHistoryLogs() {
  const { data, error } = await supabaseAdmin
    .from("history_logs")
    .select("action,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load history logs: ${error.message}`);
  }

  return (data ?? []).map((row) => mapHistoryRow(row as HistoryRow));
}

export async function createHistoryLog(action: string) {
  const { error } = await supabaseAdmin.from("history_logs").insert({ action });

  if (error) {
    throw new Error(`Failed to create history log: ${error.message}`);
  }
}
