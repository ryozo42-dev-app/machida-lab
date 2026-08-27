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

function parseDate(value: string | null, fieldName: string) {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvoiceCandidateRequestError(
      `${fieldName} must be YYYY-MM-DD`
    );
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new InvoiceCandidateRequestError(`${fieldName} is invalid`);
  }

  return date;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const customerId = parsePositiveInteger(
      searchParams.get("customer_id"),
      "customer_id"
    );

    const periodStart = parseDate(
      searchParams.get("period_start"),
      "period_start"
    );

    const periodEnd = parseDate(
      searchParams.get("period_end"),
      "period_end"
    );

    if (periodStart.getTime() > periodEnd.getTime()) {
      throw new InvoiceCandidateRequestError(
        "period_start must be before or equal to period_end"
      );
    }

    const customer = await prisma.customers.findUnique({
      where: {
        id: customerId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!customer) {
      throw new InvoiceCandidateRequestError(
        "歯科医院が存在しません",
        404
      );
    }

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
        start: searchParams.get("period_start"),
        end: searchParams.get("period_end"),
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