"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import ManagementModal from "./management/ManagementModal";

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

type WorkItemType = "insurance" | "private";

type WorkItemOption = {
  id: number;
  item_name: string;
  type: WorkItemType;
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
  id: number;
  orderNo: string;
  customerId: number;
  clinic: string;
  patient: string;
  workType: string;
  deliveryDate: string;
  tooth: string;
  memo: string;
  workStatus: "pending" | "in_progress" | "completed";
  completed: boolean;
  pdfUrl: string | null;
};

type DeliveryCandidate = {
  order_item_id: number;
  order_id: number;
  order_no: string;
  customer_id: number;
  customer_name: string;
  patient_id: number;
  patient_name: string;
  work_type_name: string;
  tooth_numbers: string[];
  delivery_date: string | null;
  quantity: number;
  unit_price_preview: string | null;
  amount_preview: string | null;
  remarks: string;
  work_status: string;
  billed: boolean;
};

type ConfirmedDeliveryItem = {
  order_item_id: number;
  patient_name: string;
  order_no: string;
  work_type_name: string;
  tooth_numbers: string[];
  quantity: number;
  unit_price: string | null;
  amount: string | null;
};

type ConfirmedDelivery = {
  id: number;
  delivery_no: string;
  customer_name: string;
  delivery_date: string;
  total_amount: string | null;
  items: ConfirmedDeliveryItem[];
};

