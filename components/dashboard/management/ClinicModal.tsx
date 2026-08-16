"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
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
}, [mode, customer]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "create" ? "歯科医院を登録" : "歯科医院を編集"}
    >
      <div className="w-full max-w-[520px] overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white shadow-xl">
        <div className="h-[10px] bg-[#fff362]" />

        <div className="p-6">
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
  );
}
