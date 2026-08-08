"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

type ModalDisplayAreaProps = {
  activeId: string;
};

type DashboardCard = {
  id: string;
  title: string;
  count: string;
  iconSrc: string;
  accentClassName: string;
  iconBadgeClassName: string;
};

const dashboardCards: DashboardCard[] = [
  {
    id: "deliveryTomorrow",
    title: "明日の納品予定",
    count: "8件",
    iconSrc: "/icons/delivery.svg",
    accentClassName: "bg-[#F5A200]",
    iconBadgeClassName: "bg-[#FFF4DE]",
  },
  {
    id: "unfinished",
    title: "未完了作業",
    count: "3件",
    iconSrc: "/icons/work.svg",
    accentClassName: "bg-[#EAA21A]",
    iconBadgeClassName: "bg-[#FFF6E7]",
  },
  {
    id: "overdue",
    title: "納期超過",
    count: "1件",
    iconSrc: "/icons/overdue-warning.svg",
    accentClassName: "bg-[#F08E1D]",
    iconBadgeClassName: "bg-[#FFF1E2]",
  },
  {
    id: "ordersMonth",
    title: "今月受注件数",
    count: "126件",
    iconSrc: "/icons/order.svg",
    accentClassName: "bg-[#FFB347]",
    iconBadgeClassName: "bg-[#FFF4DF]",
  },
];

type ToothSetType = "permanent" | "deciduous";
type CustomerOption = {
  id: number;
  code: string;
  name: string;
};
type PatientOption = {
  id: number;
  customer_id: number;
  patient_name: string;
  patient_kana: string | null;
};
type InsuranceItemOption = {
  id: number;
  category: string;
  item_name: string;
};

const permanentRight = ["8", "7", "6", "5", "4", "3", "2", "1"];
const permanentLeft = ["1", "2", "3", "4", "5", "6", "7", "8"];
const deciduousRight = ["E", "D", "C", "B", "A"];
const deciduousLeft = ["A", "B", "C", "D", "E"];

function toFdiToothNumber(toothId: string) {
  const [jaw, side, tooth] = toothId.split("-");
  const isUpper = jaw === "上顎";
  const isRight = side === "R";

  if (/^[1-8]$/.test(tooth)) {
    const quadrant = isUpper ? (isRight ? 1 : 2) : isRight ? 4 : 3;
    return `${quadrant}${tooth}`;
  }

  const deciduousPosition = { A: 1, B: 2, C: 3, D: 4, E: 5 }[tooth];
  if (deciduousPosition) {
    const quadrant = isUpper ? (isRight ? 5 : 6) : isRight ? 8 : 7;
    return `${quadrant}${deciduousPosition}`;
  }

  return null;
}

type WorkRecord = {
  id: string;
  orderNo: string;
  clinic: string;
  patient: string;
  workType: string;
  deliveryDate: string;
  tooth: string;
  memo: string;
  completed: boolean;
};

