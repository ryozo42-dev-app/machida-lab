import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

class InvoiceCandidateRequestError extends Error {
  constructor(
    message: string,
    readonly status: number = 400
  ) {
    super(message);
  }
}

function parsePositiveInteger(value: string | null, fieldName: string) {
  if (value === null) {
    throw new InvoiceCandidateRequestError(`${fieldName} is required`);
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvoiceCandidateRequestError(
      `${fieldName} must be a positive integer`
    );
  }

  return parsed;
}

function parseBillingYear(value: string | null) {
  if (value === null) {
    throw new InvoiceCandidateRequestError(
      "billing_year is required"
    );
  }

  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 1900 ||
    parsed > 9999
  ) {
    throw new InvoiceCandidateRequestError(
      "billing_year must be a valid year"
    );
  }

  return parsed;
}

function parseBillingMonth(value: string | null) {
  if (value === null) {
    throw new InvoiceCandidateRequestError(
      "billing_month is required"
    );
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
    throw new InvoiceCandidateRequestError(
      "billing_month must be 1-12"
    );
  }

  return parsed;
}

function createUtcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function getDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

type CustomerClosingSettings = {
  billing_closing_day: number | null;
  billing_closing_month_end: boolean;
};

function calculateBillingPeriod(
  customer: CustomerClosingSettings,
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
    };
  }

  const closingDay = customer.billing_closing_day;

  if (
    closingDay === null ||
    !Number.isInteger(closingDay) ||
    closingDay < 1 ||
    closingDay > 31
  ) {
    throw new InvoiceCandidateRequestError(
      "請求締日設定が不正です",
      409
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
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const customerId = parsePositiveInteger(
      searchParams.get("customer_id"),
      "customer_id"
    );

    const billingYear = parseBillingYear(
      searchParams.get("billing_year")
    );
    const billingMonth = parseBillingMonth(
      searchParams.get("billing_month")
    );

    const customer = await prisma.customers.findUnique({
      where: {
        id: customerId,
      },
      select: {
        id: true,
        name: true,
        billing_closing_day: true,
        billing_closing_month_end: true,
      },
    });

    if (!customer) {
      throw new InvoiceCandidateRequestError(
        "歯科医院が存在しません",
        404
      );
    }

    const { periodStart, periodEnd } = calculateBillingPeriod(
      customer,
      billingYear,
      billingMonth
    );

    /*
     * すでに invoice_deliveries に登録されている納品書は
     * 請求対象から除外する。
     *
     * invoice_deliveries.delivery_id には UNIQUE 制約もあるため、
     * 最終的な二重請求防止はDB側でも行われる。
     */
    const alreadyInvoicedDeliveryRows =
      await prisma.invoice_deliveries.findMany({
        select: {
          delivery_id: true,
        },
      });

    const alreadyInvoicedDeliveryIds =
      alreadyInvoicedDeliveryRows.map((row) => row.delivery_id);

    const deliveries = await prisma.deliveries.findMany({
      where: {
        customer_id: customerId,

        delivery_date: {
          gte: periodStart,
          lte: periodEnd,
        },

        ...(alreadyInvoicedDeliveryIds.length > 0
          ? {
              id: {
                notIn: alreadyInvoicedDeliveryIds,
              },
            }
          : {}),
      },

      include: {
        delivery_items: {
          orderBy: {
            id: "asc",
          },
        },
      },

      orderBy: [
        {
          delivery_date: "asc",
        },
        {
          id: "asc",
        },
      ],
    });

    const result = deliveries.map((delivery) => ({
      id: delivery.id,
      delivery_no: delivery.delivery_no,
      customer_id: delivery.customer_id,
      customer_name: customer.name,
      delivery_date: delivery.delivery_date,

      total_amount: delivery.total_amount,
      tax_rate: delivery.tax_rate,
      tax_amount: delivery.tax_amount,
      total_amount_including_tax:
        delivery.total_amount_including_tax,

      item_count: delivery.delivery_items.length,

      delivery_items: delivery.delivery_items.map((item) => ({
        id: item.id,
        order_item_id: item.order_item_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
      })),
    }));

    return NextResponse.json({
      customer: {
        id: customer.id,
        name: customer.name,
      },

      period: {
        start: formatDate(periodStart),
        end: formatDate(periodEnd),
      },

      count: result.length,

      deliveries: result,
    });
  } catch (error) {
    if (error instanceof InvoiceCandidateRequestError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: error.status,
        }
      );
    }

    console.error(
      "GET /api/invoices/candidates failed",
      error
    );

    return NextResponse.json(
      {
        error: "Database Error",
      },
      {
        status: 500,
      }
    );
  }
}
