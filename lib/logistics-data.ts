import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  DistributionItem,
  HistoryItem,
  InventoryItem,
  ItemStatus,
} from "@/lib/logistics-types";

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

type DistributionRow = {
  id: number;
  inventory_item_id: number;
  nama: string;
  jumlah: number;
  status: ItemStatus;
  expired_at: string;
  source_location: string;
  queue_status: "Menunggu Distribusi";
  distributed_at: string;
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

function mapDistributionRow(row: DistributionRow): DistributionItem {
  return {
    id: row.id,
    inventoryItemId: row.inventory_item_id,
    nama: row.nama,
    jumlah: row.jumlah,
    status: row.status,
    expired: row.expired_at,
    sourceLocation: row.source_location,
    queueStatus: row.queue_status,
    distributedAt: dateTimeFormatter.format(new Date(row.distributed_at)),
  };
}

function isMissingDistributionTable(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "PGRST205"
  );
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

export async function getInventoryItemById(id: number) {
  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .select("id,nama,jumlah,status,expired_at,created_at")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(`Failed to load inventory item: ${error.message}`);
  }

  return mapInventoryRow(data as InventoryRow);
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

export async function listDistributionItems() {
  const { data, error } = await supabaseAdmin
    .from("distribution_items")
    .select(
      "id,inventory_item_id,nama,jumlah,status,expired_at,source_location,queue_status,distributed_at",
    )
    .order("distributed_at", { ascending: false });

  if (error) {
    if (isMissingDistributionTable(error)) {
      return [];
    }

    throw new Error(`Failed to load distribution items: ${error.message}`);
  }

  return (data ?? []).map((row) => mapDistributionRow(row as DistributionRow));
}

export async function syncDistributionItem(item: InventoryItem) {
  const { error } = await supabaseAdmin.from("distribution_items").upsert(
    {
      inventory_item_id: item.id,
      nama: item.nama,
      jumlah: item.jumlah,
      status: item.status,
      expired_at: item.expired,
      source_location: "Gudang Utama",
      queue_status: "Menunggu Distribusi",
      distributed_at: new Date().toISOString(),
    },
    {
      onConflict: "inventory_item_id",
    },
  );

  if (error) {
    if (isMissingDistributionTable(error)) {
      return;
    }

    throw new Error(`Failed to sync distribution item: ${error.message}`);
  }
}

export async function removeDistributionItem(inventoryItemId: number) {
  const { error } = await supabaseAdmin
    .from("distribution_items")
    .delete()
    .eq("inventory_item_id", inventoryItemId);

  if (error) {
    if (isMissingDistributionTable(error)) {
      return;
    }

    throw new Error(`Failed to delete distribution item: ${error.message}`);
  }
}
