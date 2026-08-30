"use client";

import DockLauncher, { type DockItem } from "@/components/dashboard/DockLauncher";
import Header from "@/components/layout/Header";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const dockItems: DockItem[] = [
  {
    id: "dashboard",
    iconSrc: "/icons/dashboard.svg",
    iconAlt: "ダッシュボード",
    label: "ダッシュボード",
    indicatorColor: "#fff362",
  },
  {
    id: "order",
    iconSrc: "/icons/order.svg",
    iconAlt: "受注入力",
    label: "受注入力",
    indicatorColor: "#fff362",
  },
  {
    id: "work",
    iconSrc: "/icons/work.svg",
    iconAlt: "作業時入力",
    label: "作業時入力",
    indicatorColor: "#fff362",
  },
  {
    id: "delivery",
    iconSrc: "/icons/delivery.svg",
    iconAlt: "納品書",
    label: "納品書",
    indicatorColor: "#fff362",
  },
  {
    id: "invoice",
    iconSrc: "/icons/invoice.svg",
    iconAlt: "請求書",
    label: "請求書",
    indicatorColor: "#fff362",
  },
  {
    id: "manage",
    iconSrc: "/icons/manage.svg",
    iconAlt: "管理",
    label: "管理",
    indicatorColor: "#fff362",
  },
];

type Customer = {
  id: number;
  code: string;
  name: string;
  billing_closing_day: number | null;
  billing_closing_month_end: boolean;
  billing_issue_day: number | null;
  billing_issue_month_end: boolean;
};

type DeliveryCandidate = {
  id: number;
  delivery_no: string;
  delivery_date: string;
  total_amount: string | number | null;
  tax_amount: string | number | null;
  total_amount_including_tax: string | number | null;
  item_count: number;
};

type CandidateResponse = {
  customer: {
    id: number;
    name: string;
  };
  period: {
    start: string;
    end: string;
  };
  count: number;
  deliveries: DeliveryCandidate[];
};

type CreatedInvoice = {
  id: number;
  display_invoice_no: string;
};

function getInitialBillingDate() {
  const now = new Date();

  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
}

function formatBillingDay(day: number | null, isMonthEnd: boolean) {
  if (isMonthEnd) {
    return "月末";
  }

  return day === null ? "未設定" : `${day}日`;
}

function formatDisplayDate(value: string) {
  const datePart = value.includes("T") ? value.slice(0, 10) : value;

  return datePart.replaceAll("-", "/");
}

function formatYen(value: string | number | null) {
  if (value === null) {
    return "-";
  }

  const numericValue =
    typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(numericValue);
}

function toNumber(value: string | number | null) {
  if (value === null) {
    return 0;
  }

  const numericValue =
    typeof value === "number" ? value : Number(value);

  return Number.isFinite(numericValue) ? numericValue : 0;
}

async function readErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as {
      error?: unknown;
    };

    return typeof data.error === "string"
      ? data.error
      : "処理に失敗しました";
  } catch {
    return "処理に失敗しました";
  }
}

