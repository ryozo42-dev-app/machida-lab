"use client";

import { useEffect, useState } from "react";
import ClinicModal from "./ClinicModal";
import DocumentManagementPanel from "./DocumentManagementPanel";
import UserManagementPanel from "./UserManagementPanel";

type ManagementMenu = {
  id: string;
  title: string;
  description: string;
};

type CurrentUser = {
  role: string | null;
};

type Clinic = {
  id: number;
  code: string;
  name: string;
  billing_closing_day: number | null;
  billing_closing_month_end: boolean;
  billing_issue_day: number | null;
  billing_issue_month_end: boolean;
  show_material_on_delivery: boolean;
};

const managementMenus: ManagementMenu[] = [
  {
    id: "clinic",
    title: "歯科医院マスター",
    description: "歯科医院の登録・編集",
  },
  {
    id: "user",
    title: "ユーザーマスター",
    description: "ユーザー・権限の管理",
  },
  {
    id: "documents",
    title: "帳票管理",
    description: "納品書・請求書の検索・閲覧",
  },
];

export default function ManagementModal() {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  const [customers, setCustomers] = useState<Clinic[]>([]);
  const [isCustomersLoading, setIsCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState("");

  const [clinicModalMode, setClinicModalMode] = useState<
    "create" | "edit" | null
  >(null);
  const [clinicModalError, setClinicModalError] = useState("");

  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadCurrentUser = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          signal: controller.signal,
        });

        if (!response.ok) {
          setCurrentUserRole(null);
          return;
        }

        const data = (await response.json()) as { user?: CurrentUser };
        setCurrentUserRole(data.user?.role ?? null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("Failed to load current user", error);
        setCurrentUserRole(null);
      }
    };

    void loadCurrentUser();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (activeMenu !== "clinic") {
      return;
    }

    const controller = new AbortController();

    const loadCustomers = async () => {
      setIsCustomersLoading(true);
      setCustomersError("");

      try {
        const response = await fetch("/api/customers", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to fetch customers");
        }

        const data = (await response.json()) as Clinic[];
        setCustomers(data);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("Failed to load customers", error);
        setCustomersError("歯科医院の読み込みに失敗しました");
      } finally {
        setIsCustomersLoading(false);
      }
    };

    void loadCustomers();

    return () => controller.abort();
  }, [activeMenu]);

  const openCreateClinicModal = () => {
    setClinicModalError("");
    setSelectedClinic(null);
    setClinicModalMode("create");
  };

  const openEditClinicModal = (clinic: Clinic) => {
    setClinicModalError("");
    setSelectedClinic(clinic);
    setClinicModalMode("edit");
  };

  const closeClinicModal = () => {
    setClinicModalError("");
    setClinicModalMode(null);
    setSelectedClinic(null);
  };

  const handleClinicSave = async (data: {
    name: string;
    code: string;
    billing_closing_day: number | null;
    billing_closing_month_end: boolean;
    billing_issue_day: number | null;
    billing_issue_month_end: boolean;
    show_material_on_delivery: boolean;
  }) => {
    try {
      setClinicModalError("");
      const isEdit = clinicModalMode === "edit" && selectedClinic;
      const url = isEdit
        ? `/api/customers/${selectedClinic.id}`
        : "/api/customers";
      const method = isEdit ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to save customer");
      }

      const customersResponse = await fetch("/api/customers");
      if (!customersResponse.ok) {
        throw new Error("Failed to reload customers");
      }

      const customersData = (await customersResponse.json()) as Clinic[];
      setCustomers(customersData);
      setCustomersError("");
      closeClinicModal();
    } catch (error) {
      console.error("Failed to save customer", error);
      const message =
        error instanceof Error
          ? error.message
          : "歯科医院の保存に失敗しました";
      setClinicModalError(message);
      setCustomersError(
        message
      );
    }
  };

  if (activeMenu === "clinic") {
    return (
      <>
        <section
          className="flex h-full min-h-[340px] w-full max-w-6xl flex-col overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white p-6"
          aria-label="歯科医院マスター"
        >
          <div
            className="h-[14px] w-full rounded-t-[20px] bg-[#fff362]"
            aria-hidden="true"
          />

          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                className="mt-1 h-10 w-[5px] rounded-full bg-[#fff362]"
                aria-hidden="true"
              />

              <div>
                <h2 className="text-2xl font-bold text-[#222222]">
                  歯科医院マスター
                </h2>

                <p className="mt-1 text-xs text-[#666666]">
                  歯科医院の登録・編集を行います
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={openCreateClinicModal}
              className="shrink-0 rounded-lg bg-[#fff362] px-5 py-2.5 text-sm font-bold text-[#222222] transition-colors hover:bg-[#fff362]"
            >
              ＋ 新規登録
            </button>
          </div>

          <div className="mt-5 grid flex-1 grid-cols-3 gap-4 overflow-auto rounded-[16px] border border-[#E8E8E8] bg-[#FCFCFC] p-4">
            {isCustomersLoading ? (
              <div className="col-span-3 flex min-h-[180px] items-center justify-center">
                <p className="text-sm text-[#666666]">読み込み中...</p>
              </div>
            ) : customersError ? (
              <div className="col-span-3 flex min-h-[180px] items-center justify-center">
                <p className="text-sm font-medium text-[#B42318]">
                  {customersError}
                </p>
              </div>
            ) : customers.length === 0 ? (
              <div className="col-span-3 flex min-h-[180px] items-center justify-center">
                <p className="text-sm text-[#666666]">
                  歯科医院が登録されていません
                </p>
              </div>
            ) : (
              customers.map((customer) => (
                <div
                  key={customer.id}
                  className="flex min-h-[92px] items-center justify-between rounded-[16px] border border-[#E8E8E8] bg-white px-4 py-4"
                >
                  <span className="min-w-0 pr-3 font-semibold text-[#222222]">
                    {customer.name}
                  </span>

                  <button
                    type="button"
                    onClick={() => openEditClinicModal(customer)}
                    className="shrink-0 rounded-lg border border-[#E1E1E1] bg-white px-3 py-1.5 text-xs font-semibold text-[#555555] transition-colors hover:bg-[#FFF8EA]"
                  >
                    編集
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 flex justify-end border-t border-[#ECECEC] pt-3">
            <button
              type="button"
              onClick={() => setActiveMenu(null)}
              className="rounded-lg border border-[#fff362] bg-[#fff362] px-5 py-2 text-sm font-semibold text-[#222222] hover:bg-[#fff362]"
            >
              管理メニューに戻る
            </button>
          </div>
        </section>

        {clinicModalMode !== null ? (
          <ClinicModal
            mode={clinicModalMode}
            customer={selectedClinic}
            error={clinicModalError}
            onClose={closeClinicModal}
            onSave={handleClinicSave}
          />
        ) : null}
      </>
    );
  }

  if (activeMenu === "documents") {
    return (
      <DocumentManagementPanel onBack={() => setActiveMenu(null)} />
    );
  }

  if (activeMenu === "user") {
    return <UserManagementPanel onBack={() => setActiveMenu(null)} />;
  }

  return (
    <section
      className="flex h-full min-h-[340px] w-full max-w-6xl flex-col overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white p-6"
      aria-label="管理"
    >
      <div
        className="h-[14px] w-full rounded-t-[20px] bg-[#fff362]"
        aria-hidden="true"
      />

      <div className="mt-3 flex items-start gap-3">
        <span
          className="mt-1 h-10 w-[5px] rounded-full bg-[#fff362]"
          aria-hidden="true"
        />

        <div>
          <h2 className="text-2xl font-bold text-[#222222]">管理</h2>

          <p className="mt-1 text-xs text-[#666666]">
            マスター・各種管理を行います
          </p>
        </div>
      </div>

      <div className="mt-5 grid min-h-0 flex-1 grid-cols-2 gap-4">
        {managementMenus
          .filter((menu) => menu.id !== "user" || currentUserRole === "admin")
          .map((menu) => (
          <button
            key={menu.id}
            type="button"
            onClick={() => setActiveMenu(menu.id)}
            className="flex min-h-[105px] items-center justify-between rounded-[16px] border border-[#E8E8E8] bg-white px-5 py-4 text-left transition-colors duration-200 hover:bg-[#FAFAFA]"
          >
            <div className="min-w-0">
              <p className="text-base font-bold text-[#222222]">
                {menu.title}
              </p>

              <p className="mt-1 text-xs text-[#777777]">
                {menu.description}
              </p>
            </div>

            <span
              className="ml-4 shrink-0 text-xl text-[#A7A7A7]"
              aria-hidden="true"
            >
              ›
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
