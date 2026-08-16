"use client";

import { useEffect, useState } from "react";

type Clinic = {
  id: number;
  code: string;
  name: string;
};

type ClinicModalProps = {
  mode: "create" | "edit";
  customer: Clinic | null;
  onClose: () => void;
  onSave: (data: { name: string; code: string }) => void;
};

export default function ClinicModal({
  mode,
  customer,
  onClose,
  onSave,
}: ClinicModalProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (mode === "edit" && customer) {
      setName(customer.name);
      setCode(customer.code);
    } else {
      setName("");
      setCode("");
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