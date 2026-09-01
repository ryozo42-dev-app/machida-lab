import { NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type DocumentType = "delivery" | "invoice";

class DocumentSearchError extends Error {}

function parsePositiveInteger(value: string | null, fieldName: string) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new DocumentSearchError(
      `${fieldName} must be a positive integer`
    );
  }

  return parsed;
}

function parseDate(value: string | null, fieldName: string) {
  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DocumentSearchError(
      `${fieldName} must be YYYY-MM-DD`
    );
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new DocumentSearchError(`${fieldName} is invalid`);
  }

  return date;
}

function parseBillingMonth(searchParams: URLSearchParams) {
  const billingMonth = searchParams.get("billing_month");

  if (billingMonth) {
    if (!/^\d{4}-\d{2}$/.test(billingMonth)) {
      throw new DocumentSearchError(
        "billing_month must be YYYY-MM"
      );
    }

    const [yearText, monthText] = billingMonth.split("-");
    const year = Number(yearText);
    const month = Number(monthText);

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      throw new DocumentSearchError("billing_month is invalid");
    }

    return { year, month };
  }

  const billingYear = searchParams.get("billing_year");
  const billingMonthNumber = searchParams.get("billing_month_number");

  if (!billingYear && !billingMonthNumber) {
    return null;
  }

  const year = Number(billingYear);
  const month = Number(billingMonthNumber);

  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 9999 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new DocumentSearchError(
      "billing_year and billing_month_number must be valid"
    );
  }

  return { year, month };
}

function createUtcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function getDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function normalizeSearchText(value: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function createBadRequestResponse(error: DocumentSearchError) {
  return NextResponse.json(
    {
      error:
        error.message,
    },
    { status: 400 }
  );
}

async function searchDeliveries(searchParams: URLSearchParams) {
  const customerId = parsePositiveInteger(
    searchParams.get("customer_id"),
    "customer_id"
  );
  const deliveryNo = normalizeSearchText(
    searchParams.get("delivery_no")
  );
  const deliveryDateFrom = parseDate(
    searchParams.get("delivery_date_from"),
    "delivery_date_from"
  );
  const deliveryDateTo = parseDate(
    searchParams.get("delivery_date_to"),
    "delivery_date_to"
  );
  const hasPeriod = Boolean(deliveryDateFrom || deliveryDateTo);

  if (!deliveryNo && !hasPeriod) {
    throw new DocumentSearchError(
      "delivery search requires delivery_no or delivery period"
    );
  }

  if (hasPeriod && !customerId) {
    throw new DocumentSearchError(
      "customer_id is required when searching deliveries by period"
    );
  }

  const deliveries = await prisma.deliveries.findMany({
    where: {
      pdf_path: {
        not: null,
      },
      pdf_filename: {
        not: null,
      },
      ...(customerId ? { customer_id: customerId } : {}),
      ...(deliveryNo
        ? {
            delivery_no: {
              contains: deliveryNo,
            },
          }
        : {}),
      ...(hasPeriod
        ? {
            delivery_date: {
              ...(deliveryDateFrom
                ? { gte: deliveryDateFrom }
                : {}),
              ...(deliveryDateTo ? { lte: deliveryDateTo } : {}),
            },
          }
        : {}),
    },
    orderBy: [
      {
        delivery_date: "desc",
      },
      {
        id: "desc",
      },
    ],
    take: 100,
    select: {
      id: true,
      pdf_filename: true,
    },
  });

  return deliveries.map((delivery) => ({
    id: delivery.id,
    pdf_filename: delivery.pdf_filename,
    document_type: "delivery" as const,
  }));
}

async function searchInvoices(searchParams: URLSearchParams) {
  const customerId = parsePositiveInteger(
    searchParams.get("customer_id"),
    "customer_id"
  );
  const invoiceNo = normalizeSearchText(
    searchParams.get("invoice_no")
  );
  const billingMonth = parseBillingMonth(searchParams);

  if (!invoiceNo && !billingMonth) {
    throw new DocumentSearchError(
      "invoice search requires invoice_no or billing_month"
    );
  }

  if (!invoiceNo && billingMonth && !customerId) {
    throw new DocumentSearchError(
      "customer_id is required when searching invoices by billing_month"
    );
  }

  const monthStart = !invoiceNo && billingMonth
    ? createUtcDate(billingMonth.year, billingMonth.month, 1)
    : null;
  const monthEnd = !invoiceNo && billingMonth
    ? createUtcDate(
        billingMonth.year,
        billingMonth.month,
        getDaysInMonth(billingMonth.year, billingMonth.month)
      )
    : null;

  const invoices = await prisma.invoices.findMany({
    where: {
      pdf_path: {
        not: null,
      },
      pdf_filename: {
        not: null,
      },
      ...(customerId ? { customer_id: customerId } : {}),
      ...(invoiceNo
        ? {
            OR: [
              {
                invoice_no: {
                  contains: invoiceNo,
                },
              },
              {
                display_invoice_no: {
                  contains: invoiceNo,
                },
              },
            ],
          }
        : {}),
      ...(monthStart && monthEnd
        ? {
            period_end: {
              gte: monthStart,
              lte: monthEnd,
            },
          }
        : {}),
    },
    orderBy: [
      {
        period_end: "desc",
      },
      {
        id: "desc",
      },
    ],
    take: 100,
    select: {
      id: true,
      pdf_filename: true,
    },
  });

  return invoices.map((invoice) => ({
    id: invoice.id,
    pdf_filename: invoice.pdf_filename,
    document_type: "invoice" as const,
  }));
}

export async function GET(request: NextRequest) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  const { searchParams } = new URL(request.url);
  const documentTypeParam = searchParams.get("document_type");
  const documentType =
    documentTypeParam === "deliveries"
      ? "delivery"
      : documentTypeParam === "invoices"
        ? "invoice"
        : (documentTypeParam as DocumentType | null);

  try {
    if (documentType === "delivery") {
      return NextResponse.json({
        documents: await searchDeliveries(searchParams),
      });
    }

    if (documentType === "invoice") {
      return NextResponse.json({
        documents: await searchInvoices(searchParams),
      });
    }

    return NextResponse.json(
      {
        error:
          "document_type must be delivery or invoice",
      },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof DocumentSearchError) {
      return createBadRequestResponse(error);
    }

    console.error("GET /api/documents/search failed", error);

    return NextResponse.json(
      { error: "Failed to search documents" },
      { status: 500 }
    );
  }
}
