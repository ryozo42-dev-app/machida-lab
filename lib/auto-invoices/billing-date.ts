const TOKYO_TIME_ZONE = "Asia/Tokyo";

export class AutoInvoiceSettingsError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type CustomerBillingSettings = {
  billing_closing_day: number | null;
  billing_closing_month_end: boolean;
  billing_issue_day: number | null;
  billing_issue_month_end: boolean;
};

export type BillingPeriod = {
  periodStart: Date;
  periodEnd: Date;
  invoiceDate: Date;
};

type YearMonth = {
  year: number;
  month: number;
};

export function createUtcDate(
  year: number,
  month: number,
  day: number
) {
  return new Date(Date.UTC(year, month - 1, day));
}

export function getDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function formatDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getTokyoDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TOKYO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export function parseRunDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("run-date must be YYYY-MM-DD");
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    formatDate(date) !== value
  ) {
    throw new Error("run-date is invalid");
  }

  return date;
}

export function isIssueDate(
  customer: CustomerBillingSettings,
  runDate: Date
) {
  const runYear = runDate.getUTCFullYear();
  const runMonth = runDate.getUTCMonth() + 1;
  const runDay = runDate.getUTCDate();

  if (customer.billing_issue_month_end) {
    return runDay === getDaysInMonth(runYear, runMonth);
  }

  const issueDay = customer.billing_issue_day;

  if (
    issueDay === null ||
    !Number.isInteger(issueDay) ||
    issueDay < 1 ||
    issueDay > 31
  ) {
    throw new AutoInvoiceSettingsError(
      "請求書発行日設定が不正です"
    );
  }

  const safeIssueDay = Math.min(
    issueDay,
    getDaysInMonth(runYear, runMonth)
  );

  return safeIssueDay === runDay;
}

function addMonths({ year, month }: YearMonth, amount: number) {
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  };
}

function calculateBillingPeriod(
  customer: CustomerBillingSettings,
  billingYear: number,
  billingMonth: number
) {
  if (customer.billing_closing_month_end) {
    return {
      periodStart: createUtcDate(billingYear, billingMonth, 1),
      periodEnd: createUtcDate(
        billingYear,
        billingMonth,
        getDaysInMonth(billingYear, billingMonth)
      ),
      closingDayForIssue: getDaysInMonth(
        billingYear,
        billingMonth
      ),
    };
  }

  const closingDay = customer.billing_closing_day;

  if (
    closingDay === null ||
    !Number.isInteger(closingDay) ||
    closingDay < 1 ||
    closingDay > 31
  ) {
    throw new AutoInvoiceSettingsError(
      "請求締日設定が不正です"
    );
  }

  const previousMonth = billingMonth === 1 ? 12 : billingMonth - 1;
  const previousMonthYear =
    billingMonth === 1 ? billingYear - 1 : billingYear;
  const previousClosingDay = Math.min(
    closingDay,
    getDaysInMonth(previousMonthYear, previousMonth)
  );
  const currentClosingDay = Math.min(
    closingDay,
    getDaysInMonth(billingYear, billingMonth)
  );

  return {
    periodStart: createUtcDate(
      previousMonthYear,
      previousMonth,
      previousClosingDay + 1
    ),
    periodEnd: createUtcDate(
      billingYear,
      billingMonth,
      currentClosingDay
    ),
    closingDayForIssue: currentClosingDay,
  };
}

function calculateInvoiceDate(
  customer: CustomerBillingSettings,
  billingYear: number,
  billingMonth: number,
  closingDayForIssue: number
) {
  if (customer.billing_issue_month_end) {
    return createUtcDate(
      billingYear,
      billingMonth,
      getDaysInMonth(billingYear, billingMonth)
    );
  }

  const issueDay = customer.billing_issue_day;

  if (
    issueDay === null ||
    !Number.isInteger(issueDay) ||
    issueDay < 1 ||
    issueDay > 31
  ) {
    throw new AutoInvoiceSettingsError(
      "請求書発行日設定が不正です"
    );
  }

  const issueMonth =
    issueDay > closingDayForIssue
      ? billingMonth
      : billingMonth === 12
        ? 1
        : billingMonth + 1;
  const issueYear =
    issueDay > closingDayForIssue
      ? billingYear
      : billingMonth === 12
        ? billingYear + 1
        : billingYear;
  const safeIssueDay = Math.min(
    issueDay,
    getDaysInMonth(issueYear, issueMonth)
  );

  return createUtcDate(issueYear, issueMonth, safeIssueDay);
}

export function resolveBillingPeriodForRunDate(
  customer: CustomerBillingSettings,
  runDate: Date
): BillingPeriod {
  const runYearMonth = {
    year: runDate.getUTCFullYear(),
    month: runDate.getUTCMonth() + 1,
  };
  const runDateString = formatDate(runDate);

  for (const monthOffset of [-1, 0, 1]) {
    const { year, month } = addMonths(runYearMonth, monthOffset);
    const {
      periodStart,
      periodEnd,
      closingDayForIssue,
    } = calculateBillingPeriod(customer, year, month);
    const invoiceDate = calculateInvoiceDate(
      customer,
      year,
      month,
      closingDayForIssue
    );

    if (formatDate(invoiceDate) === runDateString) {
      return {
        periodStart,
        periodEnd,
        invoiceDate,
      };
    }
  }

  throw new AutoInvoiceSettingsError(
    "実行日に対応する請求期間を特定できません"
  );
}
