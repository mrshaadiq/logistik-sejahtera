export type ItemStatus = "Gudang" | "Distribusi";

export type InventoryItem = {
  id: number;
  nama: string;
  jumlah: number;
  status: ItemStatus;
  expired: string;
  created: string;
};

export type DistributionItem = {
  id: number;
  inventoryItemId: number | null;
  nama: string;
  jumlah: number;
  status: ItemStatus;
  expired: string;
  sourceLocation: string;
  queueStatus: "Menunggu Distribusi";
  distributedAt: string;
};

export type HistoryItem = {
  time: string;
  action: string;
};
