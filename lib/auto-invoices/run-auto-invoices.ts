import { prisma } from "@/lib/prisma";
import { classifyAutoInvoiceError } from "./auto-invoice-errors";
import {
  AutoInvoiceSettingsError,
  formatDate,
  getTokyoDateString,
  isIssueDate,
  parseRunDate,
  resolveBillingPeriodForRunDate,
  type CustomerBillingSettings,
} from "./billing-date";
import { createAutoInvoiceForCustomer } from "./create-auto-invoice";
import { generateAutoInvoicePdf } from "./generate-auto-invoice-pdf";
import { withAutoInvoiceLock } from "./auto-invoice-lock";

type DryRunResultStatus =
  | "would_issue"
  | "already_issued"
  | "no_deliveries"
  | "invalid_settings";

type CustomerRow = CustomerBillingSettings & {
  id: number;
  name: string;
};

export type AutoInvoiceDryRunResult = {
  customer_id: number;
  customer_name: string;
  run_date: string;
  billing_closing_day: number | null;
  billing_closing_month_end: boolean;
  billing_issue_day: number | null;
  billing_issue_month_end: boolean;
  period_start: string | null;
  period_end: string | null;
  uninvoiced_delivery_count: number;
  status: DryRunResultStatus;
  reason?: string;
};

export type AutoInvoiceDryRunSummary = {
  checked_customers: number;
  matched_customers: number;
  would_issue: number;
  already_issued: number;
  no_deliveries: number;
  invalid_settings: number;
};

export type AutoInvoiceDryRunReport = {
  dry_run: true;
  run_date: string;
  results: AutoInvoiceDryRunResult[];
  summary: AutoInvoiceDryRunSummary;
};

type RunAutoInvoicesDryRunOptions = {
  runDate?: string;
};

type RunAutoInvoicesOptions = RunAutoInvoicesDryRunOptions & {
  dryRun?: boolean;
};

type AutoInvoiceIssueResult = {
  customer_id: number;
  customer_name: string;
  run_date: string;
  billing_closing_day: number | null;
  billing_closing_month_end: boolean;
  billing_issue_day: number | null;
  billing_issue_month_end: boolean;
  period_start: string | null;
  period_end: string | null;
  status:
    | "issued"
    | "issued_pdf_failed"
    | "already_issued"
    | "no_deliveries"
    | "failure";
  invoice_id?: number;
  invoice_no?: string;
  display_invoice_no?: string;
  delivery_count?: number;
  item_count?: number;
  pdf_status?: "pdf_saved" | "pdf_already_exists";
  pdf_path?: string;
  pdf_filename?: string;
  failure_status?: string;
  prisma_code?: string | null;
  reason?: string;
};

type AutoInvoiceIssueSummary = {
  checked_customers: number;
  matched_customers: number;
  issued: number;
  issued_pdf_failed: number;
  already_issued: number;
  no_deliveries: number;
  failure: number;
};

type AutoInvoiceIssueReport = {
  dry_run: false;
  run_date: string;
  lock_status: "acquired" | "already_running";
  results: AutoInvoiceIssueResult[];
  summary: AutoInvoiceIssueSummary;
  reason?: string;
};

function createBaseResult(
  customer: CustomerRow,
  runDateString: string
) {
  return {
    customer_id: customer.id,
    customer_name: customer.name,
    run_date: runDateString,
    billing_closing_day: customer.billing_closing_day,
    billing_closing_month_end:
      customer.billing_closing_month_end,
    billing_issue_day: customer.billing_issue_day,
    billing_issue_month_end: customer.billing_issue_month_end,
  };
}

function createInitialSummary(
  checkedCustomers: number
): AutoInvoiceDryRunSummary {
  return {
    checked_customers: checkedCustomers,
    matched_customers: 0,
    would_issue: 0,
    already_issued: 0,
    no_deliveries: 0,
    invalid_settings: 0,
  };
}

function addSummaryResult(
  summary: AutoInvoiceDryRunSummary,
  status: DryRunResultStatus,
  isMatchedCustomer: boolean
) {
  if (isMatchedCustomer) {
    summary.matched_customers += 1;
  }

  summary[status] += 1;
}

