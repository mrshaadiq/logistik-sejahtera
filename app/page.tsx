"use client";

import type { ElementType, FormEvent, SetStateAction } from "react";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  Boxes,
  CalendarX,
  ChartPie,
  CheckCircle2,
  Clock,
  History,
  PackagePlus,
  ReceiptText,
  Send,
  SlidersHorizontal,
  Trash2,
  Truck,
  Warehouse,
  X,
  XCircle,
} from "lucide-react";

type ViewId = "ringkasan" | "inventori" | "riwayat" | "pengaturan";
type ItemStatus = "Gudang" | "Distribusi";

type InventoryItem = {
  id: number;
  nama: string;
  jumlah: number;
  status: ItemStatus;
  expired: string;
  created: string;
};

type HistoryItem = {
  time: string;
  action: string;
};

type ConditionLabel = {
  text: string;
  color: string;
  icon: "expired" | "warning" | "safe";
  priority: 1 | 2 | 3;
  blocked: boolean;
};

const DB_KEY = "ls_v3_db";
const HISTORY_KEY = "ls_v3_history";
const STORAGE_EVENT_PREFIX = "ls_v3_sync:";
const EMPTY_DB: InventoryItem[] = [];
const EMPTY_HISTORY: HistoryItem[] = [];

const viewTitles: Record<ViewId, string> = {
  ringkasan: "Ringkasan Utama",
  inventori: "Manajemen Stok",
  riwayat: "Log Transaksi",
  pengaturan: "Pengaturan",
};

const navItems: Array<{ id: ViewId; label: string; icon: ElementType }> = [
  { id: "ringkasan", label: "Ringkasan Utama", icon: ChartPie },
  { id: "inventori", label: "Manajemen Stok", icon: Warehouse },
  { id: "riwayat", label: "Log Transaksi", icon: ReceiptText },
];

function getTodayStart() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getConditionLabel(expiredDate: string): ConditionLabel {
  const today = getTodayStart();
  const expDate = new Date(expiredDate);
  expDate.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil(
    (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays < 0) {
    return {
      text: "SUDAH EXPIRED",
      color: "bg-red-100 text-red-600 border-red-200",
      icon: "expired",
      priority: 1,
      blocked: true,
    };
  }

  if (diffDays <= 30) {
    return {
      text: "MENDEKATI EXPIRED",
      color: "bg-amber-100 text-amber-600 border-amber-200",
      icon: "warning",
      priority: 2,
      blocked: false,
    };
  }

  return {
    text: "KONDISI AMAN",
    color: "bg-emerald-100 text-emerald-600 border-emerald-200",
    icon: "safe",
    priority: 3,
    blocked: false,
  };
}

function ConditionIcon({ type }: { type: ConditionLabel["icon"] }) {
  if (type === "expired") return <XCircle className="h-3 w-3" />;
  if (type === "warning") return <AlertTriangle className="h-3 w-3" />;
  return <CheckCircle2 className="h-3 w-3" />;
}

function parseStorageValue<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readStorageSnapshot(key: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

function subscribeToStorage(key: string, onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const customEventName = `${STORAGE_EVENT_PREFIX}${key}`;

  const handleChange = (event: Event) => {
    if (event instanceof StorageEvent && event.key !== key) {
      return;
    }

    onStoreChange();
  };

  window.addEventListener("storage", handleChange);
  window.addEventListener(customEventName, handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(customEventName, handleChange);
  };
}

function writeStorageValue<T>(key: string, value: T) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(`${STORAGE_EVENT_PREFIX}${key}`));
}

function usePersistentState<T>(
  key: string,
  fallback: T,
): [T, (value: SetStateAction<T>) => void] {
  const rawSnapshot = useSyncExternalStore(
    (onStoreChange) => subscribeToStorage(key, onStoreChange),
    () => readStorageSnapshot(key),
    () => null,
  );
  const value = useMemo(
    () => parseStorageValue(rawSnapshot, fallback),
    [fallback, rawSnapshot],
  );

  const setValue = (nextValue: SetStateAction<T>) => {
    const resolvedValue =
      typeof nextValue === "function"
        ? (nextValue as (current: T) => T)(
            parseStorageValue(readStorageSnapshot(key), fallback),
          )
        : nextValue;

    writeStorageValue(key, resolvedValue);
  };

  return [value, setValue];
}

