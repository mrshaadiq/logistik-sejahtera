"use client";

import type { ElementType, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CalendarX,
  ChartPie,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Filter,
  History,
  LockKeyhole,
  LogOut,
  PackagePlus,
  Pencil,
  ReceiptText,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Truck,
  UserRoundPlus,
  Warehouse,
  X,
  XCircle,
} from "lucide-react";

import type {
  DistributionItem,
  HistoryItem,
  InventoryItem,
} from "@/lib/logistics-types";

type ViewId =
  | "ringkasan"
  | "inventori"
  | "distribusi"
  | "laporan"
  | "riwayat"
  | "pengaturan";
type ExpiryFilter = "all" | "safe" | "near" | "expired" | "critical";
type AuthMode = "login" | "register";

type ConditionLabel = {
  text: string;
  color: string;
  icon: "expired" | "warning" | "safe";
  priority: 1 | 2 | 3;
  blocked: boolean;
};

type SearchMetadata = {
  kategori: string;
  batch: string;
  lokasi: string;
};

type AuthSessionPayload = {
  authenticated: boolean;
  setupRequired: boolean;
  user: {
    userId: number;
    username: string;
  } | null;
};

type AuthState =
  | {
      status: "loading";
      setupRequired: boolean;
      user: null;
    }
  | {
      status: "unauthenticated";
      setupRequired: boolean;
      user: null;
    }
  | {
      status: "authenticated";
      setupRequired: boolean;
      user: {
        userId: number;
        username: string;
      };
    };

const EMPTY_DB: InventoryItem[] = [];
const EMPTY_DISTRIBUTION: DistributionItem[] = [];
const EMPTY_HISTORY: HistoryItem[] = [];
const CRITICAL_STOCK_THRESHOLD = 25;
const primaryNavItems: Array<{ id: ViewId; label: string; mobileLabel: string; icon: ElementType }> = [
  { id: "ringkasan", label: "Ringkasan Utama", mobileLabel: "Ringkas", icon: ChartPie },
  { id: "inventori", label: "Manajemen Stok", mobileLabel: "Stok", icon: Warehouse },
  { id: "distribusi", label: "Distribusi", mobileLabel: "Distribusi", icon: Truck },
  { id: "laporan", label: "Laporan CSV", mobileLabel: "Laporan", icon: FileSpreadsheet },
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
  distribusi: "Distribusi Barang",
  laporan: "Laporan CSV",
  riwayat: "Log Transaksi",
  pengaturan: "Pengaturan",
};

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Permintaan ke server gagal.";

    throw new ApiError(message, response.status);
  }

  return payload as T;
}

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

function isCriticalStock(jumlah: number) {
  return jumlah <= CRITICAL_STOCK_THRESHOLD;
}

function getDerivedCategory(nama: string) {
  const normalizedName = nama.toLowerCase();

  if (
    normalizedName.includes("susu") ||
    normalizedName.includes("uht") ||
    normalizedName.includes("teh") ||
    normalizedName.includes("kopi") ||
    normalizedName.includes("jus") ||
    normalizedName.includes("sirup")
  ) {
    return "Minuman";
  }

  if (
    normalizedName.includes("nugget") ||
    normalizedName.includes("sosis") ||
    normalizedName.includes("ayam") ||
    normalizedName.includes("bakso") ||
    normalizedName.includes("daging")
  ) {
    return "Makanan Beku";
  }

  if (
    normalizedName.includes("saus") ||
    normalizedName.includes("sambal") ||
    normalizedName.includes("mayones") ||
    normalizedName.includes("tomat")
  ) {
    return "Bumbu & Saus";
  }

  if (
    normalizedName.includes("roti") ||
    normalizedName.includes("biskuit") ||
    normalizedName.includes("mie") ||
    normalizedName.includes("snack")
  ) {
    return "Makanan Kering";
  }

  return "Umum";
}

function getItemMetadata(item: InventoryItem): SearchMetadata {
  const rackLabel = item.id % 2 === 0 ? "Rak A" : "Rak B";
  const zoneLabel = item.status === "Distribusi" ? "Distribusi" : "Gudang";

  return {
    kategori: getDerivedCategory(item.nama),
    batch: `BT-${String(item.id).padStart(4, "0")}-${item.expired.slice(2, 7).replace("-", "")}`,
    lokasi: `${zoneLabel} / ${rackLabel}`,
  };
}