function DashboardModal() {
  const handleCardClick = (card: DashboardCard) => {
    console.log(`[Dashboard] ${card.id} clicked`);
  };

  return (
    <section
      className="flex h-full min-h-[340px] w-full max-w-6xl flex-col overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white p-7 sm:p-9"
      aria-label="ダッシュボード"
    >
      <div className="h-[14px] w-full rounded-t-[20px] bg-[#F5A200]" aria-hidden="true" />

      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-1 h-10 w-[5px] rounded-full bg-[#F5A200]" aria-hidden="true" />
          <div>
            <h2 className="text-3xl font-bold text-[#222222]">ダッシュボード</h2>
            <p className="mt-2 text-sm text-[#666666]">現在の業務状況</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => console.log("[Dashboard] refresh clicked")}
          className="inline-flex items-center gap-2 rounded-xl border border-[#ECECEC] bg-white px-4 py-2 text-sm font-semibold text-[#444444] transition-colors duration-200 ease-[ease] hover:bg-[#FFF7E8]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
          <span>更新</span>
        </button>
      </div>

      <div className="mt-7 grid flex-1 grid-cols-1 gap-5 sm:grid-cols-2">
        {dashboardCards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => handleCardClick(card)}
            className="relative flex min-h-[120px] items-center justify-between overflow-hidden rounded-[16px] border border-[#E8E8E8] bg-white px-6 py-5 text-left transition-colors duration-200 ease-[ease]"
          >
            <span className={`absolute left-0 top-0 h-1 w-full ${card.accentClassName}`} aria-hidden="true" />

            <div className="flex min-w-0 items-center gap-5">
              <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full ${card.iconBadgeClassName}`} aria-hidden="true">
                <Image src={card.iconSrc} alt="" width={58} height={58} className="h-[58px] w-[58px]" />
              </span>

              <div className="min-w-0">
                <p className="truncate text-[1.2rem] font-bold text-[#222222]">{card.title}</p>
                <p className="mt-1 text-[2.5rem] font-extrabold leading-none text-black">{card.count}</p>
              </div>
            </div>

            <svg viewBox="0 0 24 24" className="ml-4 h-6 w-6 shrink-0 text-[#A7ABB2]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        ))}
      </div>

      <div className="mt-6 border-t border-[#ECECEC] pt-4">
        <p className="flex items-center justify-center gap-2 text-sm font-medium text-[#6E7480]">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6l4 2" />
          </svg>
          <span>最終更新</span>
          <span>2026/08/06 10:30</span>
        </p>
      </div>
    </section>
  );
}

function ToothRow({
  jawLabel,
  rightTeeth,
  leftTeeth,
  selectedTeeth,
  onToggle,
}: {
  jawLabel: string;
  rightTeeth: string[];
  leftTeeth: string[];
  selectedTeeth: Set<string>;
  onToggle: (toothId: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <p className="w-6 shrink-0 text-xs font-semibold text-[#444444]">{jawLabel}</p>
      <div className="grid flex-1 grid-cols-[12px_1fr_8px_1fr_12px] items-center gap-1">
        <span className="text-[10px] font-medium text-[#666666]">右</span>

        <div className="flex flex-nowrap gap-0.5">
          {rightTeeth.map((tooth) => {
            const id = `${jawLabel}-R-${tooth}`;
            const isSelected = selectedTeeth.has(id);

            return (
              <button
                key={id}
                type="button"
                onClick={() => onToggle(id)}
                className={`h-6 w-5 shrink-0 rounded-md border p-0 text-[10px] font-semibold transition-[background-color,border-color] duration-200 ease-[ease] ${
                  isSelected
                    ? "border-[#F5A200] bg-[#FFF4DE] text-[#A96E00]"
                    : "border-[#E5E5E5] bg-white text-[#444444]"
                }`}
              >
                {tooth}
              </button>
            );
          })}
        </div>

        <span className="text-[10px] text-[#C0C4CC]">|</span>

        <div className="flex flex-nowrap gap-0.5">
          {leftTeeth.map((tooth) => {
            const id = `${jawLabel}-L-${tooth}`;
            const isSelected = selectedTeeth.has(id);

            return (
              <button
                key={id}
                type="button"
                onClick={() => onToggle(id)}
                className={`h-6 w-5 shrink-0 rounded-md border p-0 text-[10px] font-semibold transition-[background-color,border-color] duration-200 ease-[ease] ${
                  isSelected
                    ? "border-[#F5A200] bg-[#FFF4DE] text-[#A96E00]"
                    : "border-[#E5E5E5] bg-white text-[#444444]"
                }`}
              >
                {tooth}
              </button>
            );
          })}
        </div>

        <span className="text-[10px] font-medium text-[#666666]">左</span>
      </div>
    </div>
  );
}

function OrderEntryModal() {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [isCustomersLoading, setIsCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState("");
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientId, setPatientId] = useState<number | null>(null);
  const [isPatientSelected, setIsPatientSelected] = useState(false);
  const [patientQuery, setPatientQuery] = useState("");
  const [insuranceItems, setInsuranceItems] = useState<InsuranceItemOption[]>([]);
  const [insuranceItemId, setInsuranceItemId] = useState<number | null>(null);
  const [isInsuranceItemsLoading, setIsInsuranceItemsLoading] = useState(true);
  const [insuranceItemsError, setInsuranceItemsError] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [toothType, setToothType] = useState<ToothSetType>("permanent");
  const [selectedTeeth, setSelectedTeeth] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfName, setPdfName] = useState("");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredPatients = patients.filter((patient) =>
    patient.patient_name.toLowerCase().includes(patientQuery.toLowerCase())
  );

  useEffect(() => {
    const controller = new AbortController();

    const loadCustomers = async () => {
      try {
        const response = await fetch("/api/customers", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to fetch customers");
        }

        const data: CustomerOption[] = await response.json();

        if (data.length === 0) {
          setCustomersError("歯科医院が登録されていません");
          return;
        }

        setCustomers(data);
        setCustomerId(data[0].id);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error(error);
        setCustomersError("歯科医院の取得に失敗しました");
      } finally {
        if (!controller.signal.aborted) {
          setIsCustomersLoading(false);
        }
      }
    };

    void loadCustomers();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const loadInsuranceItems = async () => {
      try {
        const response = await fetch("/api/insurance-items", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to fetch insurance items");
        }

        const data: InsuranceItemOption[] = await response.json();

        if (data.length === 0) {
          setInsuranceItemsError("作業内容が登録されていません");
          return;
        }

        setInsuranceItems(data);
        setInsuranceItemId(data[0].id);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error(error);
        setInsuranceItemsError("作業内容の取得に失敗しました");
      } finally {
        if (!controller.signal.aborted) {
          setIsInsuranceItemsLoading(false);
        }
      }
    };

    void loadInsuranceItems();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (customerId === null) {
      return;
    }

    const controller = new AbortController();

    const loadPatients = async () => {
      try {
        const response = await fetch(`/api/patients?customer_id=${customerId}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to fetch patients");
        }

        const data: PatientOption[] = await response.json();
        setPatients(data);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error(error);
      }
    };

    void loadPatients();

    return () => controller.abort();
  }, [customerId]);

  const toggleTooth = (toothId: string) => {
    setSelectedTeeth((prev) => {
      const next = new Set(prev);
      if (next.has(toothId)) {
        next.delete(toothId);
      } else {
        next.add(toothId);
      }
      return next;
    });
  };

  const handleFile = (file?: File) => {
    if (!file) {
      return;
    }
    if (file.type !== "application/pdf") {
      console.log("[Order] PDFのみ選択可能です");
      return;
    }

    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
    }

  setPdfFile(file);
    setPdfName(file.name);
    setPdfPreviewUrl(URL.createObjectURL(file));
  };

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
    };
  }, [pdfPreviewUrl]);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0];
    handleFile(file);
  };

  const submitOrder = async () => {
    if (customerId === null) {
      alert("歯科医院を選択してください");
      return;
    }

    if (patientId === null) {
      alert("患者を選択してください");
      return;
    }

    if (insuranceItemId === null) {
      alert("作業内容を選択してください");
      return;
    }

    console.log("submit!!");
    alert("submit!!");

    const formData = new FormData();
    formData.append("customer_id", String(customerId));
    formData.append("patient_id", String(patientId));
    formData.append("insurance_item_id", String(insuranceItemId));
    formData.append("order_date", new Date().toISOString());
    formData.append("delivery_date", deliveryDate || new Date().toISOString());
    formData.append("insurance_type", "保険");
    formData.append("remarks", note);

    Array.from(selectedTeeth)
      .map(toFdiToothNumber)
      .filter((toothNumber): toothNumber is string => toothNumber !== null)
      .forEach((toothNumber) => formData.append("tooth_numbers", toothNumber));

    if (pdfFile) {
      formData.append("pdf", pdfFile);
    }

    try {
      const response = await fetch("/orders", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Order registration failed");
      }

      alert("受注登録しました！");
    } catch (error) {
      console.error(error);
      alert("登録に失敗しました");
    }
  };

  const teethRight = toothType === "permanent" ? permanentRight : deciduousRight;
  const teethLeft = toothType === "permanent" ? permanentLeft : deciduousLeft;

  return (
    <section
      className="flex h-full min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white p-6"
      aria-label="受注入力"
    >
      <div className="h-[14px] w-full rounded-t-[20px] bg-[#F5A200]" aria-hidden="true" />

      <div className="mt-3 flex items-start gap-3">
        <span className="mt-1 h-10 w-[5px] rounded-full bg-[#F5A200]" aria-hidden="true" />
        <div>
          <h2 className="text-2xl font-bold text-[#222222]">受注入力</h2>
          <p className="mt-1 text-xs text-[#666666]">新しい受注を登録します</p>
        </div>
      </div>

      <form
        className="mt-4 flex min-h-0 flex-1 flex-col"
        action="/orders"
        method="post"
        onSubmit={(event) => {
          event.preventDefault();
          void submitOrder();
        }}
      >
        <div className="min-h-0 flex-1">
          <div className="flex h-full min-h-0 flex-col gap-1">
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-4">
            <div className="flex min-h-0 flex-col gap-1">
          <div className="flex h-10 items-center gap-3">
            <label className="shrink-0 text-xs font-semibold text-[#333333]">歯科医院</label>
            <div className="flex min-w-0 flex-1 gap-2">
              <select
                name="clinic"
                value={customerId ?? ""}
                onChange={(event) => {
                  setCustomerId(Number(event.target.value));
                  setPatients([]);
                  setPatientId(null);
                  setIsPatientSelected(false);
                  setPatientQuery("");
                }}
                disabled={isCustomersLoading || Boolean(customersError)}
                className={`h-10 w-full rounded-lg border bg-white px-3 text-sm font-medium outline-none transition-colors focus:border-[#F0B132] disabled:opacity-100 ${
                  customersError
                    ? "border-[#D75A4A] text-[#B42318]"
                    : "border-[#E2E2E2] text-[#333333]"
                }`}
              >
                {isCustomersLoading || customersError ? (
                  <option value="">
                    {isCustomersLoading ? "読み込み中..." : customersError}
                  </option>
                ) : null}
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => console.log("[Order] add clinic clicked")}
                className="h-10 w-10 shrink-0 rounded-lg border border-[#E2E2E2] bg-white text-lg font-semibold text-[#A06A00] transition-colors duration-200 ease-[ease] hover:bg-[#FFF5E5]"
                aria-label="歯科医院を追加"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex h-10 items-center gap-3">
            <label className="shrink-0 text-xs font-semibold text-[#333333]">作業内容</label>
            <select
              name="work_type"
              value={insuranceItemId ?? ""}
              onChange={(event) => setInsuranceItemId(Number(event.target.value))}
              disabled={isInsuranceItemsLoading || Boolean(insuranceItemsError)}
              className={`h-10 w-full rounded-lg border bg-white px-3 text-sm font-medium outline-none transition-colors focus:border-[#F0B132] disabled:opacity-100 ${
                insuranceItemsError
                  ? "border-[#D75A4A] text-[#B42318]"
                  : "border-[#E2E2E2] text-[#333333]"
              }`}
            >
              {isInsuranceItemsLoading || insuranceItemsError ? (
                <option value="">
                  {isInsuranceItemsLoading ? "読み込み中..." : insuranceItemsError}
                </option>
              ) : null}
              {insuranceItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.item_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex h-10 items-center gap-3">
              <label className="shrink-0 text-xs font-semibold text-[#333333]">納品予定日</label>
              <input
                type="date"
                name="delivery_date"
                value={deliveryDate}
                onChange={(event) => setDeliveryDate(event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border border-[#E2E2E2] bg-white px-3 text-sm font-medium text-[#333333] outline-none transition-colors focus:border-[#F0B132]"
              />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-1 rounded-[14px] border border-[#E7E7E7] bg-white p-2">
            <div className="flex items-center justify-between gap-4">
              <label className="text-xs font-semibold text-[#333333]">歯番</label>
              <div className="flex gap-4">
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#444444]">
                <input
                  type="radio"
                  name="toothType"
                  checked={toothType === "permanent"}
                  onChange={() => setToothType("permanent")}
                  className="h-3.5 w-3.5 accent-[#F5A200]"
                />
                永久歯
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#444444]">
                <input
                  type="radio"
                  name="toothType"
                  checked={toothType === "deciduous"}
                  onChange={() => setToothType("deciduous")}
                  className="h-3.5 w-3.5 accent-[#F5A200]"
                />
                乳歯
              </label>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col justify-evenly rounded-lg border border-[#EFEFEF] bg-[#FCFCFC] px-1 py-1.5">
              <ToothRow
                jawLabel="上顎"
                rightTeeth={teethRight}
                leftTeeth={teethLeft}
                selectedTeeth={selectedTeeth}
                onToggle={toggleTooth}
              />
              <div className="border-t border-[#E8E8E8]" />
              <ToothRow
                jawLabel="下顎"
                rightTeeth={teethRight}
                leftTeeth={teethLeft}
                selectedTeeth={selectedTeeth}
                onToggle={toggleTooth}
              />
            </div>
          </div>
            </div>

            <div className="flex min-h-0 flex-col gap-1">
          <div className="flex h-10 items-center gap-3">
            <label className="shrink-0 text-xs font-semibold text-[#333333]">患者名</label>
            <div className="flex min-w-0 flex-1 gap-2">
              <div className="relative w-full">
                <input
                  name="patient_name"
                  value={patientQuery}
                  onChange={(event) => {
                    setPatientQuery(event.target.value);
                    setPatientId(null);
                    setIsPatientSelected(false);
                  }}
                  placeholder="患者名を入力して検索"
                  className="h-10 w-full rounded-lg border border-[#E2E2E2] bg-white px-3 text-sm font-medium text-[#333333] outline-none transition-colors focus:border-[#F0B132]"
                />

                {patientQuery && !isPatientSelected && filteredPatients.length > 0 ? (
                  <div className="absolute z-30 mt-1 w-full rounded-xl border border-[#ECECEC] bg-white p-1">
                    {filteredPatients.map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => {
                          setPatientQuery(patient.patient_name);
                          setPatientId(patient.id);
                          setIsPatientSelected(true);
                        }}
                        className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[#333333] hover:bg-[#FFF8EA]"
                      >
                        {patient.patient_name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => console.log("[Order] add patient clicked")}
                className="h-10 w-10 shrink-0 rounded-lg border border-[#E2E2E2] bg-white text-lg font-semibold text-[#A06A00] transition-colors duration-200 ease-[ease] hover:bg-[#FFF5E5]"
                aria-label="患者を追加"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col space-y-1.5">
            <label className="text-xs font-semibold text-[#333333]">指示書（PDF）</label>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragActive(true);
              }}
              onDragLeave={() => setIsDragActive(false)}
              onDrop={handleDrop}
              className={`flex min-h-[76px] flex-1 items-center rounded-[12px] border-2 border-dashed p-2 transition-colors ${
                isDragActive ? "border-[#F5A200] bg-[#FFF8EA]" : "border-[#E3E3E3] bg-[#FCFCFC]"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />

              <div className="flex w-full items-center justify-center gap-3 text-center">
                <p className="text-sm font-medium text-[#555555]">PDFをドラッグ＆ドロップ</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-md border border-[#E1E1E1] bg-white px-3 py-1.5 text-xs font-semibold text-[#444444] transition-colors duration-200 ease-[ease] hover:bg-[#FFF7E8]"
                >
                  ファイル選択
                </button>

                {pdfPreviewUrl ? (
                  <button
                    type="button"
                    onClick={() => window.open(pdfPreviewUrl, "_blank", "noopener,noreferrer")}
                    className="mt-1 flex w-full items-center justify-center gap-3 rounded-lg border border-[#E8E8E8] bg-white p-2 text-left transition-colors duration-200 ease-[ease] hover:bg-[#FFF8EA]"
                    aria-label="アップロードしたPDFを拡大表示"
                  >
                    <iframe
                      title="PDFサムネイル"
                      src={`${pdfPreviewUrl}#toolbar=0&navpanes=0&scrollbar=0&page=1&view=FitH`}
                      className="h-20 w-16 rounded border border-[#E2E2E2]"
                    />
                    <p className="max-w-[260px] truncate text-xs text-[#666666]">{pdfName}</p>
                  </button>
                ) : null}
              </div>
            </div>
          </div>

            </div>
          </div>

          <div className="shrink-0 space-y-0.5">
            <label className="text-xs font-semibold text-[#333333]">備考</label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={1}
              className="h-10 w-full resize-none rounded-[12px] border border-[#E2E2E2] bg-white px-3 py-2 text-sm text-[#333333] outline-none transition-colors focus:border-[#F0B132]"
              placeholder="備考を入力してください"
            />
          </div>
        </div>
        </div>

        <div className="mt-3 flex shrink-0 items-center justify-end gap-2 border-t border-[#ECECEC] bg-white pt-3">
          <input type="hidden" name="customer_id" value={customerId ?? ""} />
          <input type="hidden" name="patient_id" value={patientId ?? ""} />
          <input type="hidden" name="insurance_item_id" value={insuranceItemId ?? ""} />
          <input type="hidden" name="insurance_type" value="保険" />
          <button
            type="button"
            onClick={() => console.log("[Order] cancel clicked")}
            className="rounded-lg border border-[#E1E1E1] bg-white px-5 py-2 text-sm font-semibold text-[#444444] transition-colors duration-200 ease-[ease] hover:bg-[#F8F8F8]"
          >
            キャンセル
          </button>

          <button
            type="submit"
            className="rounded-lg bg-[#F5A200] px-6 py-2 text-sm font-bold text-white transition-colors duration-200 ease-[ease] hover:bg-[#E09700]"
          >
            受注登録
          </button>
        </div>
      </form>
    </section>
  );
}

function WorkInputModal() {
  const [records, setRecords] = useState<WorkRecord[]>([
    {
      id: "w-001",
      orderNo: "ORD-20260807-001",
      clinic: "町田歯科医院",
      patient: "山田 太郎",
      workType: "クラウン",
      deliveryDate: "2026/08/07",
      tooth: "上顎 右 6",
      memo: "咬合面の調整を優先。色調A2指定。",
      completed: false,
    },
    {
      id: "w-002",
      orderNo: "ORD-20260807-002",
      clinic: "町田歯科医院",
      patient: "鈴木 花子",
      workType: "インレー",
      deliveryDate: "2026/08/07",
      tooth: "下顎 左 5",
      memo: "適合確認後に研磨。",
      completed: false,
    },
    {
      id: "w-003",
      orderNo: "ORD-20260807-003",
      clinic: "中央デンタルクリニック",
      patient: "田中 一郎",
      workType: "前装冠",
      deliveryDate: "2026/08/08",
      tooth: "上顎 左 1",
      memo: "形態は既存歯に合わせる。",
      completed: false,
    },
  ]);
  const [selectedId, setSelectedId] = useState("w-001");

  const dummyPdfUrl = useMemo(() => {
    const pdfSource = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 65 >>\nstream\nBT\n/F1 18 Tf\n24 120 Td\n(Work Instruction PDF) Tj\nET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000061 00000 n \n0000000118 00000 n \n0000000274 00000 n \n0000000390 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n460\n%%EOF`;
    const blob = new Blob([pdfSource], { type: "application/pdf" });
    return URL.createObjectURL(blob);
  }, []);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(dummyPdfUrl);
    };
  }, [dummyPdfUrl]);

  const selectedRecord = records.find((record) => record.id === selectedId) ?? records[0];

  const groupedRecords = records.reduce<Record<string, WorkRecord[]>>((acc, record) => {
    if (!acc[record.clinic]) {
      acc[record.clinic] = [];
    }
    acc[record.clinic].push(record);
    return acc;
  }, {});

  const handleFinish = () => {
    setRecords((prev) =>
      prev.map((record) =>
        record.id === selectedId ? { ...record, completed: true } : record
      )
    );
    console.log(`[Work] finish clicked: ${selectedId}`);
  };

  const handleCancel = () => {
    setRecords((prev) =>
      prev.map((record) =>
        record.id === selectedId && record.completed
          ? { ...record, completed: false }
          : record
      )
    );
    console.log(`[Work] revert to in-progress: ${selectedId}`);
  };

  return (
    <section
      className="flex h-full min-h-[340px] w-full max-w-6xl flex-col overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white p-6"
      aria-label="作業時入力"
    >
      <div className="h-[14px] w-full rounded-t-[20px] bg-[#F5A200]" aria-hidden="true" />

      <div className="mt-3 flex items-start gap-3">
        <span className="mt-1 h-10 w-[5px] rounded-full bg-[#F5A200]" aria-hidden="true" />
        <div>
          <h2 className="text-2xl font-bold text-[#222222]">作業時入力</h2>
          <p className="mt-1 text-xs text-[#666666]">本日の作業を管理します</p>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex min-h-0 flex-[3] rounded-[16px] border border-[#E8E8E8] bg-white p-3 pb-4">
          {selectedRecord ? (
            <div className="flex w-full flex-col justify-between">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <p><span className="font-semibold text-[#555555]">受注No:</span> <span className="text-[#222222]">{selectedRecord.orderNo}</span></p>
                <p><span className="font-semibold text-[#555555]">歯科医院:</span> <span className="text-[#222222]">{selectedRecord.clinic}</span></p>
                <p><span className="font-semibold text-[#555555]">患者名:</span> <span className="text-[#222222]">{selectedRecord.patient}</span></p>
                <p><span className="font-semibold text-[#555555]">作業内容:</span> <span className="text-[#222222]">{selectedRecord.workType}</span></p>
                <p><span className="font-semibold text-[#555555]">納品予定日:</span> <span className="text-[#222222]">{selectedRecord.deliveryDate}</span></p>
                <p><span className="font-semibold text-[#555555]">歯番:</span> <span className="text-[#222222]">{selectedRecord.tooth}</span></p>
              </div>

              <div className="mt-2 grid grid-cols-[110px_1fr] gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (dummyPdfUrl) {
                      window.open(dummyPdfUrl, "_blank", "noopener,noreferrer");
                    } else {
                      console.log("[Work] PDF preview not ready");
                    }
                  }}
                  className="rounded-lg border border-[#E2E2E2] bg-[#FCFCFC] p-1 transition-colors duration-200 ease-[ease] hover:bg-[#FFF8EA]"
                  aria-label="指示書PDFを表示"
                >
                  {dummyPdfUrl ? (
                    <iframe
                      title="作業指示書サムネイル"
                      src={`${dummyPdfUrl}#toolbar=0&navpanes=0&scrollbar=0&page=1&view=FitH`}
                      className="h-20 w-full rounded border border-[#E2E2E2]"
                    />
                  ) : (
                    <div className="flex h-20 items-center justify-center text-xs text-[#888888]">PDF</div>
                  )}
                </button>

                <div>
                  <p className="text-xs font-semibold text-[#555555]">作業メモ</p>
                  <p className="mt-1 rounded-lg border border-[#EFEFEF] bg-[#FCFCFC] px-3 py-1.5 text-sm text-[#333333]">
                    {selectedRecord.memo}
                  </p>
                </div>
              </div>

              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={!selectedRecord?.completed}
                  className="rounded-lg border border-[#E1E1E1] bg-white px-5 py-2 text-sm font-semibold text-[#444444] transition-colors duration-200 ease-[ease] hover:bg-[#F8F8F8] disabled:cursor-not-allowed disabled:bg-[#F6F6F6] disabled:text-[#A5A5A5]"
                >
                  作業中に戻す
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  className="rounded-lg bg-[#F5A200] px-5 py-2 text-sm font-bold text-white transition-colors duration-200 ease-[ease] hover:bg-[#E09700]"
                >
                  作業終了
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-[2] rounded-[16px] border border-[#E8E8E8] bg-white p-4">
          <div className="w-full">
            <p className="text-sm font-semibold text-[#333333]">本日の作業一覧</p>

            <div className="mt-3 space-y-3 text-sm">
              {Object.entries(groupedRecords).map(([clinicName, clinicRecords]) => (
                <div key={clinicName} className="rounded-lg border border-[#EEEEEE] bg-[#FCFCFC]">
                  <div className="border-b border-[#ECECEC] px-3 py-2 text-xs font-bold text-[#555555]">
                    【{clinicName}】
                  </div>

                  <div>
                    {clinicRecords.map((record) => {
                      const isSelected = record.id === selectedId;
                      return (
                        <button
                          key={record.id}
                          type="button"
                          onClick={() => setSelectedId(record.id)}
                          className={`grid w-full grid-cols-[1fr_1fr_1fr_auto] items-center gap-3 border-b border-[#EFEFEF] px-3 py-2 text-left last:border-b-0 transition-colors duration-150 ease-[ease] ${
                            isSelected ? "bg-[#FFF8EA]" : "bg-transparent hover:bg-[#FFFDF7]"
                          } ${record.completed ? "text-[#9AA0AA]" : "text-[#2A2A2A]"}`}
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            {record.completed ? (
                              <svg
                                viewBox="0 0 24 24"
                                className="h-4 w-4 shrink-0 text-[#7E8591]"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <circle cx="12" cy="12" r="9" />
                                <path d="m8.5 12 2.3 2.3 4.7-4.8" />
                              </svg>
                            ) : null}
                            <span className="truncate">{record.patient}</span>
                          </span>
                          <span className="truncate">{record.workType}</span>
                          <span className="truncate">{record.deliveryDate}</span>
                          {record.completed ? (
                            <span className="inline-flex items-center text-xs font-semibold text-[#7E8591]">
                              完了
                            </span>
                          ) : (
                            <span className="text-xs text-[#666666]">作業中</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ModalDisplayArea({ activeId }: ModalDisplayAreaProps) {
  if (activeId === "order") {
    return <OrderEntryModal />;
  }

  if (activeId === "work") {
    return <WorkInputModal />;
  }

  return <DashboardModal />;
}