export default function LogistikSejahteraPage() {
  const [activeView, setActiveView] = useState<ViewId>("ringkasan");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [db, setDb] = usePersistentState<InventoryItem[]>(DB_KEY, EMPTY_DB);
  const [history, setHistory] = usePersistentState<HistoryItem[]>(
    HISTORY_KEY,
    EMPTY_HISTORY,
  );
  const [form, setForm] = useState({
    nama: "",
    jumlah: "",
    status: "Gudang" as ItemStatus,
    expired: "",
  });

  const addHistory = (action: string) => {
    setHistory((current) => [
      { time: new Date().toLocaleString("id-ID"), action },
      ...current,
    ]);
  };

  const sortedItems = useMemo(() => {
    return [...db].sort((a, b) => {
      const labelA = getConditionLabel(a.expired);
      const labelB = getConditionLabel(b.expired);

      if (labelA.priority !== labelB.priority) {
        return labelA.priority - labelB.priority;
      }

      return new Date(a.expired).getTime() - new Date(b.expired).getTime();
    });
  }, [db]);

  const stats = useMemo(() => {
    return db.reduce(
      (acc, item) => {
        const label = getConditionLabel(item.expired);
        acc.total += item.jumlah;
        if (item.status === "Distribusi") acc.dist += 1;
        if (label.priority === 1) acc.expired += 1;
        if (label.priority === 2) acc.near += 1;
        return acc;
      },
      { total: 0, near: 0, expired: 0, dist: 0 },
    );
  }, [db]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const jumlah = Number.parseInt(form.jumlah, 10);
    if (!form.nama.trim() || Number.isNaN(jumlah) || jumlah <= 0 || !form.expired) {
      return;
    }

    const item: InventoryItem = {
      id: Date.now(),
      nama: form.nama.trim(),
      jumlah,
      status: form.status,
      expired: form.expired,
      created: new Date().toLocaleString("id-ID"),
    };

    setDb((current) => [...current, item]);
    addHistory(`Input barang baru: ${item.nama} sejumlah ${item.jumlah} Pcs`);
    setForm({ nama: "", jumlah: "", status: "Gudang", expired: "" });
    setIsModalOpen(false);
  };

  const shipItem = (id: number) => {
    const item = db.find((entry) => entry.id === id);
    if (!item) return;

    setDb((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, status: "Distribusi" } : entry,
      ),
    );
    addHistory(`Barang [${item.nama}] dipindahkan ke Distribusi`);
  };

  const deleteItem = (id: number) => {
    const item = db.find((entry) => entry.id === id);
    if (!item) return;

    setDb((current) => current.filter((entry) => entry.id !== id));
    addHistory(`Penghapusan data barang: ${item.nama}`);
  };

  const clearAllData = () => {
    const isConfirmed = window.confirm(
      "PERINGATAN: Semua data akan dihapus permanen. Lanjutkan?",
    );

    if (!isConfirmed) return;
    setDb([]);
    setHistory([]);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 md:flex">
      <aside className="hidden w-72 flex-col border-r border-slate-800 bg-slate-900 p-6 text-white md:flex">
        <div className="mb-10 flex items-center gap-3 px-2">
          <div className="rounded-lg bg-blue-500 p-2">
            <Boxes className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">
            Logistik <span className="text-blue-400">Sejahtera</span>
          </h1>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl p-3 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
                    : "text-slate-400 hover:bg-slate-800"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 pt-6">
          <button
            type="button"
            onClick={() => setActiveView("pengaturan")}
            className={`flex w-full items-center gap-3 rounded-xl p-3 text-sm font-medium transition-all ${
              activeView === "pengaturan"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
                : "text-slate-400 hover:bg-slate-800"
            }`}
          >
            <SlidersHorizontal className="h-5 w-5" />
            Pengaturan
          </button>
        </div>
      </aside>

      <main className="flex h-screen flex-1 flex-col overflow-hidden">
        <header className="flex h-20 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 md:px-8">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {viewTitles[activeView]}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400 md:hidden">
              Logistik Sejahtera OS
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="mr-4 hidden text-right sm:block">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Admin Gudang
              </p>
              <p className="text-sm font-semibold text-slate-700">Icad Design</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-blue-400 font-bold text-white shadow-md shadow-blue-100">
              IC
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 md:p-8">
          {activeView === "ringkasan" && (
            <section className="animate-[fadeIn_0.3s_ease-in] space-y-8">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                <StatCard
                  title="Total Unit Stok"
                  value={stats.total.toLocaleString("id-ID")}
                  icon={Boxes}
                  iconClassName="bg-blue-50 text-blue-600"
                />
                <StatCard
                  title="Mendekati Expired"
                  value={stats.near.toString()}
                  icon={Clock}
                  className="border-l-4 border-l-amber-500"
                  iconClassName="bg-amber-50 text-amber-600"
                  textClassName="text-amber-600"
                />
                <StatCard
                  title="Sudah Expired"
                  value={stats.expired.toString()}
                  icon={CalendarX}
                  className="border-l-4 border-l-red-500"
                  iconClassName="bg-red-50 text-red-600"
                  textClassName="text-red-600"
                />
                <StatCard
                  title="Distribusi Aktif"
                  value={stats.dist.toString()}
                  icon={Truck}
                  className="border-l-4 border-l-emerald-500"
                  iconClassName="bg-emerald-50 text-emerald-600"
                  textClassName="text-emerald-600"
                />
              </div>

              <InventoryPanel
                title="Saran Pengeluaran Barang"
                subtitle="Diurutkan berdasarkan prioritas keselamatan konsumen (FEFO)"
                items={sortedItems}
                onShip={shipItem}
                onDelete={deleteItem}
              />
            </section>
          )}

          {activeView === "inventori" && (
            <section className="animate-[fadeIn_0.3s_ease-in] space-y-6">
              <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">
                    Basis Data Gudang
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kelola informasi barang masuk dan keluar secara terstruktur.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-xl transition hover:bg-slate-800 active:scale-95"
                >
                  <PackagePlus className="mr-2 inline h-4 w-4" />
                  Input Stok Baru
                </button>
              </div>

              <InventoryPanel items={sortedItems} onShip={shipItem} onDelete={deleteItem} />
            </section>
          )}

          {activeView === "riwayat" && (
            <section className="animate-[fadeIn_0.3s_ease-in] space-y-6">
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 bg-slate-50/50 p-6 font-bold">
                  Log Audit Sistem
                </div>

                {history.length === 0 ? (
                  <p className="p-10 text-center text-sm italic text-slate-400">
                    Tidak ada log aktivitas.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {history.slice(0, 10).map((item, index) => (
                      <div
                        key={`${item.time}-${index}`}
                        className="flex items-center gap-4 p-5 transition hover:bg-slate-50"
                      >
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                          <History className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold leading-tight text-slate-700">
                            {item.action}
                          </p>
                          <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                            {item.time}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {activeView === "pengaturan" && (
            <section className="animate-[fadeIn_0.3s_ease-in] space-y-6">
              <div className="max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <h3 className="mb-6 text-lg font-bold">Database Control</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-2xl border border-red-100 bg-red-50 p-5">
                    <div>
                      <p className="text-sm font-bold text-red-700">
                        Hapus Semua Data
                      </p>
                      <p className="text-xs italic text-red-600/70">
                        Membersihkan LocalStorage secara permanen.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearAllData}
                      className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
                    >
                      WIPE DATA
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md">
          <div className="w-full max-w-md overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="bg-slate-900 p-8 text-white">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-2xl font-bold">Input Inventori</h3>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 transition hover:text-white"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Pastikan data sesuai dengan fisik gudang.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-8">
              <div>
                <label className="ml-1 mb-1.5 block text-[10px] font-bold uppercase text-slate-400">
                  Nama Produk
                </label>
                <input
                  type="text"
                  required
                  value={form.nama}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, nama: event.target.value }))
                  }
                  placeholder="Contoh: Susu UHT 1L"
                  className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="ml-1 mb-1.5 block text-[10px] font-bold uppercase text-slate-400">
                    Jumlah Unit
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={form.jumlah}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        jumlah: event.target.value,
                      }))
                    }
                    placeholder="0"
                    className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 outline-none transition-all focus:ring-4 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="ml-1 mb-1.5 block text-[10px] font-bold uppercase text-slate-400">
                    Lokasi
                  </label>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value as ItemStatus,
                      }))
                    }
                    className="w-full appearance-none rounded-2xl border border-slate-100 bg-slate-50 p-4 outline-none"
                  >
                    <option value="Gudang">Gudang Utama</option>
                    <option value="Distribusi">Distribusi</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="ml-1 mb-1.5 block text-[10px] font-bold uppercase text-red-500">
                  Tanggal Kedaluwarsa
                </label>
                <input
                  type="date"
                  required
                  value={form.expired}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      expired: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-red-100 bg-red-50 p-4 font-bold text-red-700 outline-none transition-all focus:ring-4 focus:ring-red-50"
                />
              </div>

              <button
                type="submit"
                className="mt-4 w-full rounded-2xl bg-blue-600 py-5 font-bold text-white shadow-xl shadow-blue-200 transition hover:bg-blue-700 active:scale-95"
              >
                SIMPAN KE DATABASE
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  className = "",
  iconClassName = "",
  textClassName = "",
}: {
  title: string;
  value: string;
  icon: ElementType;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}
    >
      <div className="mb-4 flex items-start justify-between">
        <div className={`rounded-lg p-2 ${iconClassName}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className={`text-[10px] font-bold uppercase text-slate-400 ${textClassName}`}>
        {title}
      </p>
      <h3 className={`text-3xl font-bold ${textClassName}`}>{value}</h3>
    </div>
  );
}

function InventoryPanel({
  title,
  subtitle,
  items,
  onShip,
  onDelete,
}: {
  title?: string;
  subtitle?: string;
  items: InventoryItem[];
  onShip: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      {title && (
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/30 p-6">
          <div>
            <h3 className="font-bold text-slate-800">{title}</h3>
            {subtitle && <p className="text-[10px] text-slate-400">{subtitle}</p>}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="p-12 text-center italic text-slate-400">
          Belum ada data di gudang.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-400">
              <tr>
                <th className="px-6 py-4">Nama Inventori</th>
                <th className="px-6 py-4">Status &amp; Stok</th>
                <th className="px-6 py-4">Label Penanda</th>
                <th className="px-6 py-4">Tanggal Exp</th>
                <th className="px-6 py-4 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => {
                const label = getConditionLabel(item.expired);
                const isInWarehouse = item.status === "Gudang";

                return (
                  <tr key={item.id} className="group transition hover:bg-slate-50">
                    <td className="px-6 py-5">
                      <p className="font-bold text-slate-700">{item.nama}</p>
                      <p className="text-[9px] text-slate-400">ID: {item.id}</p>
                    </td>

                    <td className="px-6 py-5">
                      <div className="mb-1 flex items-center gap-2">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            item.status === "Gudang" ? "bg-blue-500" : "bg-emerald-500"
                          }`}
                        />
                        <span className="text-xs font-bold text-slate-600">
                          {item.status}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-400">
                        {item.jumlah} Pcs
                      </p>
                    </td>

                    <td className="px-6 py-5">
                      <div
                        className={`flex w-fit items-center gap-2 rounded-xl border px-3 py-1.5 ${label.color}`}
                      >
                        <ConditionIcon type={label.icon} />
                        <span className="text-[9px] font-extrabold uppercase tracking-tight">
                          {label.text}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <p className="font-mono text-sm font-bold text-slate-600">
                        {item.expired}
                      </p>
                    </td>

                    <td className="px-6 py-5 text-right">
                      <div className="flex justify-end gap-2 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                        {isInWarehouse && (
                          <button
                            type="button"
                            onClick={() => onShip(item.id)}
                            disabled={label.blocked}
                            className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
                              label.blocked
                                ? "cursor-not-allowed bg-slate-100 text-slate-300"
                                : "bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white"
                            }`}
                            title={
                              label.blocked
                                ? "Barang expired tidak bisa didistribusikan"
                                : "Kirim ke distribusi"
                            }
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onDelete(item.id)}
                          className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-400 transition hover:bg-red-500 hover:text-white"
                          title="Hapus barang"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