export default function InvoicesPage() {
  const router = useRouter();
  const initialBillingDate = useMemo(
    () => getInitialBillingDate(),
    []
  );
  const years = useMemo(
    () => [
      initialBillingDate.year - 1,
      initialBillingDate.year,
      initialBillingDate.year + 1,
    ],
    [initialBillingDate.year]
  );

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [billingYear, setBillingYear] = useState(
    initialBillingDate.year
  );
  const [billingMonth, setBillingMonth] = useState(
    initialBillingDate.month
  );
  const [isCustomersLoading, setIsCustomersLoading] =
    useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [candidate, setCandidate] =
    useState<CandidateResponse | null>(null);
  const [createdInvoice, setCreatedInvoice] =
    useState<CreatedInvoice | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] =
    useState(false);

  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadCustomers() {
      setIsCustomersLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch("/api/customers", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const data = (await response.json()) as Customer[];
        setCustomers(data);
        setCustomerId(data[0]?.id ?? null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "取引先の取得に失敗しました"
        );
      } finally {
        setIsCustomersLoading(false);
      }
    }

    void loadCustomers();

    return () => controller.abort();
  }, []);

  const resetResult = () => {
    setCandidate(null);
    setCreatedInvoice(null);
    setErrorMessage("");
    setIsConfirmModalOpen(false);
  };

  const handleCheck = async () => {
    if (customerId === null) {
      setErrorMessage("取引先を選択してください");
      return;
    }

    setIsChecking(true);
    setErrorMessage("");
    setCandidate(null);
    setCreatedInvoice(null);

    try {
      const params = new URLSearchParams({
        customer_id: String(customerId),
        billing_year: String(billingYear),
        billing_month: String(billingMonth),
      });

      const response = await fetch(
        `/api/invoices/candidates?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as CandidateResponse;
      setCandidate(data);
      setIsConfirmModalOpen(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "請求内容の確認に失敗しました"
      );
    } finally {
      setIsChecking(false);
    }
  };

  const handleIssue = async () => {
    if (customerId === null || candidate === null || candidate.count === 0) {
      return;
    }

    setIsIssuing(true);
    setErrorMessage("");
    setCreatedInvoice(null);

    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer_id: customerId,
          billing_year: billingYear,
          billing_month: billingMonth,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as CreatedInvoice;
      setCreatedInvoice(data);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "請求書の発行に失敗しました"
      );
    } finally {
      setIsIssuing(false);
    }
  };

  const canIssue =
    candidate !== null &&
    candidate.count > 0 &&
    !createdInvoice &&
    !isIssuing;

  const deliveryTotals = useMemo(() => {
    if (candidate === null) {
      return {
        subtotal: 0,
        taxAmount: 0,
        totalAmount: 0,
      };
    }

    return candidate.deliveries.reduce(
      (totals, delivery) => ({
        subtotal:
          totals.subtotal + toNumber(delivery.total_amount),
        taxAmount:
          totals.taxAmount + toNumber(delivery.tax_amount),
        totalAmount:
          totals.totalAmount +
          toNumber(delivery.total_amount_including_tax),
      }),
      {
        subtotal: 0,
        taxAmount: 0,
        totalAmount: 0,
      }
    );
  }, [candidate]);

  const closeConfirmModal = () => {
    if (isIssuing) {
      return;
    }

    setIsConfirmModalOpen(false);
  };

  const handleDockSelect = (nextId: string) => {
    if (nextId === "invoice") {
      return;
    }

    router.push("/");
  };

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-white text-[#222222]">
      <Header />

      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8">
        <div>
          <h1 className="text-3xl font-bold text-[#222222]">
            請求書発行
          </h1>
        </div>

        <section className="rounded-[12px] border border-[#E6E6E6] bg-white p-6">
          <div className="grid gap-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#555555]">
                取引先
              </span>
              <select
                value={customerId ?? ""}
                onChange={(event) => {
                  setCustomerId(Number(event.target.value));
                  resetResult();
                }}
                disabled={isCustomersLoading || customers.length === 0}
                className="h-11 rounded-[8px] border border-[#D8D8D8] bg-white px-3 text-base text-[#222222] outline-none focus:border-[#222222]"
              >
                {isCustomersLoading ? (
                  <option value="">読み込み中...</option>
                ) : customers.length === 0 ? (
                  <option value="">取引先がありません</option>
                ) : (
                  customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))
                )}
              </select>
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#555555]">
                請求月
              </span>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={billingYear}
                  onChange={(event) => {
                    setBillingYear(Number(event.target.value));
                    resetResult();
                  }}
                  className="h-11 rounded-[8px] border border-[#D8D8D8] bg-white px-3 text-base text-[#222222] outline-none focus:border-[#222222]"
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}年
                    </option>
                  ))}
                </select>

                <select
                  value={billingMonth}
                  onChange={(event) => {
                    setBillingMonth(Number(event.target.value));
                    resetResult();
                  }}
                  className="h-11 rounded-[8px] border border-[#D8D8D8] bg-white px-3 text-base text-[#222222] outline-none focus:border-[#222222]"
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map(
                    (month) => (
                      <option key={month} value={month}>
                        {month}月
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCheck}
              disabled={
                isChecking ||
                isCustomersLoading ||
                customers.length === 0 ||
                customerId === null
              }
              className="h-11 rounded-[8px] bg-[#fff362] px-5 text-sm font-bold text-[#222222] transition-colors hover:bg-[#fff362] disabled:cursor-not-allowed disabled:bg-[#BDBDBD]"
            >
              {isChecking ? "確認中..." : "請求内容を確認"}
            </button>
          </div>

          {errorMessage ? (
            <div className="mt-5 rounded-[8px] border border-[#D9D9D9] bg-white px-4 py-3 text-sm font-semibold text-[#222222]">
              {errorMessage}
            </div>
          ) : null}
        </section>

        {selectedCustomer ? (
          <section className="rounded-[12px] border border-[#E6E6E6] bg-white p-6">
            <h2 className="text-lg font-bold text-[#222222]">
              請求設定
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-[#777777]">
                  締日
                </p>
                <p className="mt-1 text-lg font-semibold text-[#222222]">
                  {formatBillingDay(
                    selectedCustomer.billing_closing_day,
                    selectedCustomer.billing_closing_month_end
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#777777]">
                  発行日
                </p>
                <p className="mt-1 text-lg font-semibold text-[#222222]">
                  {formatBillingDay(
                    selectedCustomer.billing_issue_day,
                    selectedCustomer.billing_issue_month_end
                  )}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {isConfirmModalOpen && candidate ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-confirm-title"
          >
            <section className="flex h-[88vh] max-h-[90vh] w-[min(1100px,94vw)] flex-col overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white shadow-xl">
              <header className="flex shrink-0 items-center justify-between border-b border-[#E6E6E6] px-6 py-4">
                <h2
                  id="invoice-confirm-title"
                  className="text-xl font-bold text-[#222222]"
                >
                  請求内容の確認
                </h2>
                <button
                  type="button"
                  onClick={closeConfirmModal}
                  disabled={isIssuing}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-[#777777] transition-colors hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:text-[#BBBBBB]"
                  aria-label="閉じる"
                >
                  ×
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[10px] border border-[#E8E8E8] p-4">
                    <p className="text-xs font-semibold text-[#777777]">
                      取引先
                    </p>
                    <p className="mt-1 text-base font-semibold text-[#222222]">
                      {candidate.customer.name}
                    </p>
                  </div>

                  <div className="rounded-[10px] border border-[#E8E8E8] p-4">
                    <p className="text-xs font-semibold text-[#777777]">
                      請求月
                    </p>
                    <p className="mt-1 text-base font-semibold text-[#222222]">
                      {billingYear}年{billingMonth}月分
                    </p>
                  </div>

                  <div className="rounded-[10px] border border-[#E8E8E8] p-4">
                    <p className="text-xs font-semibold text-[#777777]">
                      締日
                    </p>
                    <p className="mt-1 text-base font-semibold text-[#222222]">
                      {selectedCustomer
                        ? formatBillingDay(
                            selectedCustomer.billing_closing_day,
                            selectedCustomer.billing_closing_month_end
                          )
                        : "-"}
                    </p>
                  </div>

                  <div className="rounded-[10px] border border-[#E8E8E8] p-4">
                    <p className="text-xs font-semibold text-[#777777]">
                      発行日
                    </p>
                    <p className="mt-1 text-base font-semibold text-[#222222]">
                      {selectedCustomer
                        ? formatBillingDay(
                            selectedCustomer.billing_issue_day,
                            selectedCustomer.billing_issue_month_end
                          )
                        : "-"}
                    </p>
                  </div>

                  <div className="rounded-[10px] border border-[#E8E8E8] p-4">
                    <p className="text-xs font-semibold text-[#777777]">
                      請求対象期間
                    </p>
                    <p className="mt-1 text-base font-semibold text-[#222222]">
                      {formatDisplayDate(candidate.period.start)} ～{" "}
                      {formatDisplayDate(candidate.period.end)}
                    </p>
                  </div>

                  <div className="rounded-[10px] border border-[#E8E8E8] p-4">
                    <p className="text-xs font-semibold text-[#777777]">
                      対象納品
                    </p>
                    <p className="mt-1 text-base font-semibold text-[#222222]">
                      {candidate.count}件
                    </p>
                  </div>
                </div>

                {candidate.count === 0 ? (
                  <p className="mt-5 rounded-[8px] border border-[#E6E6E6] px-4 py-3 text-sm font-semibold text-[#555555]">
                    請求対象となる未請求の納品はありません
                  </p>
                ) : (
                  <>
                    <div className="mt-6 overflow-hidden rounded-[8px] border border-[#E6E6E6]">
                      <div className="border-b border-[#E6E6E6] bg-[#FCFCFC] px-4 py-3 text-sm font-bold text-[#222222]">
                        納品一覧
                      </div>
                      <div className="max-h-[36vh] overflow-auto">
                        <table className="w-full min-w-[760px] border-collapse text-sm">
                          <thead className="sticky top-0 z-10 bg-[#F7F7F7]">
                            <tr className="text-left text-[#555555]">
                              <th className="border-b border-[#E6E6E6] px-4 py-3 font-semibold">
                                納品日
                              </th>
                              <th className="border-b border-[#E6E6E6] px-4 py-3 font-semibold">
                                納品書番号
                              </th>
                              <th className="border-b border-[#E6E6E6] px-4 py-3 text-right font-semibold">
                                明細数
                              </th>
                              <th className="border-b border-[#E6E6E6] px-4 py-3 text-right font-semibold">
                                税抜金額
                              </th>
                              <th className="border-b border-[#E6E6E6] px-4 py-3 text-right font-semibold">
                                消費税
                              </th>
                              <th className="border-b border-[#E6E6E6] px-4 py-3 text-right font-semibold">
                                税込金額
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {candidate.deliveries.map((delivery) => (
                              <tr
                                key={delivery.id}
                                className="border-b border-[#EFEFEF] last:border-b-0"
                              >
                                <td className="px-4 py-3">
                                  {formatDisplayDate(
                                    delivery.delivery_date
                                  )}
                                </td>
                                <td className="px-4 py-3 font-medium">
                                  {delivery.delivery_no}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {delivery.item_count}件
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {formatYen(delivery.total_amount)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {formatYen(delivery.tax_amount)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {formatYen(
                                    delivery.total_amount_including_tax
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="mt-5 rounded-[10px] border border-[#E8E8E8] p-4">
                      <h3 className="text-base font-bold text-[#222222]">
                        合計
                      </h3>
                      <div className="mt-3 grid gap-3 sm:grid-cols-4">
                        <div>
                          <p className="text-xs font-semibold text-[#777777]">
                            対象件数
                          </p>
                          <p className="mt-1 text-sm font-semibold text-[#222222]">
                            {candidate.count}件
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-[#777777]">
                            税抜合計
                          </p>
                          <p className="mt-1 text-sm font-semibold text-[#222222]">
                            {formatYen(deliveryTotals.subtotal)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-[#777777]">
                            消費税合計
                          </p>
                          <p className="mt-1 text-sm font-semibold text-[#222222]">
                            {formatYen(deliveryTotals.taxAmount)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-[#777777]">
                            税込合計
                          </p>
                          <p className="mt-1 text-sm font-semibold text-[#222222]">
                            {formatYen(deliveryTotals.totalAmount)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {createdInvoice ? (
                  <div className="mt-5 rounded-[10px] border border-[#E6E6E6] bg-white p-4">
                    <h3 className="text-base font-bold text-[#222222]">
                      請求書を発行しました
                    </h3>
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-[#777777]">
                        請求書番号
                      </p>
                      <p className="mt-1 text-base font-semibold text-[#222222]">
                        {createdInvoice.display_invoice_no}
                      </p>
                    </div>
                    <a
                      href={`/invoices/${createdInvoice.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex h-10 items-center rounded-[8px] border border-[#222222] bg-white px-4 text-sm font-semibold text-[#222222] transition-colors hover:bg-[#F7F7F7]"
                    >
                      請求書PDFを表示
                    </a>
                  </div>
                ) : null}
              </div>

              <footer className="flex shrink-0 justify-end gap-3 border-t border-[#E6E6E6] px-6 py-4">
                <button
                  type="button"
                  onClick={closeConfirmModal}
                  disabled={isIssuing}
                  className="h-10 rounded-[8px] border border-[#E1E1E1] bg-white px-5 text-sm font-semibold text-[#444444] transition-colors hover:bg-[#F8F8F8] disabled:cursor-not-allowed disabled:text-[#BBBBBB]"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleIssue}
                  disabled={!canIssue}
                  className="h-10 rounded-[8px] bg-[#fff362] px-5 text-sm font-bold text-[#222222] transition-colors hover:bg-[#fff362] disabled:cursor-not-allowed disabled:bg-[#BDBDBD]"
                >
                  {isIssuing ? "発行中..." : "請求書を発行"}
                </button>
              </footer>
            </section>
          </div>
        ) : null}
      </div>
      </div>

      <div className="flex justify-center px-4 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pt-4">
        <DockLauncher
          items={dockItems}
          activeId="invoice"
          onSelect={handleDockSelect}
        />
      </div>
    </main>
  );
}