function createInitialIssueSummary(
  checkedCustomers: number
): AutoInvoiceIssueSummary {
  return {
    checked_customers: checkedCustomers,
    matched_customers: 0,
    issued: 0,
    issued_pdf_failed: 0,
    already_issued: 0,
    no_deliveries: 0,
    failure: 0,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function fetchCustomers() {
  return prisma.customers.findMany({
    orderBy: {
      id: "asc",
    },
    select: {
      id: true,
      name: true,
      billing_closing_day: true,
      billing_closing_month_end: true,
      billing_issue_day: true,
      billing_issue_month_end: true,
    },
  });
}

async function buildDryRunResult(
  customer: CustomerRow,
  runDate: Date,
  runDateString: string
): Promise<{
  result: AutoInvoiceDryRunResult;
  isMatchedCustomer: boolean;
}> {
  const baseResult = createBaseResult(customer, runDateString);

  let matchesIssueDate = false;

  try {
    matchesIssueDate = isIssueDate(customer, runDate);
  } catch (error) {
    if (error instanceof AutoInvoiceSettingsError) {
      return {
        isMatchedCustomer: false,
        result: {
          ...baseResult,
          period_start: null,
          period_end: null,
          uninvoiced_delivery_count: 0,
          status: "invalid_settings",
          reason: error.message,
        },
      };
    }

    throw error;
  }

  if (!matchesIssueDate) {
    return {
      isMatchedCustomer: false,
      result: {
        ...baseResult,
        period_start: null,
        period_end: null,
        uninvoiced_delivery_count: 0,
        status: "no_deliveries",
        reason: "実行日が請求書発行日ではありません",
      },
    };
  }

  try {
    const { periodStart, periodEnd } =
      resolveBillingPeriodForRunDate(customer, runDate);

    const alreadyIssuedInvoice = await prisma.invoices.findFirst({
      where: {
        customer_id: customer.id,
        period_start: periodStart,
        period_end: periodEnd,
      },
      select: {
        id: true,
        display_invoice_no: true,
        invoice_no: true,
      },
    });

    if (alreadyIssuedInvoice) {
      return {
        isMatchedCustomer: true,
        result: {
          ...baseResult,
          period_start: formatDate(periodStart),
          period_end: formatDate(periodEnd),
          uninvoiced_delivery_count: 0,
          status: "already_issued",
          reason:
            alreadyIssuedInvoice.display_invoice_no ??
            alreadyIssuedInvoice.invoice_no ??
            `invoice_id=${alreadyIssuedInvoice.id}`,
        },
      };
    }

    const deliveries = await prisma.deliveries.findMany({
      where: {
        customer_id: customer.id,
        delivery_date: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      select: {
        id: true,
        invoice_deliveries: {
          select: {
            id: true,
          },
        },
      },
    });

    const uninvoicedDeliveryCount = deliveries.filter(
      (delivery) => delivery.invoice_deliveries === null
    ).length;

    if (uninvoicedDeliveryCount === 0) {
      return {
        isMatchedCustomer: true,
        result: {
          ...baseResult,
          period_start: formatDate(periodStart),
          period_end: formatDate(periodEnd),
          uninvoiced_delivery_count: 0,
          status: "no_deliveries",
          reason: "請求対象となる未請求の納品がありません",
        },
      };
    }

    return {
      isMatchedCustomer: true,
      result: {
        ...baseResult,
        period_start: formatDate(periodStart),
        period_end: formatDate(periodEnd),
        uninvoiced_delivery_count: uninvoicedDeliveryCount,
        status: "would_issue",
      },
    };
  } catch (error) {
    if (error instanceof AutoInvoiceSettingsError) {
      return {
        isMatchedCustomer: true,
        result: {
          ...baseResult,
          period_start: null,
          period_end: null,
          uninvoiced_delivery_count: 0,
          status: "invalid_settings",
          reason: error.message,
        },
      };
    }

    throw error;
  }
}

export async function runAutoInvoices({
  runDate: runDateOption,
  dryRun = true,
}: RunAutoInvoicesOptions = {}): Promise<
  AutoInvoiceDryRunReport | AutoInvoiceIssueReport
> {
  const runDateString = runDateOption ?? getTokyoDateString();
  const runDate = parseRunDate(runDateString);

  if (!dryRun) {
    const lockResult = await withAutoInvoiceLock(async () => {
      const customers = await fetchCustomers();
      const summary = createInitialIssueSummary(customers.length);
      const results: AutoInvoiceIssueResult[] = [];

      for (const customer of customers) {
        const { result, isMatchedCustomer } = await buildDryRunResult(
          customer,
          runDate,
          runDateString
        );

        if (!isMatchedCustomer && result.status !== "invalid_settings") {
          continue;
        }

        summary.matched_customers += isMatchedCustomer ? 1 : 0;

        if (result.status === "invalid_settings") {
          summary.failure += 1;
          results.push({
            ...createBaseResult(customer, runDateString),
            period_start: null,
            period_end: null,
            status: "failure",
            failure_status: "invalid_settings",
            prisma_code: null,
            reason: result.reason,
          });
          continue;
        }

        if (result.status === "already_issued") {
          summary.already_issued += 1;
          results.push({
            ...createBaseResult(customer, runDateString),
            period_start: result.period_start,
            period_end: result.period_end,
            status: "already_issued",
            reason: result.reason,
          });
          continue;
        }

        if (result.status === "no_deliveries") {
          summary.no_deliveries += 1;
          results.push({
            ...createBaseResult(customer, runDateString),
            period_start: result.period_start,
            period_end: result.period_end,
            status: "no_deliveries",
            reason: result.reason,
          });
          continue;
        }

        try {
          const { periodStart, periodEnd, invoiceDate } =
            resolveBillingPeriodForRunDate(customer, runDate);
          const issuedResult = await createAutoInvoiceForCustomer({
            customerId: customer.id,
            periodStart,
            periodEnd,
            invoiceDate,
          });

          if (issuedResult.status === "issued") {
            const baseIssuedResult = {
              ...createBaseResult(customer, runDateString),
              period_start: formatDate(periodStart),
              period_end: formatDate(periodEnd),
              invoice_id: issuedResult.invoiceId,
              invoice_no: issuedResult.invoiceNo,
              display_invoice_no: issuedResult.displayInvoiceNo,
              delivery_count: issuedResult.deliveryCount,
              item_count: issuedResult.itemCount,
            };

            try {
              const pdfResult = await generateAutoInvoicePdf({
                invoiceId: issuedResult.invoiceId,
              });

              summary.issued += 1;
              results.push({
                ...baseIssuedResult,
                status: "issued",
                pdf_status: pdfResult.status,
                pdf_path: pdfResult.pdfPath,
                pdf_filename: pdfResult.pdfFilename,
              });
            } catch (error) {
              summary.issued_pdf_failed += 1;
              results.push({
                ...baseIssuedResult,
                status: "issued_pdf_failed",
                reason: getErrorMessage(error),
              });
            }
          } else {
            summary[issuedResult.status] += 1;
            results.push({
              ...createBaseResult(customer, runDateString),
              period_start: formatDate(periodStart),
              period_end: formatDate(periodEnd),
              status: issuedResult.status,
              reason: issuedResult.reason,
            });
          }
        } catch (error) {
          const classifiedError = classifyAutoInvoiceError(error);

          summary.failure += 1;
          results.push({
            ...createBaseResult(customer, runDateString),
            period_start: result.period_start,
            period_end: result.period_end,
            status: "failure",
            failure_status: classifiedError.status,
            prisma_code: classifiedError.prismaCode,
            reason: classifiedError.message,
          });
        }
      }

      return {
        results,
        summary,
      };
    });

    if (lockResult.status === "already_running") {
      return {
        dry_run: false,
        run_date: runDateString,
        lock_status: "already_running",
        results: [],
        summary: createInitialIssueSummary(0),
        reason: lockResult.reason,
      };
    }

    return {
      dry_run: false,
      run_date: runDateString,
      lock_status: "acquired",
      results: lockResult.result.results,
      summary: lockResult.result.summary,
    };
  }

  const customers = await fetchCustomers();
  const summary = createInitialSummary(customers.length);
  const results: AutoInvoiceDryRunResult[] = [];

  for (const customer of customers) {
    const { result, isMatchedCustomer } = await buildDryRunResult(
      customer,
      runDate,
      runDateString
    );

    if (isMatchedCustomer || result.status === "invalid_settings") {
      results.push(result);
      addSummaryResult(
        summary,
        result.status,
        isMatchedCustomer
      );
    }
  }

  return {
    dry_run: true,
    run_date: runDateString,
    results,
    summary,
  };
}

export async function runAutoInvoicesDryRun(
  options: RunAutoInvoicesDryRunOptions = {}
): Promise<AutoInvoiceDryRunReport> {
  return runAutoInvoices({
    ...options,
    dryRun: true,
  }) as Promise<AutoInvoiceDryRunReport>;
}