export default function LogistikSejahteraPage() {
  const [activeView, setActiveView] = useState<ViewId>("ringkasan");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authState, setAuthState] = useState<AuthState>({
    status: "loading",
    setupRequired: false,
    user: null,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDistributionModalOpen, setIsDistributionModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [distributionTarget, setDistributionTarget] = useState<InventoryItem | null>(null);
  const [db, setDb] = useState<InventoryItem[]>(EMPTY_DB);
  const [distribution, setDistribution] = useState<DistributionItem[]>(EMPTY_DISTRIBUTION);
  const [history, setHistory] = useState<HistoryItem[]>(EMPTY_HISTORY);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [authErrorMessage, setAuthErrorMessage] = useState("");
  const [form, setForm] = useState({
    nama: "",
    jumlah: "",
    expired: "",
  });
  const [distributionForm, setDistributionForm] = useState({
    quantity: "1",
  });
  const [authForm, setAuthForm] = useState({
    username: "",
    password: "",
  });
  const isEditMode = editingItem !== null;

  const resetForm = () => {
    setForm({ nama: "", jumlah: "", expired: "" });
    setEditingItem(null);
  };

  const closeModal = () => {
    setErrorMessage("");
    setIsModalOpen(false);
    resetForm();
  };

  const openCreateModal = () => {
    setErrorMessage("");
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (item: InventoryItem) => {
    setErrorMessage("");
    setEditingItem(item);
    setForm({
      nama: item.nama,
      jumlah: item.jumlah.toString(),
      expired: item.expired,
    });
    setIsModalOpen(true);
  };

  const closeDistributionModal = () => {
    setDistributionTarget(null);
    setDistributionForm({ quantity: "1" });
    setErrorMessage("");
    setIsDistributionModalOpen(false);
  };

  const openDistributionModal = (item: InventoryItem) => {
    setDistributionTarget(item);
    setDistributionForm({ quantity: String(Math.max(1, Math.min(item.jumlah, 1))) });
    setErrorMessage("");
    setIsDistributionModalOpen(true);
  };

  const applyUnauthenticatedState = useCallback((setupRequired: boolean) => {
    setAuthState({
      status: "unauthenticated",
      setupRequired,
      user: null,
    });
    setDb([]);
    setDistribution([]);
    setHistory([]);
    setIsLoading(false);
  }, []);

  const loadSession = useCallback(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    return parseApiResponse<AuthSessionPayload>(response);
  }, []);

  const loadDashboardData = useCallback(async () => {
    const [inventoryResponse, distributionResponse, historyResponse] = await Promise.all([
      fetch("/api/inventory", { cache: "no-store" }),
      fetch("/api/distribution", { cache: "no-store" }),
      fetch("/api/history", { cache: "no-store" }),
    ]);

    const [inventoryData, distributionData, historyData] = await Promise.all([
      parseApiResponse<InventoryItem[]>(inventoryResponse),
      parseApiResponse<DistributionItem[]>(distributionResponse),
      parseApiResponse<HistoryItem[]>(historyResponse),
    ]);

    setDb(inventoryData);
    setDistribution(distributionData);
    setHistory(historyData);
  }, []);

  const initializeApp = useCallback(async () => {
    setIsLoading(true);

    try {
      const sessionPayload = await loadSession();

      if (!sessionPayload.authenticated || !sessionPayload.user) {
        applyUnauthenticatedState(sessionPayload.setupRequired);
        setAuthMode(sessionPayload.setupRequired ? "register" : "login");
        return;
      }

      setAuthState({
        status: "authenticated",
        setupRequired: sessionPayload.setupRequired,
        user: sessionPayload.user,
      });

      await loadDashboardData();
      setErrorMessage("");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        applyUnauthenticatedState(false);
        return;
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Gagal memuat dashboard.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [applyUnauthenticatedState, loadDashboardData, loadSession]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void initializeApp();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [initializeApp]);

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

  const distributionInventoryItems = useMemo<InventoryItem[]>(() => {
    return distribution.map((item) => ({
      id: item.id,
      nama: item.nama,
      jumlah: item.jumlah,
      status: "Distribusi",
      expired: item.expired,
      created: item.distributedAt,
    }));
  }, [distribution]);

  const stats = useMemo(() => {
    return db.reduce(
      (acc, item) => {
        const label = getConditionLabel(item.expired);
        acc.total += item.jumlah;
        if (label.priority === 1) acc.expired += 1;
        if (label.priority === 2) acc.near += 1;
        if (isCriticalStock(item.jumlah)) acc.critical += 1;
        return acc;
      },
      { total: 0, near: 0, expired: 0, critical: 0 },
    );
  }, [db]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setAuthErrorMessage("");

    try {
      const response = await fetch(
        authMode === "login" ? "/api/auth/login" : "/api/auth/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: authForm.username.trim(),
            password: authForm.password,
          }),
        },
      );

      await parseApiResponse<{ success: true }>(response);
      setAuthForm({ username: "", password: "" });
      await initializeApp();
    } catch (error) {
      setAuthErrorMessage(
        error instanceof Error ? error.message : "Gagal memproses autentikasi.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLogout() {
    setIsSaving(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      await parseApiResponse<{ success: true }>(response);
      applyUnauthenticatedState(false);
      setAuthMode("login");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Gagal logout dari sistem.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const jumlah = Number.parseInt(form.jumlah, 10);
    if (!form.nama.trim() || Number.isNaN(jumlah) || jumlah <= 0 || !form.expired) {
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      if (isEditMode && !editingItem) {
        throw new Error("Data barang yang akan diedit tidak ditemukan.");
      }

      const endpoint =
        isEditMode && editingItem ? `/api/inventory/${editingItem.id}` : "/api/inventory";
      const response = await fetch(endpoint, {
        method: isEditMode ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nama: form.nama.trim(),
          jumlah,
          expired: form.expired,
          status: "Gudang",
        }),
      });

      await parseApiResponse<{ success?: true; id?: number }>(response);
      await loadDashboardData();
      closeModal();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        applyUnauthenticatedState(false);
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : isEditMode
            ? "Gagal memperbarui data barang."
            : "Gagal menyimpan data barang.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const submitDistribution = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!distributionTarget) {
      return;
    }

    const quantity = Number.parseInt(distributionForm.quantity, 10);
    if (Number.isNaN(quantity) || quantity <= 0) {
      setErrorMessage("Jumlah distribusi tidak valid.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/distribution", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inventoryItemId: distributionTarget.id,
          quantity,
        }),
      });

      await parseApiResponse<{ success: true }>(response);
      await loadDashboardData();
      closeDistributionModal();
      setActiveView("distribusi");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        applyUnauthenticatedState(false);
        return;
      }

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
      if (error instanceof ApiError && error.status === 401) {
        applyUnauthenticatedState(false);
        return;
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Gagal menghapus barang.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const clearAllData = async () => {
    const isConfirmed = window.confirm(
      "PERINGATAN: Semua data inventori, distribusi, dan riwayat akan dihapus. Lanjutkan?",
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
      setDistribution([]);
      setHistory([]);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        applyUnauthenticatedState(false);
        return;
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Gagal menghapus semua data.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  function downloadReport(type: "inventory" | "distribution" | "history") {
    window.location.href = `/api/report?type=${type}`;
  }

  if (authState.status !== "authenticated") {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#dbeafe_0%,_#eff6ff_30%,_#f8fafc_100%)] px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-[2rem] border border-white/70 bg-white/80 p-8 shadow-xl shadow-blue-100 backdrop-blur md:p-10">
            <div className="inline-flex items-center gap-3 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              <Boxes className="h-4 w-4" />
              Logistik Sejahtera
            </div>
            <h1 className="mt-6 max-w-xl text-4xl font-black tracking-tight text-slate-900">
              Login gudang, distribusi, dan laporan CSV dalam satu dashboard.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
              Akun disimpan di Supabase, sesi diamankan dengan cookie HTTP-only, dan
              distribusi sekarang otomatis mengurangi stok di gudang.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <FeatureCard
                icon={ShieldCheck}
                title="Akses Terkontrol"
                description="Username dan password tersimpan di database Supabase dengan hash."
              />
              <FeatureCard
                icon={Truck}
                title="Stok Berkurang Otomatis"
                description="Saat barang masuk distribusi, jumlah stok gudang langsung dipotong."
              />
              <FeatureCard
                icon={FileSpreadsheet}
                title="Ekspor CSV"
                description="Laporan inventori, distribusi, dan riwayat siap diunduh kapan saja."
              />
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-300 md:p-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-300">
                  Portal Admin
                </p>
                <h2 className="mt-3 text-2xl font-bold">
                  {authState.setupRequired ? "Buat akun pertama" : "Masuk ke dashboard"}
                </h2>
              </div>
              <div className="rounded-2xl bg-white/10 p-3">
                {authMode === "login" ? (
                  <LockKeyhole className="h-5 w-5 text-blue-200" />
                ) : (
                  <UserRoundPlus className="h-5 w-5 text-blue-200" />
                )}
              </div>
            </div>

            {!authState.setupRequired && (
              <div className="mt-6 flex rounded-2xl bg-white/10 p-1 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthErrorMessage("");
                  }}
                  className={`flex-1 rounded-[1rem] px-4 py-3 font-semibold transition ${
                    authMode === "login" ? "bg-white text-slate-900" : "text-slate-300"
                  }`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("register");
                    setAuthErrorMessage("");
                  }}
                  className={`flex-1 rounded-[1rem] px-4 py-3 font-semibold transition ${
                    authMode === "register" ? "bg-white text-slate-900" : "text-slate-300"
                  }`}
                >
                  Daftar
                </button>
              </div>
            )}

            {authErrorMessage && (
              <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {authErrorMessage}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="mt-6 space-y-5">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  Username
                </label>
                <input
                  type="text"
                  value={authForm.username}
                  onChange={(event) =>
                    setAuthForm((current) => ({
                      ...current,
                      username: event.target.value,
                    }))
                  }
                  placeholder="admin-gudang"
                  className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-white outline-none transition focus:border-blue-300 focus:bg-white/15"
                  required
                  minLength={4}
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  Password
                </label>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) =>
                    setAuthForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  placeholder="Minimal 6 karakter"
                  className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-white outline-none transition focus:border-blue-300 focus:bg-white/15"
                  required
                  minLength={6}
                />
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full rounded-2xl bg-blue-500 px-4 py-4 text-sm font-black uppercase tracking-[0.18em] text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving
                  ? "Memproses..."
                  : authMode === "login"
                    ? "Masuk ke Dashboard"
                    : "Simpan Akun ke Supabase"}
              </button>
            </form>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 md:flex">
      <aside className="hidden w-72 flex-col border-r border-slate-800 bg-slate-900 p-6 text-white md:flex">
        <div className="mb-10 flex items-center gap-3 px-2">
          <div className="rounded-lg bg-blue-500 p-2">
            <Boxes className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              Logistik <span className="text-blue-400">Sejahtera</span>
            </h1>
            <p className="text-xs text-slate-400">Sistem gudang & distribusi</p>
          </div>
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

        <div className="space-y-3 border-t border-slate-800 pt-6">
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

          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-3 rounded-xl p-3 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-5 w-5" />
            Logout
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
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-blue-400 font-bold uppercase text-white shadow-md shadow-blue-100">
              {authState.user.username.slice(0, 2)}
            </div>
          </div>

          <div className="md:block">
            <h2 className="text-3xl font-bold leading-tight text-slate-800 md:text-xl">
              {viewTitles[activeView]}
            </h2>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-slate-400 md:text-xs">
              Pantau stok gudang, distribusi barang, dan laporan CSV dari satu tampilan.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 md:justify-end md:gap-4">
            {activeView === "inventori" && (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-slate-200 transition hover:bg-slate-800 md:w-auto"
              >
                <PackagePlus className="h-4 w-4" />
                Input Stok
              </button>
            )}
            {activeView === "laporan" && (
              <button
                type="button"
                onClick={() => downloadReport("inventory")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-600 md:w-auto"
              >
                <Download className="h-4 w-4" />
                Export Inventori
              </button>
            )}
            <div className="mr-0 hidden text-right sm:block md:mr-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Admin Gudang
              </p>
              <p className="text-sm font-semibold text-slate-700">
                {authState.user.username}
              </p>
            </div>
            <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-blue-400 font-bold uppercase text-white shadow-md shadow-blue-100 md:flex">
              {authState.user.username.slice(0, 2)}
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
            <section className="space-y-8">
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <StatCard
                  title="Total Unit Stok Gudang"
                  value={stats.total.toLocaleString("id-ID")}
                  icon={Boxes}
                  iconClassName="bg-blue-50 text-blue-600"
                />
                <StatCard
                  title="Stok Kritis"
                  value={stats.critical.toString()}
                  icon={AlertTriangle}
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
                  title="Item di Distribusi"
                  value={distribution.length.toString()}
                  icon={Truck}
                  className="border-l-4 border-l-emerald-500"
                  iconClassName="bg-emerald-50 text-emerald-600"
                  textClassName="text-emerald-600"
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <InventoryPanel
                  title="Prioritas Gudang"
                  subtitle="Urutan stok berdasarkan FEFO dan kondisi kedaluwarsa"
                  items={sortedItems.slice(0, 6)}
                  onEdit={openEditModal}
                  onShip={openDistributionModal}
                  onDelete={deleteItem}
                />

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                      <History className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">Aktivitas Terkini</h3>
                      <p className="text-xs text-slate-400">
                        Ringkasan perubahan terbaru dari sistem gudang
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    {history.slice(0, 5).map((item) => (
                      <div
                        key={`${item.time}-${item.action}`}
                        className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                      >
                        <p className="text-sm font-semibold text-slate-700">{item.action}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{item.time}</p>
                      </div>
                    ))}

                    {history.length === 0 && (
                      <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm italic text-slate-400">
                        Belum ada log aktivitas.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeView === "inventori" && (
            <section className="space-y-6">
              <div className="hidden rounded-3xl border border-slate-200 bg-white p-6 md:flex md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Basis Data Gudang</h3>
                  <p className="text-xs text-slate-500">
                    Kelola stok gudang utama. Distribusi dilakukan dari tombol kirim.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
                >
                  <PackagePlus className="h-4 w-4" />
                  Tambah Barang
                </button>
              </div>

              <InventoryPanel
                items={sortedItems}
                onEdit={openEditModal}
                onShip={openDistributionModal}
                onDelete={deleteItem}
              />
            </section>
          )}

          {activeView === "distribusi" && (
            <section className="space-y-6">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <h3 className="text-lg font-bold text-slate-800">Daftar Barang Distribusi</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Barang yang dipindahkan dari gudang tercatat di sini, termasuk jumlah yang
                  sudah keluar dari stok gudang.
                </p>
              </div>

              <InventoryPanel
                title="Queue Distribusi"
                subtitle="Menampilkan barang yang sudah dipindahkan dari gudang"
                items={distributionInventoryItems}
                onEdit={openEditModal}
                onShip={openDistributionModal}
                onDelete={deleteItem}
                mode="distribution"
              />
            </section>
          )}

          {activeView === "laporan" && (
            <section className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <ReportCard
                  title="Laporan Inventori"
                  description="Unduh stok gudang aktif beserta jumlah, status, dan tanggal expired."
                  onDownload={() => downloadReport("inventory")}
                />
                <ReportCard
                  title="Laporan Distribusi"
                  description="Unduh data barang yang sudah keluar dari gudang ke distribusi."
                  onDownload={() => downloadReport("distribution")}
                />
                <ReportCard
                  title="Laporan Riwayat"
                  description="Unduh log perubahan data dan aktivitas distribusi dalam format CSV."
                  onDownload={() => downloadReport("history")}
                />
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800">Apa yang masuk ke laporan?</h3>
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <InfoPill
                    title="Inventori"
                    text={`${db.length} item gudang aktif siap diekspor.`}
                  />
                  <InfoPill
                    title="Distribusi"
                    text={`${distribution.length} item distribusi tercatat saat ini.`}
                  />
                  <InfoPill
                    title="Riwayat"
                    text={`${history.length} log aktivitas dapat diunduh ke CSV.`}
                  />
                </div>
              </div>
            </section>
          )}

          {activeView === "riwayat" && (
            <section className="space-y-6">
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
                    {history.map((item) => (
                      <div
                        key={`${item.time}-${item.action}`}
                        className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between md:px-6"
                      >
                        <p className="font-semibold text-slate-700">{item.action}</p>
                        <p className="text-xs text-slate-400">{item.time}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {activeView === "pengaturan" && (
            <section className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
                  <h3 className="mb-6 text-lg font-bold">Akun Aktif</h3>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      Username
                    </p>
                    <p className="mt-3 text-xl font-bold text-slate-800">
                      {authState.user.username}
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      Session login disimpan lewat cookie HTTP-only di browser.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    disabled={isSaving}
                    className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-70"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
                  <h3 className="mb-6 text-lg font-bold">Database Control</h3>
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
                      <p className="text-sm font-bold text-red-700">Hapus Semua Data</p>
                      <p className="mt-2 text-xs italic text-red-600/70">
                        Membersihkan semua data inventori, distribusi, dan log di Supabase.
                      </p>
                      <button
                        type="button"
                        onClick={clearAllData}
                        disabled={isSaving}
                        className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-70"
                      >
                        {isSaving ? "MEMPROSES..." : "WIPE DATA"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur md:hidden">
          <div className="grid grid-cols-6 gap-1">
            {mobileNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-semibold transition ${
                    isActive ? "bg-blue-50 text-blue-700" : "text-slate-500"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.mobileLabel}
                </button>
              );
            })}
          </div>
        </nav>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between bg-slate-900 px-5 py-5 text-white md:px-8">
              <div>
                <h3 className="text-xl font-black">
                  {isEditMode ? "Edit Data Barang" : "Input Stok Baru"}
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  {isEditMode
                    ? "Perbarui data stok gudang agar sesuai kondisi aktual."
                    : "Barang baru akan disimpan sebagai stok gudang utama."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 transition hover:text-white"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-5 md:p-8">
              <div>
                <label className="mb-1.5 ml-1 block text-[10px] font-bold uppercase text-slate-400">
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
                  <label className="mb-1.5 ml-1 block text-[10px] font-bold uppercase text-slate-400">
                    Jumlah Unit Gudang
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
                    className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 outline-none transition focus:ring-4 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-1.5 ml-1 block text-[10px] font-bold uppercase text-red-500">
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
                    className="w-full rounded-2xl border border-red-100 bg-red-50 p-4 font-bold text-red-700 outline-none transition focus:ring-4 focus:ring-red-50"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="mt-4 w-full rounded-2xl bg-blue-600 py-5 font-bold text-white shadow-xl shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-70"
              >
                {isSaving
                  ? isEditMode
                    ? "MEMPERBARUI..."
                    : "MENYIMPAN..."
                  : isEditMode
                    ? "SIMPAN PERUBAHAN"
                    : "SIMPAN KE DATABASE"}
              </button>
            </form>
          </div>
        </div>
      )}

      {isDistributionModalOpen && distributionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between bg-emerald-600 px-5 py-5 text-white md:px-8">
              <div>
                <h3 className="text-xl font-black">Kirim ke Distribusi</h3>
                <p className="mt-1 text-xs text-emerald-50/90">
                  Stok gudang akan langsung berkurang setelah distribusi disimpan.
                </p>
              </div>
              <button
                type="button"
                onClick={closeDistributionModal}
                className="text-emerald-100 transition hover:text-white"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={submitDistribution} className="space-y-5 p-5 md:p-8">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-800">{distributionTarget.nama}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Stok gudang tersedia: {distributionTarget.jumlah.toLocaleString("id-ID")} Pcs
                </p>
              </div>

              <div>
                <label className="mb-1.5 ml-1 block text-[10px] font-bold uppercase text-slate-400">
                  Jumlah yang Didistribusikan
                </label>
                <input
                  type="number"
                  min={1}
                  max={distributionTarget.jumlah}
                  required
                  value={distributionForm.quantity}
                  onChange={(event) =>
                    setDistributionForm({
                      quantity: event.target.value,
                    })
                  }
                  className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full rounded-2xl bg-emerald-600 py-5 font-bold text-white shadow-xl shadow-emerald-100 transition hover:bg-emerald-700 disabled:opacity-70"
              >
                {isSaving ? "MENYIMPAN DISTRIBUSI..." : "SIMPAN DISTRIBUSI"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-800 shadow-sm">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-base font-bold text-slate-800">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
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
  onEdit,
  onShip,
  onDelete,
  mode = "inventory",
}: {
  title?: string;
  subtitle?: string;
  items: InventoryItem[];
  onEdit: (item: InventoryItem) => void;
  onShip: (item: InventoryItem) => void;
  onDelete: (id: number) => void;
  mode?: "inventory" | "distribution";
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<ExpiryFilter>("all");
  const isReadOnly = mode === "distribution";

  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return items.filter((item) => {
      const label = getConditionLabel(item.expired);
      const metadata = getItemMetadata(item);
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [
          item.nama,
          item.id.toString(),
          metadata.kategori,
          metadata.batch,
          metadata.lokasi,
          item.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      if (!matchesQuery) {
        return false;
      }

      if (activeFilter === "all") {
        return true;
      }

      if (activeFilter === "critical") {
        return isCriticalStock(item.jumlah);
      }

      if (activeFilter === "expired") {
        return label.priority === 1;
      }

      if (activeFilter === "near") {
        return label.priority === 2;
      }

      return label.priority === 3;
    });
  }, [activeFilter, items, searchQuery]);

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

      <div className="border-b border-slate-100 bg-white px-4 py-4 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label className="relative block md:max-w-sm md:flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Cari nama, ID, kategori, batch, atau lokasi..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <label className="relative block md:w-64">
            <Filter className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value as ExpiryFilter)}
              className="w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            >
              <option value="all">Semua Barang</option>
              <option value="safe">Kondisi Aman</option>
              <option value="near">Mendekati Expired</option>
              <option value="expired">Sudah Expired</option>
              <option value="critical">Stok Kritis</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          Search aktif secara real-time. Filter `Stok Kritis` menampilkan barang dengan stok
          {` <= ${CRITICAL_STOCK_THRESHOLD} pcs.`}
        </p>
      </div>

      {filteredItems.length === 0 ? (
        <div className="p-12 text-center italic text-slate-400">
          {items.length === 0
            ? isReadOnly
              ? "Belum ada data distribusi."
              : "Belum ada data di gudang."
            : "Tidak ada barang yang cocok dengan pencarian atau filter."}
        </div>
      ) : (
        <>
          <div className="divide-y divide-slate-100 md:hidden">
            {filteredItems.map((item) => {
              const label = getConditionLabel(item.expired);
              const metadata = getItemMetadata(item);

              return (
                <article key={item.id} className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-700">{item.nama}</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        ID: {item.id} | {metadata.kategori} | {metadata.batch}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">{metadata.lokasi}</p>
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

                  {!isReadOnly ? (
                    <div className="flex gap-2">
                      {label.blocked ? (
                        <div className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-400">
                          <XCircle className="h-4 w-4" />
                          Tidak Layak Distribusi
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onShip(item)}
                          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-600 transition hover:bg-blue-600 hover:text-white"
                        >
                          <Send className="h-4 w-4" />
                          Distribusi
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onEdit(item)}
                        className="flex items-center justify-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-500 hover:text-white"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => onDelete(item.id)}
                        className="flex items-center justify-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-500 transition hover:bg-red-500 hover:text-white"
                      >
                        <Trash2 className="h-4 w-4" />
                        Hapus
                      </button>
                    </div>
                  ) : null}
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
                  {!isReadOnly && <th className="px-6 py-4 text-right">Tindakan</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const label = getConditionLabel(item.expired);
                  const metadata = getItemMetadata(item);

                  return (
                    <tr key={item.id} className="group transition hover:bg-slate-50">
                      <td className="px-6 py-5">
                        <p className="font-bold text-slate-700">{item.nama}</p>
                        <p className="text-[9px] text-slate-400">
                          ID: {item.id} | {metadata.kategori} | {metadata.batch}
                        </p>
                        <p className="text-[9px] text-slate-400">{metadata.lokasi}</p>
                      </td>

                      <td className="px-6 py-5">
                        <div className="mb-1 flex items-center gap-2">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              item.status === "Gudang" ? "bg-blue-500" : "bg-emerald-500"
                            }`}
                          />
                          <span className="text-xs font-bold text-slate-600">{item.status}</span>
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

                      {!isReadOnly && (
                        <td className="px-6 py-5 text-right">
                          <div className="flex justify-end gap-2 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                            {label.blocked ? (
                              <span className="inline-flex items-center rounded-xl bg-slate-100 px-3 text-[11px] font-semibold text-slate-400">
                                Tidak Layak Distribusi
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onShip(item)}
                                className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition hover:bg-blue-600 hover:text-white"
                                title="Kirim ke distribusi"
                              >
                                <Send className="h-4 w-4" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => onEdit(item)}
                              className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 transition hover:bg-amber-500 hover:text-white"
                              title="Edit barang"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>

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
                      )}
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

function ReportCard({
  title,
  description,
  onDownload,
}: {
  title: string;
  description: string;
  onDownload: () => void;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
        <Download className="h-5 w-5" />
      </div>
      <h3 className="mt-5 text-lg font-bold text-slate-800">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      <button
        type="button"
        onClick={onDownload}
        className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
      >
        <Download className="h-4 w-4" />
        Download CSV
      </button>
    </div>
  );
}

function InfoPill({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
        {title}
      </p>
      <p className="mt-3 text-sm font-semibold text-slate-700">{text}</p>
    </div>
  );
}