function getTodayJstString() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function formatYen(value: string | null) {
  if (value === null) {
    return "-";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return value;
  }

  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(number);
}

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
              <div className="mb-2 flex items-start gap-3">
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
  const [patientKana, setPatientKana] = useState("");
  const [isPatientCreating, setIsPatientCreating] = useState(false);
  const [workItemType, setWorkItemType] = useState<WorkItemType>("insurance");
  const [workItemQuery, setWorkItemQuery] = useState("");
  const [workItemCandidates, setWorkItemCandidates] = useState<WorkItemOption[]>([]);
  const [selectedWorkItem, setSelectedWorkItem] = useState<WorkItemOption | null>(null);
  const [isWorkItemLoading, setIsWorkItemLoading] = useState(false);
  const [workItemError, setWorkItemError] = useState("");
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
    const keyword = workItemQuery.trim();

    if (
      customerId === null ||
      keyword.length === 0 ||
      selectedWorkItem?.item_name === workItemQuery
    ) {
      return;
    }

    const controller = new AbortController();
    const timerId = setTimeout(() => {
      const loadWorkItems = async () => {
        try {
          setIsWorkItemLoading(true);
          setWorkItemError("");

          const params = new URLSearchParams({
            customer_id: String(customerId),
            type: workItemType,
            q: keyword,
          });
          const response = await fetch(`/api/work-items?${params.toString()}`, {
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error("Failed to fetch work items");
          }

          const data: WorkItemOption[] = await response.json();
          setWorkItemCandidates(data);
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }

          console.error(error);
          setWorkItemCandidates([]);
          setWorkItemError("作業内容の検索に失敗しました");
        } finally {
          if (!controller.signal.aborted) {
            setIsWorkItemLoading(false);
          }
        }
      };

      void loadWorkItems();
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timerId);
      setIsWorkItemLoading(false);
    };
  }, [customerId, selectedWorkItem, workItemQuery, workItemType]);

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

    if (selectedWorkItem === null) {
      alert("作業内容を選択してください");
      return;
    }

    console.log("submit!!");
    alert("submit!!");

    const formData = new FormData();
    formData.append("customer_id", String(customerId));
    formData.append("patient_id", String(patientId));
    if (selectedWorkItem.type === "insurance") {
      formData.append("insurance_item_id", String(selectedWorkItem.id));
    } else {
      formData.append("private_item_id", String(selectedWorkItem.id));
    }
    formData.append("quantity", "1");
    formData.append("order_date", new Date().toISOString());
    formData.append("delivery_date", deliveryDate || new Date().toISOString());
    formData.append("insurance_type", selectedWorkItem.type === "insurance" ? "保険" : "自費");
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

  const createPatient = async () => {
    if (isPatientCreating) {
      return;
    }

    if (customerId === null) {
      alert("歯科医院を選択してください");
      return;
    }

    const nextPatientName = patientQuery.trim();

    if (nextPatientName.length === 0) {
      alert("患者名を入力してください");
      return;
    }

    setIsPatientCreating(true);

    try {
      const response = await fetch("/api/patients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer_id: customerId,
          patient_name: nextPatientName,
          patient_kana: patientKana.trim() || null,
        }),
      });

      if (!response.ok) {
        let errorMessage = "患者追加に失敗しました";

        try {
          const errorBody = (await response.json()) as { error?: string };
          if (errorBody.error) {
            errorMessage = errorBody.error;
          }
        } catch {
          // ignore invalid error response
        }

        throw new Error(errorMessage);
      }

      const createdPatient = (await response.json()) as PatientOption;

      setPatients((currentPatients) => {
        const mergedPatients = [
          ...currentPatients.filter((patient) => patient.id !== createdPatient.id),
          createdPatient,
        ];

        mergedPatients.sort((a, b) => a.patient_name.localeCompare(b.patient_name, "ja"));
        return mergedPatients;
      });
      setPatientId(createdPatient.id);
      setPatientQuery(createdPatient.patient_name);
      setPatientKana(createdPatient.patient_kana ?? "");
      setIsPatientSelected(true);

      alert("患者を追加しました");
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "患者追加に失敗しました");
    } finally {
      setIsPatientCreating(false);
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
            <div className="mt-1 flex h-10 items-center gap-3">
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
                  setPatientKana("");
                  setSelectedWorkItem(null);
                  setWorkItemQuery("");
                  setWorkItemCandidates([]);
                  setWorkItemError("");
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

          <div className="flex items-start gap-3">
            <label className="shrink-0 pt-2 text-xs font-semibold text-[#333333]">作業内容</label>
              <div className="w-full flex flex-col gap-1">
              <div className="flex h-10 items-center gap-5 rounded-lg border border-[#E2E2E2] bg-white px-3">
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#444444]">
                  <input
                    type="radio"
                    name="work_item_type"
                    checked={workItemType === "insurance"}
                    onChange={() => {
                      setWorkItemType("insurance");
                      setSelectedWorkItem(null);
                      setWorkItemCandidates([]);
                      setWorkItemError("");
                    }}
                    className="h-3.5 w-3.5 accent-[#F5A200]"
                  />
                  保険
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#444444]">
                  <input
                    type="radio"
                    name="work_item_type"
                    checked={workItemType === "private"}
                    onChange={() => {
                      setWorkItemType("private");
                      setSelectedWorkItem(null);
                      setWorkItemCandidates([]);
                      setWorkItemError("");
                    }}
                    className="h-3.5 w-3.5 accent-[#F5A200]"
                  />
                  自費
                </label>
              </div>

              <input
                name="work_item_query"
                value={workItemQuery}
                onChange={(event) => {
                  setWorkItemQuery(event.target.value);
                  setSelectedWorkItem(null);
                  setWorkItemError("");
                }}
                disabled={customerId === null}
                placeholder={customerId === null ? "歯科医院を先に選択してください" : "作業内容を入力"}
                className="mt-2 h-10 w-full rounded-lg border border-[#E2E2E2] bg-white px-3 text-sm font-medium text-[#333333] outline-none transition-colors focus:border-[#F0B132] disabled:bg-[#FAFAFA] disabled:text-[#999999]"
              />

              {workItemError ? (
                <p className="mt-1 text-xs font-medium text-[#B42318]">{workItemError}</p>
              ) : null}

              {customerId !== null && workItemQuery.trim().length > 0 && !selectedWorkItem ? (
                <div className="mt-1 max-h-[72px] w-full overflow-y-auto rounded-xl border border-[#ECECEC] bg-white p-1">
                  {isWorkItemLoading ? (
                    <p className="px-3 py-1.5 text-xs text-[#666666]">検索中...</p>
                  ) : workItemCandidates.length > 0 ? (
                    workItemCandidates.map((item) => (
                      <button
                        key={`${item.type}-${item.id}`}
                        type="button"
                        onClick={() => {
                          setSelectedWorkItem(item);
                          setWorkItemQuery(item.item_name);
                          setWorkItemCandidates([]);
                        }}
                        className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[#333333] hover:bg-[#FFF8EA]"
                      >
                        {item.item_name}
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-1.5 text-xs text-[#666666]">候補が見つかりません</p>
                  )}
                </div>
              ) : null}
            </div>
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
              <label className="text-xs font-semibold text-[#333333]">歯式</label>
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
                          setPatientKana(patient.patient_kana ?? "");
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
                onClick={() => {
                  void createPatient();
                }}
                disabled={isPatientCreating}
                className="h-10 w-10 shrink-0 rounded-lg border border-[#E2E2E2] bg-white text-lg font-semibold text-[#A06A00] transition-colors duration-200 ease-[ease] hover:bg-[#FFF5E5] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="患者を追加"
              >
                {isPatientCreating ? "..." : "+"}
              </button>
            </div>
          </div>

          <div className="flex h-10 items-center gap-3">
            <label className="shrink-0 text-xs font-semibold text-[#333333]">患者カナ</label>
            <input
              name="patient_kana"
              value={patientKana}
              onChange={(event) => setPatientKana(event.target.value)}
              placeholder="患者カナを入力（任意）"
              className="h-10 min-w-0 flex-1 rounded-lg border border-[#E2E2E2] bg-white px-3 text-sm font-medium text-[#333333] outline-none transition-colors focus:border-[#F0B132]"
            />
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
          <input
            type="hidden"
            name="insurance_item_id"
            value={selectedWorkItem?.type === "insurance" ? String(selectedWorkItem.id) : ""}
          />
          <input
            type="hidden"
            name="private_item_id"
            value={selectedWorkItem?.type === "private" ? String(selectedWorkItem.id) : ""}
          />
          <input
            type="hidden"
            name="insurance_type"
            value={selectedWorkItem?.type === "private" ? "自費" : "保険"}
          />
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
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedClinics, setExpandedClinics] = useState<Set<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();

    const loadWorkRecords = async () => {
      try {
        const response = await fetch("/works", { signal: controller.signal });

        if (!response.ok) {
          throw new Error("Failed to fetch work records");
        }

        const data: WorkRecord[] = await response.json();
        setRecords(data);
        const clinicNames = [...new Set(data.map((record) => record.clinic))];
        setExpandedClinics((current) => {
          const next = new Set([...current].filter((clinicName) => clinicNames.includes(clinicName)));

          return next;
        });
        setSelectedId((currentId) =>
          currentId !== null && data.some((record) => record.id === currentId)
            ? currentId
            : data[0]?.id ?? null
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error(error);
      }
    };

    void loadWorkRecords();

    return () => controller.abort();
  }, []);

  const selectedRecord = records.find((record) => record.id === selectedId) ?? records[0];

  const groupedRecords = records.reduce<Record<string, WorkRecord[]>>((acc, record) => {
    if (!acc[record.clinic]) {
      acc[record.clinic] = [];
    }
    acc[record.clinic].push(record);
    return acc;
  }, {});
  const clinicEntries = Object.entries(groupedRecords);

  const toggleClinic = (clinicName: string) => {
    setExpandedClinics((current) => {
      const next = new Set(current);

      if (next.has(clinicName)) {
        next.delete(clinicName);
      } else {
        next.add(clinicName);
      }

      return next;
    });
  };

  const updateWorkStatus = async (
    workStatus: "in_progress" | "completed"
  ) => {
    if (selectedId === null) {
      return;
    }

    try {
      const response = await fetch(`/works/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ work_status: workStatus }),
      });

      if (!response.ok) {
        throw new Error("Failed to update work status");
      }

      setRecords((currentRecords) =>
        currentRecords.map((record) =>
          record.id === selectedId
            ? {
                ...record,
                workStatus,
                completed: workStatus === "completed",
              }
            : record
        )
      );
    } catch (error) {
      console.error(error);
    }
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
                <p><span className="font-semibold text-[#555555]">歯式:</span> <span className="text-[#222222]">{selectedRecord.tooth}</span></p>
              </div>

              <div className="mt-2 grid grid-cols-[110px_1fr] gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedRecord.pdfUrl) {
                      window.open(selectedRecord.pdfUrl, "_blank", "noopener,noreferrer");
                    } else {
                      console.log("[Work] PDF preview not ready");
                    }
                  }}
                  className="rounded-lg border border-[#E2E2E2] bg-[#FCFCFC] p-1 transition-colors duration-200 ease-[ease] hover:bg-[#FFF8EA]"
                  aria-label="指示書PDFを表示"
                >
                  {selectedRecord.pdfUrl ? (
                    <iframe
                      title="作業指示書サムネイル"
                      src={`${selectedRecord.pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&page=1&view=FitH`}
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
                  onClick={() => void updateWorkStatus("in_progress")}
                  disabled={!selectedRecord?.completed}
                  className="rounded-lg border border-[#E1E1E1] bg-white px-5 py-2 text-sm font-semibold text-[#444444] transition-colors duration-200 ease-[ease] hover:bg-[#F8F8F8] disabled:cursor-not-allowed disabled:bg-[#F6F6F6] disabled:text-[#A5A5A5]"
                >
                  作業中に戻す
                </button>
                <button
                  type="button"
                  onClick={() => void updateWorkStatus("completed")}
                  className="rounded-lg bg-[#F5A200] px-5 py-2 text-sm font-bold text-white transition-colors duration-200 ease-[ease] hover:bg-[#E09700]"
                >
                  作業終了
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-[2] overflow-hidden rounded-[16px] border border-[#E8E8E8] bg-white p-4">
          <div className="flex min-h-0 w-full flex-col">
            <p className="text-sm font-semibold text-[#333333]">本日の作業一覧</p>

            <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 text-sm">
              {clinicEntries.map(([clinicName, clinicRecords]) => {
                const isExpanded = expandedClinics.has(clinicName);

                return (
                <div key={clinicName} className="rounded-lg border border-[#EEEEEE] bg-[#FCFCFC]">
                  <button
                    type="button"
                    onClick={() => toggleClinic(clinicName)}
                    className="flex w-full items-center justify-between border-b border-[#ECECEC] px-3 py-2 text-left"
                    aria-expanded={isExpanded}
                    aria-label={`${clinicName} の作業一覧を${isExpanded ? "閉じる" : "開く"}`}
                  >
                    <span className="flex min-w-0 items-center gap-2 text-xs font-bold text-[#555555]">
                      <span className="text-[11px] text-[#666666]">{isExpanded ? "▼" : "▶"}</span>
                      <span className="truncate">【{clinicName}】</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-[#666666]">{clinicRecords.length}件</span>
                  </button>

                  {isExpanded ? (
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
                  ) : null}
                </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DeliveryCandidatesModal() {
  const [dateFilter, setDateFilter] = useState(getTodayJstString());
  const [customerFilter, setCustomerFilter] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<DeliveryCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmedDelivery, setConfirmedDelivery] = useState<ConfirmedDelivery | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadCandidates = async () => {
      try {
        setIsLoading(true);
        setError("");

        const params = new URLSearchParams();
        if (dateFilter) {
          params.set("date", dateFilter);
        }
        if (customerFilter !== null) {
          params.set("customer_id", String(customerFilter));
        }

        const query = params.toString();
        const url = query ? `/deliveries/candidates?${query}` : "/deliveries/candidates";
        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
          throw new Error("Failed to fetch delivery candidates");
        }

        const data: DeliveryCandidate[] = await response.json();
        setCandidates(data);
        setSubmitError("");
        setSelectedItemIds((current) => {
          const existing = new Set(data.map((item) => item.order_item_id));
          return new Set([...current].filter((id) => existing.has(id)));
        });
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }

        console.error(loadError);
        setCandidates([]);
        setError("納品候補の取得に失敗しました");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void loadCandidates();

    return () => controller.abort();
  }, [dateFilter, customerFilter, reloadKey]);

  const customerOptions = Array.from(
    candidates.reduce<Map<number, string>>((acc, item) => {
      if (!acc.has(item.customer_id)) {
        acc.set(item.customer_id, item.customer_name);
      }
      return acc;
    }, new Map())
  )
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  const toggleSelection = (orderItemId: number) => {
    setSelectedItemIds((current) => {
      const next = new Set(current);
      if (next.has(orderItemId)) {
        next.delete(orderItemId);
      } else {
        next.add(orderItemId);
      }
      return next;
    });
  };

  const selectedCandidates = candidates.filter((item) =>
    selectedItemIds.has(item.order_item_id)
  );
  const selectedAmount = selectedCandidates.reduce((sum, item) => {
    const amount = item.amount_preview === null ? 0 : Number(item.amount_preview);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);

  const submitDelivery = async () => {
    if (!dateFilter) {
      setSubmitError("納品予定日を指定してください");
      return;
    }

    if (selectedCandidates.length === 0 || isSubmitting) {
      return;
    }

    const customerIds = new Set(selectedCandidates.map((item) => item.customer_id));

    if (customerIds.size !== 1) {
      setSubmitError("異なる歯科医院の受注を同じ納品書に混在できません");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const response = await fetch("/deliveries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer_id: selectedCandidates[0].customer_id,
          delivery_date: dateFilter,
          items: selectedCandidates.map((item) => ({
            order_item_id: item.order_item_id,
            quantity: item.quantity,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const message =
          typeof data?.error === "string" ? data.error : "納品確定に失敗しました";

        if (response.status === 409) {
          if (message.includes("すでに納品済み")) {
            setSubmitError(
              "すでに納品済みの受注が含まれています。画面を更新してください。"
            );
          } else {
            setSubmitError(message);
          }
        } else {
          setSubmitError(message);
        }

        return;
      }

      const deliveryItemsByOrderItemId = new Map(
        (data.delivery_items as Array<{
          order_item_id: number;
          quantity: number;
          unit_price: string;
          amount: string;
        }>).map((item) => [item.order_item_id, item])
      );
      const confirmedItems: ConfirmedDeliveryItem[] = selectedCandidates.map((candidate) => {
        const deliveryItem = deliveryItemsByOrderItemId.get(candidate.order_item_id);

        return {
          order_item_id: candidate.order_item_id,
          patient_name: candidate.patient_name,
          order_no: candidate.order_no,
          work_type_name: candidate.work_type_name,
          tooth_numbers: candidate.tooth_numbers,
          quantity: deliveryItem?.quantity ?? candidate.quantity,
          unit_price: deliveryItem?.unit_price ?? candidate.unit_price_preview,
          amount: deliveryItem?.amount ?? candidate.amount_preview,
        };
      });

      setConfirmedDelivery({
        id: Number(data.id),
        delivery_no: String(data.delivery_no ?? ""),
        customer_name:
          typeof data.customer_name === "string"
            ? data.customer_name
            : selectedCandidates[0].customer_name,
        delivery_date:
          typeof data.delivery_date === "string"
            ? data.delivery_date.slice(0, 10)
            : dateFilter,
        total_amount:
          typeof data.total_amount === "string" || data.total_amount === null
            ? data.total_amount
            : String(data.total_amount),
        items: confirmedItems,
      });
      setSelectedItemIds(new Set());
      setReloadKey((current) => current + 1);
    } catch (submitDeliveryError) {
      console.error(submitDeliveryError);
      setSubmitError("納品確定に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (confirmedDelivery) {
    return (
      <section
        className="flex h-full min-h-[340px] w-full max-w-6xl flex-col overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white p-6"
        aria-label="納品書詳細"
      >
        <div className="h-[14px] w-full rounded-t-[20px] bg-[#F5A200]" aria-hidden="true" />

        <div className="mt-3 flex items-start gap-3">
          <span className="mt-1 h-10 w-[5px] rounded-full bg-[#F5A200]" aria-hidden="true" />
          <div>
            <h2 className="text-2xl font-bold text-[#222222]">納品書詳細</h2>
            <p className="mt-1 text-xs text-[#666666]">納品確定が完了しました</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-[14px] border border-[#E8E8E8] bg-[#FCFCFC] p-4 text-sm">
          <p><span className="font-semibold text-[#555555]">納品書番号:</span> <span className="text-[#222222]">{confirmedDelivery.delivery_no}</span></p>
          <p><span className="font-semibold text-[#555555]">歯科医院:</span> <span className="text-[#222222]">{confirmedDelivery.customer_name}</span></p>
          <p><span className="font-semibold text-[#555555]">納品日:</span> <span className="text-[#222222]">{confirmedDelivery.delivery_date}</span></p>
          <p><span className="font-semibold text-[#555555]">合計金額:</span> <span className="text-[#222222]">{formatYen(confirmedDelivery.total_amount)}</span></p>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-[16px] border border-[#E8E8E8] bg-white">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[#FCFCFC] text-xs font-bold text-[#555555]">
              <tr>
                <th className="border-b border-[#ECECEC] px-3 py-2">患者名</th>
                <th className="border-b border-[#ECECEC] px-3 py-2">受注No</th>
                <th className="border-b border-[#ECECEC] px-3 py-2">作業内容</th>
                <th className="border-b border-[#ECECEC] px-3 py-2">歯式</th>
                <th className="border-b border-[#ECECEC] px-3 py-2 text-right">数量</th>
                <th className="border-b border-[#ECECEC] px-3 py-2 text-right">単価</th>
                <th className="border-b border-[#ECECEC] px-3 py-2 text-right">金額</th>
              </tr>
            </thead>
            <tbody>
              {confirmedDelivery.items.map((item) => (
                <tr key={item.order_item_id} className="border-b border-[#EFEFEF] text-[#2A2A2A]">
                  <td className="px-3 py-2">{item.patient_name}</td>
                  <td className="px-3 py-2">{item.order_no}</td>
                  <td className="px-3 py-2">{item.work_type_name}</td>
                  <td className="px-3 py-2">{item.tooth_numbers.join(", ") || "-"}</td>
                  <td className="px-3 py-2 text-right">{item.quantity}</td>
                  <td className="px-3 py-2 text-right">{formatYen(item.unit_price)}</td>
                  <td className="px-3 py-2 text-right">{formatYen(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex shrink-0 justify-end gap-2 border-t border-[#ECECEC] pt-3">
          <button
            type="button"
            onClick={() =>
              window.open(`/deliveries/${confirmedDelivery.id}/pdf`, "_blank", "noopener,noreferrer")
            }
            className="rounded-lg bg-[#F5A200] px-5 py-2 text-sm font-bold text-white transition-colors duration-200 ease-[ease] hover:bg-[#E09700]"
          >
            納品書PDF
          </button>

          <button
            type="button"
            onClick={() => setConfirmedDelivery(null)}
            className="rounded-lg border border-[#E1E1E1] bg-white px-5 py-2 text-sm font-semibold text-[#444444] transition-colors duration-200 ease-[ease] hover:bg-[#F8F8F8]"
          >
            納品候補一覧に戻る
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="flex h-full min-h-[340px] w-full max-w-6xl flex-col overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white p-6"
      aria-label="納品書"
    >
      <div className="h-[14px] w-full rounded-t-[20px] bg-[#F5A200]" aria-hidden="true" />

      <div className="mt-3 flex items-start gap-3">
        <span className="mt-1 h-10 w-[5px] rounded-full bg-[#F5A200]" aria-hidden="true" />
        <div>
          <h2 className="text-2xl font-bold text-[#222222]">納品書</h2>
          <p className="mt-1 text-xs text-[#666666]">作業完了済みの納品候補を確認します</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <label className="text-xs font-semibold text-[#333333]">納品予定日</label>
        <input
          type="date"
          value={dateFilter}
          onChange={(event) => setDateFilter(event.target.value)}
          className="h-9 rounded-lg border border-[#E2E2E2] bg-white px-3 text-sm font-medium text-[#333333] outline-none transition-colors focus:border-[#F0B132]"
        />

        <label className="ml-2 text-xs font-semibold text-[#333333]">歯科医院</label>
        <select
          value={customerFilter ?? ""}
          onChange={(event) =>
            setCustomerFilter(event.target.value === "" ? null : Number(event.target.value))
          }
          className="h-9 min-w-[220px] rounded-lg border border-[#E2E2E2] bg-white px-3 text-sm font-medium text-[#333333] outline-none transition-colors focus:border-[#F0B132]"
        >
          <option value="">すべて</option>
          {customerOptions.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-[16px] border border-[#E8E8E8] bg-white">
        <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[#FCFCFC] text-xs font-bold text-[#555555]">
            <tr>
              <th className="w-10 border-b border-[#ECECEC] px-3 py-2">選択</th>
              <th className="border-b border-[#ECECEC] px-3 py-2">医院グループ</th>
              <th className="border-b border-[#ECECEC] px-3 py-2">患者名</th>
              <th className="border-b border-[#ECECEC] px-3 py-2">受注No</th>
              <th className="border-b border-[#ECECEC] px-3 py-2">作業内容</th>
              <th className="border-b border-[#ECECEC] px-3 py-2">歯式</th>
              <th className="border-b border-[#ECECEC] px-3 py-2">納品予定日</th>
              <th className="border-b border-[#ECECEC] px-3 py-2 text-right">数量</th>
              <th className="border-b border-[#ECECEC] px-3 py-2 text-right">単価</th>
              <th className="border-b border-[#ECECEC] px-3 py-2 text-right">金額</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-sm text-[#666666]">
                  読み込み中...
                </td>
              </tr>
            ) : null}

            {!isLoading && error ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-sm text-[#B42318]">
                  {error}
                </td>
              </tr>
            ) : null}

            {!isLoading && !error && candidates.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-sm text-[#666666]">
                  条件に一致する納品候補はありません
                </td>
              </tr>
            ) : null}

            {!isLoading && !error
              ? candidates.map((item) => {
                  const isSelected = selectedItemIds.has(item.order_item_id);
                  return (
                    <tr
                      key={item.order_item_id}
                      className={`border-b border-[#EFEFEF] text-[#2A2A2A] transition-colors duration-150 ease-[ease] ${
                        isSelected ? "bg-[#FFF8EA]" : "hover:bg-[#FFFDF7]"
                      }`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(item.order_item_id)}
                          className="h-4 w-4 accent-[#F5A200]"
                          aria-label={`候補${item.order_item_id}を選択`}
                        />
                      </td>
                      <td className="px-3 py-2">{item.customer_name}</td>
                      <td className="px-3 py-2">{item.patient_name}</td>
                      <td className="px-3 py-2">{item.order_no}</td>
                      <td className="px-3 py-2">{item.work_type_name}</td>
                      <td className="px-3 py-2">{item.tooth_numbers.join(", ") || "-"}</td>
                      <td className="px-3 py-2">{item.delivery_date ?? "-"}</td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatYen(item.unit_price_preview)}</td>
                      <td className="px-3 py-2 text-right">{formatYen(item.amount_preview)}</td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex shrink-0 items-center justify-between border-t border-[#ECECEC] pt-3">
        <div>
          <p className="text-sm text-[#555555]">
          選択件数: <span className="font-semibold text-[#222222]">{selectedCandidates.length}</span>
          <span className="ml-3">合計: <span className="font-semibold text-[#222222]">{formatYen(String(selectedAmount))}</span></span>
          </p>
          {submitError ? (
            <p className="mt-1 text-sm font-medium text-[#B42318]">{submitError}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => void submitDelivery()}
          disabled={selectedCandidates.length === 0 || !dateFilter || isSubmitting}
          className={`rounded-lg px-6 py-2 text-sm font-bold text-white transition-colors duration-200 ease-[ease] ${
            selectedCandidates.length === 0 || !dateFilter || isSubmitting
              ? "cursor-not-allowed bg-[#E2E2E2] text-[#7C7C7C]"
              : "bg-[#F5A200] hover:bg-[#E09700]"
          }`}
        >
          {isSubmitting ? "納品確定中..." : "納品確定"}
        </button>
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

  if (activeId === "delivery") {
    return <DeliveryCandidatesModal />;
  }

  if (activeId === "manage") {
    return <ManagementModal />;
  }

  return <DashboardModal />;
}
