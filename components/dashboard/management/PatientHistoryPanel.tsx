"use client";

import { useEffect, useMemo, useState } from "react";

type Customer = {
  id: number;
  name: string;
};

type Patient = {
  id: number;
  customer_id: number;
  patient_name: string;
  patient_kana: string | null;
};

type HistoryItem = {
  patient_name: string;
  work_name: string;
  tooth_numbers: string[];
  material_usage_text: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
};

type HistoryGroup = {
  delivery_date: string;
  items: HistoryItem[];
};

type HistoryResponse = {
  patient: { id: number; name: string };
  from_date: string;
  to_date: string;
  groups: HistoryGroup[];
};

function getErrorMessage(data: unknown, fallback: string) {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }

  return fallback;
}

function formatYen(value: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(value);
}

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return `${year}年${month}月${day}日`;
}

export default function PatientHistoryPanel({
  onBack,
}: {
  onBack: () => void;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isCustomersLoading, setIsCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState("");

  const [customerId, setCustomerId] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isPatientsLoading, setIsPatientsLoading] = useState(false);
  const [patientsError, setPatientsError] = useState("");

  const [patientNameInput, setPatientNameInput] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const loadCustomers = async () => {
      setIsCustomersLoading(true);
      setCustomersError("");

      try {
        const response = await fetch("/api/customers", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("歯科医院の読み込みに失敗しました");
        }

        const data = (await response.json()) as Customer[];
        setCustomers(data);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("Failed to load customers", error);
        setCustomersError(
          error instanceof Error
            ? error.message
            : "歯科医院の読み込みに失敗しました"
        );
      } finally {
        setIsCustomersLoading(false);
      }
    };

    void loadCustomers();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    setPatients([]);
    setPatientNameInput("");
    setSelectedPatient(null);
    setShowSuggestions(false);
    setPatientsError("");
    setHistory(null);
    setHasSearched(false);

    if (!customerId) {
      return;
    }

    const controller = new AbortController();

    const loadPatients = async () => {
      setIsPatientsLoading(true);

      try {
        const response = await fetch(
          `/api/patients?customer_id=${customerId}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error("患者一覧の読み込みに失敗しました");
        }

        const data = (await response.json()) as Patient[];
        setPatients(data);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("Failed to load patients", error);
        setPatientsError(
          error instanceof Error
            ? error.message
            : "患者一覧の読み込みに失敗しました"
        );
      } finally {
        setIsPatientsLoading(false);
      }
    };

    void loadPatients();

    return () => controller.abort();
  }, [customerId]);

  const suggestions = useMemo(() => {
    const keyword = patientNameInput.trim();

    if (!keyword) {
      return [];
    }

    return patients.filter((patient) =>
      patient.patient_name.includes(keyword)
    );
  }, [patients, patientNameInput]);

  const handlePatientInputChange = (value: string) => {
    setPatientNameInput(value);
    setSelectedPatient(null);
    setShowSuggestions(true);
  };

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setPatientNameInput(patient.patient_name);
    setShowSuggestions(false);
  };

  const canSearch = Boolean(customerId && selectedPatient);

  const handleSearch = async () => {
    if (!canSearch || !selectedPatient) {
      return;
    }

    setIsSearching(true);
    setSearchError("");
    setHistory(null);
    setHasSearched(false);

    try {
      const params = new URLSearchParams({
        customer_id: customerId,
        patient_id: String(selectedPatient.id),
      });

      const response = await fetch(`/api/patient-history?${params.toString()}`);
      const data = (await response.json()) as HistoryResponse | { error?: string };

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "患者作業履歴の取得に失敗しました。")
        );
      }

      setHistory(data as HistoryResponse);
      setHasSearched(true);
      setIsResultModalOpen(true);
    } catch (error) {
      console.error("Failed to fetch patient history", error);
      setSearchError(
        error instanceof Error
          ? error.message
          : "患者作業履歴の取得に失敗しました。"
      );
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <section
      className="flex h-full min-h-[340px] w-full max-w-6xl flex-col overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white p-6"
      aria-label="患者作業履歴"
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
          <h2 className="text-2xl font-bold text-[#222222]">患者作業履歴</h2>

          <p className="mt-1 text-xs text-[#666666]">
            患者ごとの過去2年間の納品済み作業履歴を検索・表示します
          </p>
        </div>
      </div>

      <div className="mt-5 flex min-h-0 flex-1 flex-col rounded-[16px] border border-[#E8E8E8] bg-[#FCFCFC] p-4">
        <div className="rounded-[14px] border border-[#E8E8E8] bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-[#555555]">
              歯科医院
              <select
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                className="h-10 rounded-lg border border-[#DADADA] bg-white px-3 text-sm text-[#222222] outline-none focus:border-[#C9BC00]"
              >
                <option value="">歯科医院を選択</option>
                {isCustomersLoading ? (
                  <option value="" disabled>
                    読み込み中...
                  </option>
                ) : null}
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="relative flex flex-col gap-1 text-xs font-semibold text-[#555555]">
              患者名
              <input
                type="text"
                value={patientNameInput}
                disabled={!customerId}
                onChange={(event) =>
                  handlePatientInputChange(event.target.value)
                }
                onFocus={() => setShowSuggestions(true)}
                onBlur={() =>
                  setTimeout(() => setShowSuggestions(false), 150)
                }
                placeholder={
                  customerId ? "患者名を入力" : "先に歯科医院を選択してください"
                }
                className="h-10 rounded-lg border border-[#DADADA] bg-white px-3 text-sm text-[#222222] outline-none focus:border-[#C9BC00] disabled:cursor-not-allowed disabled:bg-[#F5F5F5]"
              />

              {showSuggestions && suggestions.length > 0 ? (
                <ul className="absolute left-0 top-full z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-[#DADADA] bg-white shadow-md">
                  {suggestions.map((patient) => (
                    <li key={patient.id}>
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleSelectPatient(patient)}
                        className="block w-full px-3 py-2 text-left text-sm text-[#222222] hover:bg-[#FFFBE0]"
                      >
                        {patient.patient_name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </label>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              {customersError ? (
                <p className="text-sm font-medium text-[#B42318]">
                  {customersError}
                </p>
              ) : patientsError ? (
                <p className="text-sm font-medium text-[#B42318]">
                  {patientsError}
                </p>
              ) : searchError ? (
                <p className="text-sm font-medium text-[#B42318]">
                  {searchError}
                </p>
              ) : isPatientsLoading ? (
                <p className="text-sm text-[#666666]">患者一覧を読み込み中...</p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handleSearch}
              disabled={!canSearch || isSearching}
              className="rounded-lg border border-[#fff362] bg-[#fff362] px-6 py-2 text-sm font-bold text-[#222222] transition-opacity hover:bg-[#fff362] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSearching ? "検索中..." : "検索"}
            </button>
          </div>
        </div>

        <div className="mt-4 flex min-h-[120px] flex-1 items-center justify-center rounded-[14px] border border-[#E8E8E8] bg-white p-4">
          <p className="text-sm text-[#666666]">
            {hasSearched
              ? "検索結果はモーダルに表示されています"
              : "歯科医院と患者を選択して検索してください"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex justify-end border-t border-[#ECECEC] pt-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-[#fff362] bg-[#fff362] px-5 py-2 text-sm font-semibold text-[#222222] hover:bg-[#fff362]"
        >
          管理メニューに戻る
        </button>
      </div>

      {isResultModalOpen && history ? (
        <PatientHistoryResultModal
          history={history}
          onClose={() => setIsResultModalOpen(false)}
        />
      ) : null}
    </section>
  );
}

function PatientHistoryResultModal({
  history,
  onClose,
}: {
  history: HistoryResponse;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label="患者作業履歴"
    >
      <div className="flex h-[92vh] w-[80vw] max-w-[1000px] flex-col overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white shadow-xl">
        <div className="h-[10px] shrink-0 bg-[#fff362]" />

        <div className="flex shrink-0 items-center justify-between border-b border-[#ECECEC] px-4 py-3">
          <div>
            <h2 className="text-xl font-bold text-[#222222]">
              患者作業履歴
            </h2>

            <p className="mt-1 text-sm font-semibold text-[#222222]">
              {history.patient.name} 様
            </p>

            <p className="mt-0.5 text-xs text-[#777777]">
              対象期間：過去2年間（{history.from_date} 〜 {history.to_date}）
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-[#777777] transition-colors hover:bg-[#F5F5F5]"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {history.groups.length === 0 ? (
            <div className="flex min-h-[160px] items-center justify-center">
              <p className="text-sm text-[#666666]">
                過去2年間の作業履歴はありません
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {history.groups.map((group) => (
                <div key={group.delivery_date}>
                  <h3 className="mb-1 text-sm font-bold text-[#222222]">
                    {formatDisplayDate(group.delivery_date)}
                  </h3>

                  <table className="w-full table-fixed text-left text-xs">
                    <thead className="bg-[#FAFAF0] font-semibold text-[#555555]">
                      <tr>
                        <th className="w-[12%] px-1.5 py-1">患者名</th>
                        <th className="w-[30%] px-1.5 py-1">作業内容</th>
                        <th className="w-[13%] px-1.5 py-1 text-center">歯式</th>
                        <th className="w-[15%] px-1.5 py-1 text-center">使用材料</th>
                        <th className="w-[8%] px-1.5 py-1 text-center">数量</th>
                        <th className="w-[11%] px-1.5 py-1">単価</th>
                        <th className="w-[11%] px-1.5 py-1">金額</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFEFEF]">
                      {group.items.map((item, index) => (
                        <tr key={index}>
                          <td className="px-1.5 py-1">{item.patient_name}</td>
                          <td className="px-1.5 py-1">{item.work_name}</td>
                          <td className="px-1.5 py-1 text-center">
                            <PatientHistoryToothChart
                              toothNumbers={item.tooth_numbers}
                            />
                          </td>
                          <td className="whitespace-pre-line px-1.5 py-1 text-center">
                            {item.material_usage_text ?? "-"}
                          </td>
                          <td className="px-1.5 py-1 text-center">{item.quantity}</td>
                          <td className="px-1.5 py-1">
                            {formatYen(item.unit_price)}
                          </td>
                          <td className="px-1.5 py-1">
                            {formatYen(item.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-[#ECECEC] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#fff362] bg-[#fff362] px-5 py-2 text-sm font-semibold text-[#222222] hover:bg-[#fff362]"
          >
            一覧を閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

type ToothChartBuckets = {
  upperRight: string[];
  upperLeft: string[];
  lowerRight: string[];
  lowerLeft: string[];
};

// app/deliveries/[id]/pdf/route.ts の formatToothChartPosition（乳歯 1→A...5→E）と同一変換
function formatToothChartValue(quadrant: number, position: string) {
  if (quadrant < 5) {
    return position;
  }

  return ["", "A", "B", "C", "D", "E"][Number(position)] ?? position;
}

function sortToothChartValues(values: string[]) {
  return [...values].sort((first, second) => {
    const firstNumber = Number(first);
    const secondNumber = Number(second);

    if (Number.isFinite(firstNumber) && Number.isFinite(secondNumber)) {
      return firstNumber - secondNumber;
    }

    return first.localeCompare(second, "ja");
  });
}

// app/deliveries/[id]/pdf/route.ts の createToothChart と同一の象限振り分け
function buildToothChart(toothNumbers: string[]): ToothChartBuckets {
  const chart: ToothChartBuckets = {
    upperRight: [],
    upperLeft: [],
    lowerRight: [],
    lowerLeft: [],
  };

  for (const toothNo of toothNumbers) {
    const normalized = toothNo.trim();
    const match = normalized.match(/^([1-8])([1-8])$/);

    if (!match) {
      continue;
    }

    const quadrant = Number(match[1]);
    const position = match[2];
    const value = formatToothChartValue(quadrant, position);

    if (quadrant === 1 || quadrant === 5) {
      chart.upperRight.push(value);
    } else if (quadrant === 2 || quadrant === 6) {
      chart.upperLeft.push(value);
    } else if (quadrant === 3 || quadrant === 7) {
      chart.lowerLeft.push(value);
    } else if (quadrant === 4 || quadrant === 8) {
      chart.lowerRight.push(value);
    }
  }

  return {
    upperRight: sortToothChartValues(chart.upperRight),
    upperLeft: sortToothChartValues(chart.upperLeft),
    lowerRight: sortToothChartValues(chart.lowerRight),
    lowerLeft: sortToothChartValues(chart.lowerLeft),
  };
}

// 納品書PDFの十字チャート（tooth-chart）と同じ配置をテーブル1セル向けに再現
function PatientHistoryToothChart({
  toothNumbers,
}: {
  toothNumbers: string[];
}) {
  if (toothNumbers.length === 0) {
    return <span className="text-[10px] text-[#999999]">-</span>;
  }

  const chart = buildToothChart(toothNumbers);
  const hasUpper = chart.upperRight.length > 0 || chart.upperLeft.length > 0;
  const hasLower = chart.lowerRight.length > 0 || chart.lowerLeft.length > 0;

  if (!hasUpper && !hasLower) {
    return <span className="text-[10px] text-[#999999]">-</span>;
  }

  return (
    <div className="mx-auto grid w-full max-w-[74px] min-w-[52px] grid-rows-[14px_1px_14px] text-[10px] font-semibold leading-none text-[#111111]">
      <div className="grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] items-center">
        <div className="min-w-0 truncate pr-1 text-right">
          {chart.upperRight.join(" ")}
        </div>
        <div
          className={`h-full w-px ${hasUpper ? "bg-[#222222]" : "bg-transparent"}`}
        />
        <div className="min-w-0 truncate pl-1 text-left">
          {chart.upperLeft.join(" ")}
        </div>
      </div>

      <div className="h-px w-full bg-[#222222]" />

      <div className="grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] items-center">
        <div className="min-w-0 truncate pr-1 text-right">
          {chart.lowerRight.join(" ")}
        </div>
        <div
          className={`h-full w-px ${hasLower ? "bg-[#222222]" : "bg-transparent"}`}
        />
        <div className="min-w-0 truncate pl-1 text-left">
          {chart.lowerLeft.join(" ")}
        </div>
      </div>
    </div>
  );
}
