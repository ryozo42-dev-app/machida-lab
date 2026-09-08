"use client";

import { useCallback, useEffect, useState } from "react";

type RateItem = {
  id: number;
  effective_from: string;
};

type TaxRateItem = RateItem & { tax_rate: number };
type BusRateItem = RateItem & { amount: number };

type InvoiceSettingsResponse = {
  tax: {
    current: TaxRateItem | null;
    history: TaxRateItem[];
  };
  bus: {
    current: BusRateItem | null;
    history: BusRateItem[];
  };
};

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${year}/${month}/${day}`;
}

// 末尾の0だけを表示上除去（保存値のPrecisionは変更しない）
function formatTaxRateLabel(taxRate: number) {
  return `${Number(taxRate.toFixed(2))}%`;
}

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

function SettingSection({
  title,
  description,
  currentLabel,
  effectiveFrom,
  historyRows,
  onAddClick,
}: {
  title: string;
  description: string;
  currentLabel: string | null;
  effectiveFrom: string | null;
  historyRows: { effective_from: string; label: string }[];
  onAddClick: () => void;
}) {
  return (
    <div className="rounded-[14px] border border-[#E8E8E8] bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#333333]">{title}</p>
          <p className="mt-0.5 text-xs text-[#777777]">{description}</p>
        </div>

        <button
          type="button"
          onClick={onAddClick}
          className="shrink-0 rounded-lg border border-[#fff362] bg-[#fff362] px-3 py-1 text-xs font-semibold text-[#222222] hover:bg-[#fff362]"
        >
          ＋ 新しい設定
        </button>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-3">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-[#555555]">
            現在の設定
          </span>

          <div className="mt-1 rounded-lg border border-[#DCDCDC] bg-[#FAFAFA] px-3 py-1.5 text-sm text-[#222222]">
            {currentLabel ?? "未設定"}
          </div>
        </div>

        <div className="flex flex-col">
          <span className="text-xs font-semibold text-[#555555]">
            適用開始日
          </span>

          <div className="mt-1 rounded-lg border border-[#DCDCDC] bg-[#FAFAFA] px-3 py-1.5 text-sm text-[#222222]">
            {effectiveFrom ? formatDisplayDate(effectiveFrom) : "未設定"}
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          <span className="text-xs font-semibold text-[#555555]">
            設定履歴
          </span>

          {historyRows.length === 0 ? (
            <div className="mt-1 flex flex-1 items-center justify-center rounded-lg border border-dashed border-[#DCDCDC] bg-[#FAFAFA] px-3 py-1.5 text-xs text-[#999999]">
              設定履歴はありません
            </div>
          ) : (
            <ul className="mt-1 max-h-[68px] divide-y divide-[#EFEFEF] overflow-y-auto rounded-lg border border-[#DCDCDC] bg-white">
              {historyRows.map((row, index) => (
                <li
                  key={index}
                  className="flex items-center justify-between gap-2 px-3 py-1 text-sm text-[#222222]"
                >
                  <span className="whitespace-nowrap text-xs text-[#666666]">
                    {formatDisplayDate(row.effective_from)}
                  </span>
                  <span className="whitespace-nowrap font-semibold">
                    {row.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function AddSettingModal({
  type,
  onClose,
  onSaved,
}: {
  type: "tax" | "bus";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const isTax = type === "tax";

  const handleSave = async () => {
    if (isSaving) {
      return;
    }

    if (value.trim() === "" || !effectiveFrom) {
      setError("すべての項目を入力してください。");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const response = await fetch("/api/invoice-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          value: Number(value),
          effective_from: effectiveFrom,
        }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error(
            "同じ適用開始日の設定が既に登録されています。"
          );
        }

        throw new Error(getErrorMessage(data, "設定の保存に失敗しました。"));
      }

      onSaved();
    } catch (err) {
      console.error("Failed to save invoice setting", err);
      setError(
        err instanceof Error ? err.message : "設定の保存に失敗しました。"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={isTax ? "消費税率の新規設定" : "ベースアップ支援金の新規設定"}
    >
      <div className="w-full max-w-[380px] overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white shadow-xl">
        <div className="h-[10px] bg-[#fff362]" />

        <div className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#222222]">
              {isTax ? "消費税率の新規設定" : "ベースアップ支援金の新規設定"}
            </h3>

            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-[#777777] transition-colors hover:bg-[#F5F5F5]"
              aria-label="閉じる"
            >
              ×
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-sm font-semibold text-[#333333]">
                {isTax ? "税率（%）" : "金額（円）"}
              </span>

              <input
                type="number"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                min={0}
                max={isTax ? 25 : undefined}
                step={isTax ? "0.01" : "1"}
                placeholder={isTax ? "例：10" : "例：136"}
                className="mt-2 w-full rounded-lg border border-[#DCDCDC] bg-white px-3 py-2.5 text-sm text-[#222222] outline-none transition-colors placeholder:text-[#AAAAAA] focus:border-[#fff362]"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[#333333]">
                適用開始日
              </span>

              <input
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                className="mt-2 w-full rounded-lg border border-[#DCDCDC] bg-white px-3 py-2.5 text-sm text-[#222222] outline-none transition-colors focus:border-[#fff362]"
              />
            </label>
          </div>

          {error ? (
            <p className="mt-3 text-sm font-medium text-[#B42318]">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg border border-[#DCDCDC] bg-white px-4 py-2 text-sm font-semibold text-[#555555] hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-60"
            >
              キャンセル
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-lg border border-[#fff362] bg-[#fff362] px-4 py-2 text-sm font-semibold text-[#222222] hover:bg-[#fff362] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InvoiceSettingsPanel({
  onBack,
}: {
  onBack: () => void;
}) {
  const [settings, setSettings] = useState<InvoiceSettingsResponse | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [addModalType, setAddModalType] = useState<"tax" | "bus" | null>(
    null
  );

  const loadSettings = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/invoice-settings", {
        signal,
      });
      const data = (await response.json()) as
        | InvoiceSettingsResponse
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "請求設定の取得に失敗しました。")
        );
      }

      setSettings(data as InvoiceSettingsResponse);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      console.error("Failed to load invoice settings", err);
      setError(
        err instanceof Error
          ? err.message
          : "請求設定の取得に失敗しました。"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void loadSettings(controller.signal);

    return () => controller.abort();
  }, [loadSettings]);

  return (
    <section
      className="flex h-full min-h-[340px] w-full max-w-6xl flex-col overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white p-6"
      aria-label="請求設定"
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
          <h2 className="text-2xl font-bold text-[#222222]">請求設定</h2>

          <p className="mt-1 text-xs text-[#666666]">
            請求に関する設定を管理します
          </p>
        </div>
      </div>

      <div className="mt-5 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-[16px] border border-[#E8E8E8] bg-[#FCFCFC] p-3">
        {isLoading ? (
          <div className="flex min-h-[120px] items-center justify-center">
            <p className="text-sm text-[#666666]">読み込み中...</p>
          </div>
        ) : error ? (
          <div className="flex min-h-[120px] items-center justify-center">
            <p className="text-sm font-medium text-[#B42318]">{error}</p>
          </div>
        ) : (
          <>
            <SettingSection
              title="消費税率"
              description="消費税率と適用開始日を管理します"
              currentLabel={
                settings?.tax.current
                  ? formatTaxRateLabel(settings.tax.current.tax_rate)
                  : null
              }
              effectiveFrom={settings?.tax.current?.effective_from ?? null}
              historyRows={(settings?.tax.history ?? []).map((row) => ({
                effective_from: row.effective_from,
                label: formatTaxRateLabel(row.tax_rate),
              }))}
              onAddClick={() => setAddModalType("tax")}
            />

            <SettingSection
              title="ベースアップ支援金"
              description="ベースアップ支援金の金額と適用開始日を管理します"
              currentLabel={
                settings?.bus.current
                  ? `${settings.bus.current.amount}円`
                  : null
              }
              effectiveFrom={settings?.bus.current?.effective_from ?? null}
              historyRows={(settings?.bus.history ?? []).map((row) => ({
                effective_from: row.effective_from,
                label: `${row.amount}円`,
              }))}
              onAddClick={() => setAddModalType("bus")}
            />
          </>
        )}
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

      {addModalType ? (
        <AddSettingModal
          type={addModalType}
          onClose={() => setAddModalType(null)}
          onSaved={() => {
            setAddModalType(null);
            void loadSettings();
          }}
        />
      ) : null}
    </section>
  );
}
