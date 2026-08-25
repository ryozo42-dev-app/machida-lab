"use client";

import { useCallback, useEffect, useState } from "react";

type DepositMaterialType = "para" | "miro";

type DepositMaterialBalance = {
  id: number;
  customer_id: number;
  material_id: number;
  material_name: string;
  unit: string;
  current_quantity: string;
};

type DepositMaterialTransaction = {
  id: number;
  deposit_material_id: number;
  transaction_type: string;
  quantity: string;
  order_id: number | null;
  order_item_id: number | null;
  created_at: string;
  material_id: number;
  material_name: string;
  unit: string;
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

type ClinicModalProps = {
  mode: "create" | "edit";
  customer: Clinic | null;
  onClose: () => void;
  onSave: (data: {
    name: string;
    code: string;
    billing_closing_day: number | null;
    billing_closing_month_end: boolean;
    billing_issue_day: number | null;
  billing_issue_month_end: boolean;
    show_material_on_delivery: boolean;
  }) => void;
};

export default function ClinicModal({
  mode,
  customer,
  onClose,
  onSave,
}: ClinicModalProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [billingClosingDay, setBillingClosingDay] = useState("");
const [billingClosingMonthEnd, setBillingClosingMonthEnd] = useState(false);
const [billingIssueDay, setBillingIssueDay] = useState("");
const [billingIssueMonthEnd, setBillingIssueMonthEnd] = useState(false);
const [showMaterialOnDelivery, setShowMaterialOnDelivery] = useState(false);
const [depositMaterialType, setDepositMaterialType] =
  useState<DepositMaterialType>("para");
const [depositQuantity, setDepositQuantity] = useState("");
const [depositBalances, setDepositBalances] = useState<
  Record<DepositMaterialType, DepositMaterialBalance | null>
>({
  para: null,
  miro: null,
});
const [isLoadingDepositBalances, setIsLoadingDepositBalances] =
  useState(false);
const [isAddingDeposit, setIsAddingDeposit] = useState(false);
const [isLoadingDepositHistory, setIsLoadingDepositHistory] =
  useState(false);
const [isDepositHistoryOpen, setIsDepositHistoryOpen] = useState(false);
const [depositHistoryMaterialType, setDepositHistoryMaterialType] =
  useState<DepositMaterialType>("para");
const [depositHistory, setDepositHistory] = useState<
  DepositMaterialTransaction[]
>([]);
const [depositError, setDepositError] = useState("");

const depositTransactionLabels: Record<string, string> = {
  deposit: "預かり",
  use: "使用",
  use_reversal: "使用取消",
};

const formatDepositTransactionDate = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const formatDepositQuantity = (value: string) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return value;
  }

  return number.toString();
};

  const fetchDepositBalances = useCallback(async () => {
  if (mode !== "edit" || !customer) {
    setDepositBalances({
      para: null,
      miro: null,
    });
    return;
  }

  setIsLoadingDepositBalances(true);
  setDepositError("");

  try {
    const response = await fetch(
      `/api/customer-deposit-materials?customer_id=${customer.id}`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch deposit material balances");
    }

    const balances =
      (await response.json()) as DepositMaterialBalance[];

    setDepositBalances({
      para:
        balances.find((item) =>
          item.material_name.includes("パラ")
        ) ?? null,
      miro:
        balances.find((item) =>
          item.material_name.includes("ミロ")
        ) ?? null,
    });
  } catch (error) {
    console.error("Failed to fetch deposit material balances", error);
    setDepositError("現在預かり残を取得できませんでした");
  } finally {
    setIsLoadingDepositBalances(false);
  }
}, [mode, customer]);

  useEffect(() => {
  const timeoutId = window.setTimeout(() => {
    void fetchDepositBalances();
  }, 0);

  return () => window.clearTimeout(timeoutId);
}, [fetchDepositBalances]);

  useEffect(() => {
  const timeoutId = window.setTimeout(() => {
  if (mode === "edit" && customer) {
    setName(customer.name);
    setCode(customer.code);

    setBillingClosingDay(
      customer.billing_closing_day?.toString() ?? ""
    );
    setBillingClosingMonthEnd(
      customer.billing_closing_month_end
    );
    setBillingIssueDay(
      customer.billing_issue_day?.toString() ?? ""
    );
    setBillingIssueMonthEnd(
      customer.billing_issue_month_end
    );
    setShowMaterialOnDelivery(
      customer.show_material_on_delivery
    );
  } else {
    setName("");
    setCode("");

    setBillingClosingDay("");
    setBillingClosingMonthEnd(false);
    setBillingIssueDay("");
    setBillingIssueMonthEnd(false);
    setShowMaterialOnDelivery(false);
  }
  setDepositMaterialType("para");
  setDepositHistoryMaterialType("para");
  setDepositQuantity("");
  setDepositHistory([]);
  setIsDepositHistoryOpen(false);
  setDepositError("");
  }, 0);

  return () => window.clearTimeout(timeoutId);
}, [mode, customer]);

  const currentDepositBalance = depositBalances[depositMaterialType];
  const currentDepositRemaining = isLoadingDepositBalances
    ? "取得中"
    : `${currentDepositBalance?.current_quantity ?? "0.000"}${
        currentDepositBalance?.unit ?? "g"
      }`;
  const canAddDeposit =
    mode === "edit" &&
    !!customer &&
    Number.isFinite(Number(depositQuantity)) &&
    Number(depositQuantity) > 0 &&
    !isAddingDeposit;
  const canViewDepositHistory =
    mode === "edit" &&
    !!customer &&
    !isLoadingDepositHistory;

  const handleSave = () => {
  const trimmedName = name.trim();
  const trimmedCode = code.trim();

  if (!trimmedName || !trimmedCode) {
    return;
  }

  onSave({
    name: trimmedName,
    code: trimmedCode,
    billing_closing_day: billingClosingMonthEnd
      ? null
      : billingClosingDay
        ? Number(billingClosingDay)
        : null,
    billing_closing_month_end: billingClosingMonthEnd,
    billing_issue_day: billingIssueMonthEnd
      ? null
      : billingIssueDay
        ? Number(billingIssueDay)
        : null,
    billing_issue_month_end: billingIssueMonthEnd,
    show_material_on_delivery: showMaterialOnDelivery,
  });
};

  const handleAddDeposit = async () => {
  if (!canAddDeposit || !customer) {
    return;
  }

  setIsAddingDeposit(true);
  setDepositError("");

  try {
    const response = await fetch("/api/customer-deposit-materials", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer_id: customer.id,
        material_type: depositMaterialType,
        quantity: Number(depositQuantity),
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to add deposit material");
    }

    setDepositQuantity("");
    await fetchDepositBalances();
  } catch (error) {
    console.error("Failed to add deposit material", error);
    setDepositError("預かりを追加できませんでした");
  } finally {
    setIsAddingDeposit(false);
  }
};

  const handleDepositMaterialTypeChange = (
  nextMaterialType: DepositMaterialType
) => {
  setDepositMaterialType(nextMaterialType);
  setDepositError("");
};

  const fetchDepositHistory = async (
  materialType: DepositMaterialType
) => {
  if (!customer) {
    return;
  }

  setIsLoadingDepositHistory(true);
  setDepositError("");

  try {
    const query = new URLSearchParams({
      customer_id: customer.id.toString(),
      material_type: materialType,
    });
    const response = await fetch(
      `/api/customer-deposit-materials/history?${query.toString()}`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch deposit material history");
    }

    const history =
      (await response.json()) as DepositMaterialTransaction[];

    setDepositHistory(history);
  } catch (error) {
    console.error("Failed to fetch deposit material history", error);
    setDepositError("履歴を取得できませんでした");
  } finally {
    setIsLoadingDepositHistory(false);
  }
};

  const handleViewDepositHistory = async () => {
  if (!canViewDepositHistory || !customer) {
    return;
  }

  setDepositHistoryMaterialType(depositMaterialType);
  setIsDepositHistoryOpen(true);
  await fetchDepositHistory(depositMaterialType);
};

  const handleDepositHistoryMaterialTypeChange = async (
  nextMaterialType: DepositMaterialType
) => {
  setDepositHistoryMaterialType(nextMaterialType);
  await fetchDepositHistory(nextMaterialType);
};

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "create" ? "歯科医院を登録" : "歯科医院を編集"}
    >
      <div className="max-h-[92vh] w-full max-w-[520px] overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white shadow-xl">
        <div className="h-[10px] bg-[#fff362]" />

        <div className="max-h-[calc(92vh-10px)] overflow-y-auto p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#222222]">
                {mode === "create" ? "歯科医院を登録" : "歯科医院を編集"}
              </h2>

              <p className="mt-1 text-xs text-[#777777]">
                {mode === "create"
                  ? "新しい歯科医院を登録します"
                  : "歯科医院の情報を編集します"}
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

          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="text-sm font-semibold text-[#333333]">
                歯科医院名
              </span>

              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="歯科医院名を入力"
                className="mt-2 w-full rounded-lg border border-[#DCDCDC] bg-white px-3 py-2.5 text-sm text-[#222222] outline-none transition-colors placeholder:text-[#AAAAAA] focus:border-[#fff362]"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[#333333]">
                コード
              </span>

              <input
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="例：KUNO"
                className="mt-2 w-full rounded-lg border border-[#DCDCDC] bg-white px-3 py-2.5 text-sm text-[#222222] outline-none transition-colors placeholder:text-[#AAAAAA] focus:border-[#fff362]"
              />

              <p className="mt-1.5 text-xs text-[#888888]">
                医院を識別するコードを入力してください
              </p>
            </label>
                        <div className="border-t border-[#ECECEC] pt-5">
              <p className="text-sm font-semibold text-[#333333]">
                請求設定
              </p>

              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-[#555555]">
                    請求締日
                  </span>

                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={billingClosingDay}
                      onChange={(event) =>
                        setBillingClosingDay(event.target.value)
                      }
                      disabled={billingClosingMonthEnd}
                      placeholder="1〜31"
                      className="w-full rounded-lg border border-[#DCDCDC] bg-white px-3 py-2.5 text-sm text-[#222222] outline-none transition-colors placeholder:text-[#AAAAAA] focus:border-[#fff362] disabled:bg-[#F5F5F5] disabled:text-[#999999]"
                    />

                    <span className="shrink-0 text-sm text-[#555555]">
                      日
                    </span>
                  </div>

                  <label className="mt-2 flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={billingClosingMonthEnd}
                      onChange={(event) =>
                        setBillingClosingMonthEnd(event.target.checked)
                      }
                      className="h-4 w-4 accent-[#fff362]"
                    />

                    <span className="text-sm text-[#444444]">
                      月末
                    </span>
                  </label>
                </div>

                <div>
                  <span className="text-sm text-[#555555]">
                    請求書発行日
                  </span>

                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      disabled={billingIssueMonthEnd}
                      value={billingIssueDay}
                      onChange={(event) =>
                        setBillingIssueDay(event.target.value)
                      }
                      placeholder="1〜31"
                      className="w-full rounded-lg border border-[#DCDCDC] bg-white px-3 py-2.5 text-sm text-[#222222] outline-none transition-colors placeholder:text-[#AAAAAA] focus:border-[#fff362]"
                    />

                    <span className="shrink-0 text-sm text-[#555555]">
                      日
                    </span>
                  </div>

                  <label className="mt-2 flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={billingIssueMonthEnd}
                      onChange={(event) =>
                        setBillingIssueMonthEnd(event.target.checked)
                      }
                      className="h-4 w-4 accent-[#fff362]"
                    />

                    <span className="text-sm text-[#444444]">
                      月末
                    </span>
                  </label>

                </div>
            </div>

            <div className="border-t border-[#ECECEC] pt-5">
              <p className="text-sm font-semibold text-[#333333]">
                納品書設定
              </p>

              <label className="mt-3 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={showMaterialOnDelivery}
                  onChange={(event) =>
                    setShowMaterialOnDelivery(event.target.checked)
                  }
                  className="h-4 w-4 accent-[#fff362]"
                />

                <span className="text-sm text-[#444444]">
                  預かり材料の詳細を納品書に記載する
                </span>
              </label>

              <p className="mt-1.5 text-xs text-[#888888]">
                この医院の納品書に預かり材料の使用量・残量を記載します
              </p>
            </div>

            <div className="border-t border-[#ECECEC] pt-5">
              <p className="text-sm font-semibold text-[#333333]">
                預かり材料管理
              </p>

              <div className="mt-3 flex gap-4">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="depositMaterialType"
                    value="para"
                    checked={depositMaterialType === "para"}
                    onChange={() => handleDepositMaterialTypeChange("para")}
                    className="h-4 w-4 accent-[#fff362]"
                  />

                  <span className="text-sm text-[#444444]">
                    パラ
                  </span>
                </label>

                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="depositMaterialType"
                    value="miro"
                    checked={depositMaterialType === "miro"}
                    onChange={() => handleDepositMaterialTypeChange("miro")}
                    className="h-4 w-4 accent-[#fff362]"
                  />

                  <span className="text-sm text-[#444444]">
                    ミロ
                  </span>
                </label>
              </div>

              <div className="mt-4 rounded-lg border border-[#E6E6E6] bg-[#FAFAFA] px-3 py-3">
                <span className="text-xs font-semibold text-[#777777]">
                  現在預かり残
                </span>

                <p className="mt-1 text-lg font-bold text-[#222222]">
                  {currentDepositRemaining}
                </p>
              </div>

              <label className="mt-4 block">
                <span className="text-sm text-[#555555]">
                  新規預かり量
                </span>

                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={depositQuantity}
                    onChange={(event) => setDepositQuantity(event.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-[#DCDCDC] bg-white px-3 py-2.5 text-sm text-[#222222] outline-none transition-colors placeholder:text-[#AAAAAA] focus:border-[#fff362]"
                  />

                  <span className="shrink-0 text-sm text-[#555555]">
                    g
                  </span>
                </div>
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleAddDeposit}
                  disabled={!canAddDeposit}
                  className={`rounded-lg px-4 py-2.5 text-sm font-bold text-[#222222] transition-colors ${
                    canAddDeposit
                      ? "bg-[#fff362] hover:bg-[#fff362]"
                      : "cursor-not-allowed bg-[#D8D8D8]"
                  }`}
                >
                  {isAddingDeposit ? "追加中" : "預かりを追加"}
                </button>

                <button
                  type="button"
                  onClick={handleViewDepositHistory}
                  disabled={!canViewDepositHistory}
                  className="rounded-lg border border-[#E1E1E1] bg-white px-4 py-2.5 text-sm font-semibold text-[#444444] transition-colors hover:bg-[#F8F8F8]"
                >
                  {isLoadingDepositHistory ? "取得中" : "履歴を見る"}
                </button>
              </div>

              {depositError ? (
                <p className="mt-2 text-xs font-semibold text-[#C0392B]">
                  {depositError}
                </p>
              ) : null}
            </div>
          </div>
            </div>

          <div className="mt-7 flex justify-end gap-2 border-t border-[#ECECEC] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#E1E1E1] bg-white px-5 py-2.5 text-sm font-semibold text-[#444444] transition-colors hover:bg-[#F8F8F8]"
            >
              キャンセル
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim() || !code.trim()}
              className={`rounded-lg px-6 py-2.5 text-sm font-bold text-[#222222] transition-colors ${
                !name.trim() || !code.trim()
                  ? "cursor-not-allowed bg-[#D8D8D8]"
                  : "bg-[#fff362] hover:bg-[#fff362] text-[#222222]"
              }`}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
    {isDepositHistoryOpen && customer ? (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-4"
        role="dialog"
        aria-modal="true"
        aria-label="預かり材料履歴"
      >
        <div className="max-h-[82vh] w-full max-w-[460px] overflow-hidden rounded-[18px] border border-[#E6E6E6] bg-white shadow-xl">
          <div className="h-[10px] bg-[#fff362]" />

          <div className="flex max-h-[calc(82vh-10px)] flex-col p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-[#222222]">
                  預かり材料履歴
                </h3>
                <p className="mt-1 text-sm font-semibold text-[#555555]">
                  {customer.name}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsDepositHistoryOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-[#777777] transition-colors hover:bg-[#F5F5F5]"
                aria-label="預かり材料履歴を閉じる"
              >
                ×
              </button>
            </div>

            <div className="mt-4 flex gap-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="depositHistoryMaterialType"
                  value="para"
                  checked={depositHistoryMaterialType === "para"}
                  onChange={() => void handleDepositHistoryMaterialTypeChange("para")}
                  className="h-4 w-4 accent-[#fff362]"
                />
                <span className="text-sm text-[#444444]">パラ</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="depositHistoryMaterialType"
                  value="miro"
                  checked={depositHistoryMaterialType === "miro"}
                  onChange={() => void handleDepositHistoryMaterialTypeChange("miro")}
                  className="h-4 w-4 accent-[#fff362]"
                />
                <span className="text-sm text-[#444444]">ミロ</span>
              </label>
            </div>

            {depositError ? (
              <p className="mt-3 text-xs font-semibold text-[#C0392B]">
                {depositError}
              </p>
            ) : null}

            <div className="mt-4 min-h-0 overflow-hidden rounded-lg border border-[#E6E6E6]">
              <div className="grid grid-cols-[1fr_78px_96px] bg-[#FAFAFA] px-3 py-2 text-xs font-semibold text-[#777777]">
                <span>日時</span>
                <span className="text-right">区分</span>
                <span className="text-right">数量</span>
              </div>

              {isLoadingDepositHistory ? (
                <p className="border-t border-[#EEEEEE] px-3 py-3 text-sm text-[#777777]">
                  取得中
                </p>
              ) : depositHistory.length > 0 ? (
                <div className="max-h-[42vh] overflow-y-auto">
                  {depositHistory.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="grid grid-cols-[1fr_78px_96px] border-t border-[#EEEEEE] px-3 py-2 text-sm text-[#333333]"
                    >
                      <span className="truncate">
                        {formatDepositTransactionDate(
                          transaction.created_at
                        )}
                      </span>

                      <span className="text-right">
                        {depositTransactionLabels[
                          transaction.transaction_type
                        ] ?? transaction.transaction_type}
                      </span>

                      <span className="text-right font-semibold">
                        {formatDepositQuantity(transaction.quantity)}
                        {transaction.unit}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="border-t border-[#EEEEEE] px-3 py-3 text-sm text-[#777777]">
                  履歴はありません
                </p>
              )}
            </div>

            <div className="mt-5 flex justify-end border-t border-[#ECECEC] pt-4">
              <button
                type="button"
                onClick={() => setIsDepositHistoryOpen(false)}
                className="rounded-lg border border-[#E1E1E1] bg-white px-5 py-2.5 text-sm font-semibold text-[#444444] transition-colors hover:bg-[#F8F8F8]"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
