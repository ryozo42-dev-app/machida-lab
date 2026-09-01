"use client";

import { FormEvent, useEffect, useState } from "react";

type DocumentTab = "delivery" | "invoice";

type Customer = {
  id: number;
  name: string;
};

type DocumentSearchResult = {
  id: number;
  pdf_filename: string | null;
  document_type: DocumentTab;
};

type DocumentSearchResponse = {
  documents: DocumentSearchResult[];
};

function createYearMonthValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
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

export default function DocumentManagementPanel({
  onBack,
}: {
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<DocumentTab>("delivery");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isCustomersLoading, setIsCustomersLoading] = useState(false);
  const [customerError, setCustomerError] = useState("");

  const [deliveryCustomerId, setDeliveryCustomerId] = useState("");
  const [deliveryDateFrom, setDeliveryDateFrom] = useState("");
  const [deliveryDateTo, setDeliveryDateTo] = useState("");
  const [deliveryNo, setDeliveryNo] = useState("");

  const [invoiceCustomerId, setInvoiceCustomerId] = useState("");
  const [billingMonth, setBillingMonth] = useState(() =>
    createYearMonthValue(new Date())
  );
  const [invoiceNo, setInvoiceNo] = useState("");

  const [results, setResults] = useState<DocumentSearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const loadCustomers = async () => {
      setIsCustomersLoading(true);
      setCustomerError("");

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
        setCustomerError(
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

  const resetSearchState = (nextTab: DocumentTab) => {
    setActiveTab(nextTab);
    setResults([]);
    setHasSearched(false);
    setSearchError("");
  };

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSearchError("");
    setHasSearched(false);
    setResults([]);

    const params = new URLSearchParams();
    params.set("document_type", activeTab);

    if (activeTab === "delivery") {
      const trimmedDeliveryNo = deliveryNo.trim();
      const hasPeriod = Boolean(deliveryDateFrom || deliveryDateTo);

      if (!trimmedDeliveryNo && !hasPeriod) {
        setSearchError("検索条件を入力してください。");
        return;
      }

      if (hasPeriod && !deliveryCustomerId) {
        setSearchError("期間で検索する場合は歯科医院を選択してください。");
        return;
      }

      if (deliveryCustomerId) {
        params.set("customer_id", deliveryCustomerId);
      }

      if (deliveryCustomerId && deliveryDateFrom) {
        params.set("delivery_date_from", deliveryDateFrom);
      }

      if (deliveryCustomerId && deliveryDateTo) {
        params.set("delivery_date_to", deliveryDateTo);
      }

      if (trimmedDeliveryNo) {
        params.set("delivery_no", trimmedDeliveryNo);
      }
    } else {
      const trimmedInvoiceNo = invoiceNo.trim();
      const hasBillingMonth = Boolean(billingMonth);

      if (!trimmedInvoiceNo && !hasBillingMonth) {
        setSearchError("検索条件を入力してください。");
        return;
      }

      if (hasBillingMonth && !invoiceCustomerId && !trimmedInvoiceNo) {
        setSearchError("請求月で検索する場合は歯科医院を選択してください。");
        return;
      }

      if (invoiceCustomerId) {
        params.set("customer_id", invoiceCustomerId);
      }

      if (!trimmedInvoiceNo && invoiceCustomerId && billingMonth) {
        params.set("billing_month", billingMonth);
      }

      if (trimmedInvoiceNo) {
        params.set("invoice_no", trimmedInvoiceNo);
      }
    }

    setIsSearching(true);

    try {
      const response = await fetch(
        `/api/documents/search?${params.toString()}`
      );
      const data = (await response.json()) as DocumentSearchResponse | {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "帳票の検索に失敗しました。")
        );
      }

      setResults((data as DocumentSearchResponse).documents);
      setHasSearched(true);
    } catch (error) {
      console.error("Failed to search documents", error);
      setSearchError(
        error instanceof Error
          ? error.message
          : "帳票の検索に失敗しました。"
      );
    } finally {
      setIsSearching(false);
    }
  };

  const renderCustomerSelect = (
    value: string,
    onChange: (value: string) => void
  ) => (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
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
  );

  return (
    <section
      className="flex h-full min-h-[340px] w-full max-w-6xl flex-col overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white p-6"
      aria-label="帳票管理"
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
          <h2 className="text-2xl font-bold text-[#222222]">帳票管理</h2>

          <p className="mt-1 text-xs text-[#666666]">
            納品書・請求書の検索・閲覧を行います
          </p>
        </div>
      </div>

      <div className="mt-5 flex min-h-0 flex-1 flex-col rounded-[16px] border border-[#E8E8E8] bg-[#FCFCFC] p-4">
        <div className="flex gap-2">
          {[
            { id: "delivery", label: "納品書" },
            { id: "invoice", label: "請求書" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => resetSearchState(tab.id as DocumentTab)}
              className={`rounded-lg border px-5 py-2 text-sm font-bold transition-colors ${
                activeTab === tab.id
                  ? "border-[#fff362] bg-[#fff362] text-[#222222]"
                  : "border-[#E1E1E1] bg-white text-[#555555] hover:bg-[#FAFAFA]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form
          onSubmit={handleSearch}
          className="mt-4 rounded-[14px] border border-[#E8E8E8] bg-white p-4"
        >
          {activeTab === "delivery" ? (
            <div className="grid grid-cols-4 gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-[#555555]">
                歯科医院
                {renderCustomerSelect(
                  deliveryCustomerId,
                  setDeliveryCustomerId
                )}
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-[#555555]">
                納品期間（開始）
                <input
                  type="date"
                  value={deliveryDateFrom}
                  onChange={(event) =>
                    setDeliveryDateFrom(event.target.value)
                  }
                  className="h-10 rounded-lg border border-[#DADADA] px-3 text-sm text-[#222222] outline-none focus:border-[#C9BC00]"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-[#555555]">
                納品期間（終了）
                <input
                  type="date"
                  value={deliveryDateTo}
                  onChange={(event) => setDeliveryDateTo(event.target.value)}
                  className="h-10 rounded-lg border border-[#DADADA] px-3 text-sm text-[#222222] outline-none focus:border-[#C9BC00]"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-[#555555]">
                納品書番号
                <input
                  type="text"
                  value={deliveryNo}
                  onChange={(event) => setDeliveryNo(event.target.value)}
                  className="h-10 rounded-lg border border-[#DADADA] px-3 text-sm text-[#222222] outline-none focus:border-[#C9BC00]"
                  placeholder="DEL-..."
                />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-[#555555]">
                歯科医院
                {renderCustomerSelect(
                  invoiceCustomerId,
                  setInvoiceCustomerId
                )}
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-[#555555]">
                請求月
                <input
                  type="month"
                  value={billingMonth}
                  onChange={(event) => setBillingMonth(event.target.value)}
                  className="h-10 rounded-lg border border-[#DADADA] px-3 text-sm text-[#222222] outline-none focus:border-[#C9BC00]"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-[#555555]">
                請求書番号
                <input
                  type="text"
                  value={invoiceNo}
                  onChange={(event) => setInvoiceNo(event.target.value)}
                  className="h-10 rounded-lg border border-[#DADADA] px-3 text-sm text-[#222222] outline-none focus:border-[#C9BC00]"
                  placeholder="INV-..."
                />
              </label>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              {customerError ? (
                <p className="text-sm font-medium text-[#B42318]">
                  {customerError}
                </p>
              ) : searchError ? (
                <p className="text-sm font-medium text-[#B42318]">
                  {searchError}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={isSearching}
              className="rounded-lg border border-[#fff362] bg-[#fff362] px-6 py-2 text-sm font-bold text-[#222222] transition-opacity hover:bg-[#fff362] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSearching ? "検索中..." : "検索"}
            </button>
          </div>
        </form>

        <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-[14px] border border-[#E8E8E8] bg-white">
          {hasSearched && results.length === 0 ? (
            <div className="flex min-h-[160px] items-center justify-center">
              <p className="text-sm text-[#666666]">
                該当する帳票はありません。
              </p>
            </div>
          ) : results.length > 0 ? (
            <ul className="divide-y divide-[#EFEFEF]">
              {results.map((result) => {
                const documentPath =
                  result.document_type === "delivery"
                    ? "deliveries"
                    : "invoices";

                return (
                  <li key={`${result.document_type}-${result.id}`}>
                    <a
                      href={`/api/documents/${documentPath}/${result.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="block px-4 py-3 text-sm font-semibold text-[#222222] transition-colors hover:bg-[#FFFDEB]"
                    >
                      {result.pdf_filename}
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex min-h-[160px] items-center justify-center">
              <p className="text-sm text-[#777777]">
                条件を入力して検索してください。
              </p>
            </div>
          )}
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
    </section>
  );
}
