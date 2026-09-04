"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLLING_INTERVAL_MS = 120_000;

type AutoInvoiceNotice = {
  invoice_id: number;
  invoice_no: string | null;
  display_invoice_no: string | null;
  customer_id: number;
  customer_name: string;
  invoice_date: string | null;
  auto_issued_at: string | null;
  pdf_filename: string | null;
  pdf_saved_at: string | null;
};

type AutoInvoiceNoticeResponse = {
  notices: AutoInvoiceNotice[];
};

function isAutoInvoiceNoticeResponse(
  value: unknown
): value is AutoInvoiceNoticeResponse {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const notices = (value as Record<string, unknown>).notices;

  return Array.isArray(notices);
}

export default function AutoInvoiceNoticeModal() {
  const [notices, setNotices] = useState<AutoInvoiceNotice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<
    number | null
  >(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isOpenRef = useRef(false);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const fetchNotices = useCallback(async () => {
    try {
      const response = await fetch("/api/auto-invoice-notices", {
        cache: "no-store",
      });

      if (!response.ok) {
        if (response.status !== 401 && isOpenRef.current) {
          setError("通知の取得に失敗しました。");
        }
        return;
      }

      const body: unknown = await response.json();

      if (!isAutoInvoiceNoticeResponse(body)) {
        if (isOpenRef.current) {
          setError("通知の取得に失敗しました。");
        }
        return;
      }

      if (isOpenRef.current) {
        return;
      }

      setError("");
      setNotices(body.notices);
      setSelectedInvoiceId(body.notices[0]?.invoice_id ?? null);
      setIsOpen(body.notices.length > 0);
    } catch {
      if (isOpenRef.current) {
        setError("通知の取得に失敗しました。");
      }
    }
  }, []);

  useEffect(() => {
    void fetchNotices();

    const intervalId = window.setInterval(() => {
      void fetchNotices();
    }, POLLING_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchNotices]);

  const handleOpenSelected = async () => {
    const targetNotice = notices.find(
      (notice) => notice.invoice_id === selectedInvoiceId
    );

    if (!targetNotice) {
      return;
    }

    const openedWindow = window.open(
      `/invoices/${targetNotice.invoice_id}/pdf`,
      "_blank"
    );

    if (openedWindow === null) {
      setError("PDFを開けませんでした。ブラウザ設定を確認してください。");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auto-invoice-notices/seen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoice_ids: [targetNotice.invoice_id],
        }),
      });

      if (!response.ok) {
        setError("確認済みへの更新に失敗しました。");
        return;
      }

      const remainingNotices = notices.filter(
        (notice) => notice.invoice_id !== targetNotice.invoice_id
      );

      setNotices(remainingNotices);
      setSelectedInvoiceId(
        remainingNotices[0]?.invoice_id ?? null
      );

      if (remainingNotices.length === 0) {
        setIsOpen(false);
      }
    } catch {
      setError("確認済みへの更新に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || notices.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auto-invoice-notice-title"
    >
      <div className="max-h-[88vh] w-full max-w-[720px] overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white shadow-xl">
        <div
          className="h-[14px] w-full bg-[#fff362]"
          aria-hidden="true"
        />

        <div className="flex items-start justify-between gap-4 border-b border-[#EDEDED] px-6 py-5">
          <div>
            <h2
              id="auto-invoice-notice-title"
              className="text-lg font-bold text-[#222222]"
            >
              自動発行された請求書
            </h2>
            <p className="mt-1 text-sm text-[#666666]">
              開く請求書を選択してください。
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-[#777777] transition-colors hover:bg-[#F5F5F5]"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <div className="max-h-[52vh] overflow-auto px-6 py-4">
          <div className="overflow-hidden rounded-[14px] border border-[#E8E8E8] bg-white">
            <div className="grid grid-cols-[44px_minmax(140px,1fr)_minmax(220px,1.6fr)] border-b border-[#E8E8E8] bg-[#FCFCFC] px-4 py-3 text-xs font-bold text-[#555555]">
              <div />
              <div>医院名</div>
              <div>PDFファイル名</div>
            </div>

            {notices.map((notice) => {
              const checked =
                selectedInvoiceId === notice.invoice_id;

              return (
                <label
                  key={notice.invoice_id}
                  className="grid cursor-pointer grid-cols-[44px_minmax(140px,1fr)_minmax(220px,1.6fr)] items-center border-b border-[#F0F0F0] px-4 py-3 text-sm text-[#222222] last:border-b-0 hover:bg-[#FFFDF0]"
                >
                  <input
                    type="radio"
                    name="auto-invoice-notice"
                    checked={checked}
                    onChange={() =>
                      setSelectedInvoiceId(notice.invoice_id)
                    }
                    className="h-4 w-4 accent-[#E4A800]"
                  />
                  <span className="min-w-0 pr-4 font-semibold">
                    {notice.customer_name}
                  </span>
                  <span className="min-w-0 break-all text-[#444444]">
                    {notice.pdf_filename ?? "-"}
                  </span>
                </label>
              );
            })}
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-[#F4C7C7] bg-[#FFF3F3] px-4 py-3 text-sm text-[#A63C3C]">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-[#EDEDED] px-6 py-4">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-lg border border-[#E1E1E1] bg-white px-5 py-2.5 text-sm font-semibold text-[#444444] transition-colors hover:bg-[#F8F8F8]"
          >
            閉じる
          </button>
          <button
            type="button"
            onClick={handleOpenSelected}
            disabled={
              selectedInvoiceId === null || isSubmitting
            }
            className="rounded-lg bg-[#fff362] px-5 py-2.5 text-sm font-bold text-[#222222] transition-colors hover:bg-[#fff362] disabled:cursor-not-allowed disabled:bg-[#BDBDBD] disabled:text-[#666666]"
          >
            選択した請求書を開く
          </button>
        </div>
      </div>
    </div>
  );
}
