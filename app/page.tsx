"use client";

import type { ElementType, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
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

import type { HistoryItem, InventoryItem, ItemStatus } from "@/lib/logistics-types";

type ViewId = "ringkasan" | "inventori" | "riwayat" | "pengaturan";

type ConditionLabel = {
  text: string;
  color: string;
  icon: "expired" | "warning" | "safe";
  priority: 1 | 2 | 3;
  blocked: boolean;
};

const EMPTY_DB: InventoryItem[] = [];
const EMPTY_HISTORY: HistoryItem[] = [];
const primaryNavItems: Array<{ id: ViewId; label: string; mobileLabel: string; icon: ElementType }> = [
  { id: "ringkasan", label: "Ringkasan Utama", mobileLabel: "Ringkas", icon: ChartPie },
  { id: "inventori", label: "Manajemen Stok", mobileLabel: "Stok", icon: Warehouse },
  { id: "riwayat", label: "Log Transaksi", mobileLabel: "Riwayat", icon: ReceiptText },
];
const settingsNavItem = {
  id: "pengaturan" as ViewId,
  label: "Pengaturan",
  mobileLabel: "Atur",
  icon: SlidersHorizontal,
};
const mobileNavItems = [...primaryNavItems, settingsNavItem];

const viewTitles: Record<ViewId, string> = {
  ringkasan: "Ringkasan Utama",
  inventori: "Manajemen Stok",
  riwayat: "Log Transaksi",
  pengaturan: "Pengaturan",
};

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

export default function LogistikSejahteraPage() {
  const [activeView, setActiveView] = useState<ViewId>("ringkasan");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [db, setDb] = useState<InventoryItem[]>(EMPTY_DB);
  const [history, setHistory] = useState<HistoryItem[]>(EMPTY_HISTORY);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState({
    nama: "",
    jumlah: "",
    status: "Gudang" as ItemStatus,
    expired: "",
  });

  async function parseApiResponse<T>(response: Response): Promise<T> {
    const payload = (await response.json()) as T | { error?: string };

    if (!response.ok) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : "Permintaan ke server gagal.";
      throw new Error(message);
    }

    return payload as T;
  }

  async function loadDashboardData() {
    const [inventoryResponse, historyResponse] = await Promise.all([
      fetch("/api/inventory", { cache: "no-store" }),
      fetch("/api/history", { cache: "no-store" }),
    ]);

    const [inventoryData, historyData] = await Promise.all([
      parseApiResponse<InventoryItem[]>(inventoryResponse),
      parseApiResponse<HistoryItem[]>(historyResponse),
    ]);

    setDb(inventoryData);
    setHistory(historyData);
  }

  useEffect(() => {
    let isMounted = true;

    const initializeDashboard = async () => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const [inventoryResponse, historyResponse] = await Promise.all([
          fetch("/api/inventory", { cache: "no-store" }),
          fetch("/api/history", { cache: "no-store" }),
        ]);

        const [inventoryData, historyData] = await Promise.all([
          parseApiResponse<InventoryItem[]>(inventoryResponse),
          parseApiResponse<HistoryItem[]>(historyResponse),
        ]);

        if (!isMounted) {
          return;
        }

        setDb(inventoryData);
        setHistory(historyData);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "Gagal memuat data dashboard.",
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void initializeDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const jumlah = Number.parseInt(form.jumlah, 10);
    if (!form.nama.trim() || Number.isNaN(jumlah) || jumlah <= 0 || !form.expired) {
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nama: form.nama.trim(),
          jumlah,
          status: form.status,
          expired: form.expired,
        }),
      });

      await parseApiResponse<{ id: number }>(response);
      await loadDashboardData();

      setForm({ nama: "", jumlah: "", status: "Gudang", expired: "" });
      setIsModalOpen(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Gagal menyimpan data barang.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const shipItem = async (id: number) => {
    setIsSaving(true);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/inventory/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "Distribusi" }),
      });

      await parseApiResponse<{ success: true }>(response);
      await loadDashboardData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Gagal memindahkan barang.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const deleteItem = async (id: number) => {
    setIsSaving(true);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/inventory/${id}`, {
        method: "DELETE",
      });

      await parseApiResponse<{ success: true }>(response);
      await loadDashboardData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Gagal menghapus barang.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const clearAllData = async () => {
    const isConfirmed = window.confirm(
      "PERINGATAN: Semua data akan dihapus permanen. Lanjutkan?",
    );

    if (!isConfirmed) return;

    setIsSaving(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/reset", {
        method: "POST",
      });

      await parseApiResponse<{ success: true }>(response);
      setDb([]);
      setHistory([]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Gagal menghapus semua data.",
      );
    } finally {
      setIsSaving(false);
    }
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
          {primaryNavItems.map((item) => {
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

      <main className="flex min-h-screen flex-1 flex-col overflow-hidden pb-24 md:h-screen md:pb-0">
        <header className="flex flex-shrink-0 flex-col gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-5 md:h-20 md:flex-row md:items-center md:justify-between md:px-8 md:py-0">
          <div className="flex items-center justify-between md:hidden">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-slate-900 p-2 text-white shadow-sm">
                <Boxes className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold leading-none text-slate-800">
                  Logistik Sejahtera
                </p>
                <p className="mt-1 text-[11px] text-slate-400">Dashboard gudang</p>
              </div>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-blue-400 font-bold text-white shadow-md shadow-blue-100">
              IC
            </div>
          </div>

          <div className="md:block">
            <h2 className="text-3xl font-bold leading-tight text-slate-800 md:text-xl">
              {viewTitles[activeView]}
            </h2>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-slate-400 md:text-xs">
              Pantau stok, expired, dan distribusi barang dari satu tampilan.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 md:justify-end md:gap-4">
            {activeView === "inventori" && (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-slate-200 transition hover:bg-slate-800 md:hidden"
              >
                <PackagePlus className="h-4 w-4" />
                Input Stok
              </button>
            )}
            <div className="mr-0 hidden text-right sm:block md:mr-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Admin Gudang
              </p>
              <p className="text-sm font-semibold text-slate-700">Icad Design</p>
            </div>
            <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-blue-400 font-bold text-white shadow-md shadow-blue-100 md:flex">
              IC
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 pb-28 md:p-8 md:pb-8">
          {errorMessage && (
            <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          {isLoading && (
            <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
              Menghubungkan dashboard ke database...
            </div>
          )}

          {activeView === "ringkasan" && (
            <section className="animate-[fadeIn_0.3s_ease-in] space-y-8">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-4">
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
              <div className="hidden flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 md:flex md:flex-row md:items-center md:justify-between">
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
                <div className="border-b border-slate-100 bg-slate-50/50 p-4 font-bold md:p-6">
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
                        className="flex items-start gap-4 p-4 transition hover:bg-slate-50 md:items-center md:p-5"
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
              <div className="max-w-xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
                <h3 className="mb-6 text-lg font-bold">Database Control</h3>
                <div className="space-y-4">
                  <div className="flex flex-col gap-4 rounded-2xl border border-red-100 bg-red-50 p-5 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-bold text-red-700">
                        Hapus Semua Data
                      </p>
                      <p className="text-xs italic text-red-600/70">
                        Membersihkan semua data inventori dan log di Supabase.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearAllData}
                      disabled={isSaving}
                      className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
                    >
                      {isSaving ? "MEMPROSES..." : "WIPE DATA"}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 py-3 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
        <div className="grid grid-cols-4 gap-2">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold transition ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.mobileLabel}
              </button>
            );
          })}
        </div>
      </nav>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-md md:items-center md:p-4">
          <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl md:rounded-[2rem]">
            <div className="bg-slate-900 p-6 text-white md:p-8">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-xl font-bold md:text-2xl">Input Inventori</h3>
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

            <form onSubmit={handleSubmit} className="space-y-5 overflow-y-auto p-5 md:p-8">
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                disabled={isSaving}
                className="mt-4 w-full rounded-2xl bg-blue-600 py-5 font-bold text-white shadow-xl shadow-blue-200 transition hover:bg-blue-700 active:scale-95"
              >
                {isSaving ? "MENYIMPAN..." : "SIMPAN KE DATABASE"}
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
      className={`h-full rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm md:rounded-2xl md:p-6 ${className}`}
    >
      <div className="flex h-full flex-col justify-between gap-6">
        <div className="flex items-start justify-between gap-3">
          <div className={`rounded-2xl p-3 ${iconClassName}`}>
            <Icon className="h-5 w-5" />
          </div>
          <h3 className={`text-4xl font-bold leading-none ${textClassName}`}>{value}</h3>
        </div>
        <p
          className={`max-w-[10rem] text-[10px] font-bold uppercase leading-relaxed tracking-[0.18em] text-slate-400 ${textClassName}`}
        >
          {title}
        </p>
      </div>
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
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/30 p-4 md:p-6">
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
        <>
          <div className="divide-y divide-slate-100 md:hidden">
            {items.map((item) => {
              const label = getConditionLabel(item.expired);
              const isInWarehouse = item.status === "Gudang";

              return (
                <article key={item.id} className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-700">{item.nama}</p>
                      <p className="mt-1 text-[10px] text-slate-400">ID: {item.id}</p>
                    </div>
                    <div
                      className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 ${label.color}`}
                    >
                      <ConditionIcon type={label.icon} />
                      <span className="text-[9px] font-extrabold uppercase tracking-tight">
                        {label.text}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Status
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            item.status === "Gudang" ? "bg-blue-500" : "bg-emerald-500"
                          }`}
                        />
                        <span className="font-semibold text-slate-700">{item.status}</span>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Stok
                      </p>
                      <p className="mt-2 font-semibold text-slate-700">{item.jumlah} Pcs</p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Tanggal Exp
                    </p>
                    <p className="mt-2 font-mono text-sm font-bold text-slate-600">
                      {item.expired}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {isInWarehouse && (
                      <button
                        type="button"
                        onClick={() => onShip(item.id)}
                        disabled={label.blocked}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                          label.blocked
                            ? "cursor-not-allowed bg-slate-100 text-slate-300"
                            : "bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white"
                        }`}
                      >
                        <Send className="h-4 w-4" />
                        Distribusi
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      className="flex items-center justify-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-500 transition hover:bg-red-500 hover:text-white"
                    >
                      <Trash2 className="h-4 w-4" />
                      Hapus
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
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
        </>
      )}
    </div>
  );
}
