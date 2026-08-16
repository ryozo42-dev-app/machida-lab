"use client";

import { useEffect, useState } from "react";
import ClinicModal from "./ClinicModal";

type ManagementMenu = {
  id: string;
  title: string;
  description: string;
};

type Clinic = {
  id: number;
  code: string;
  name: string;
};

const managementMenus: ManagementMenu[] = [
  {
    id: "clinic",
    title: "歯科医院マスター",
    description: "歯科医院の登録・編集",
  },
  {
    id: "patient",
    title: "患者マスター",
    description: "患者情報の登録・編集",
  },
  {
    id: "user",
    title: "ユーザーマスター",
    description: "ユーザー・権限の管理",
  },
  {
    id: "supplier",
    title: "仕入れマスター",
    description: "仕入れ先・仕入れ情報の管理",
  },
  {
    id: "material",
    title: "材料管理",
    description: "材料・医院別預かり材の管理",
  },
];

export default function ManagementModal() {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const [customers, setCustomers] = useState<Clinic[]>([]);
  const [isCustomersLoading, setIsCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState("");

  const [clinicModalMode, setClinicModalMode] = useState<
    "create" | "edit" | null
  >(null);

  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);

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
    setSelectedClinic(null);
    setClinicModalMode("create");
  };

  const openEditClinicModal = (clinic: Clinic) => {
    setSelectedClinic(clinic);
    setClinicModalMode("edit");
  };

  const closeClinicModal = () => {
    setClinicModalMode(null);
    setSelectedClinic(null);
  };

  const handleClinicSave = (data: { name: string; code: string }) => {
    console.log("[Clinic] save", {
      mode: clinicModalMode,
      clinicId: selectedClinic?.id ?? null,
      name: data.name,
      code: data.code,
    });

    closeClinicModal();
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
            onClose={closeClinicModal}
            onSave={handleClinicSave}
          />
        ) : null}
      </>
    );
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
        {managementMenus.map((menu) => (
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