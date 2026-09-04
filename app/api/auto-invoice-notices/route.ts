import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function formatDate(value: Date | null) {
  if (value === null) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export async function GET() {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const invoices = await prisma.invoices.findMany({
      where: {
        issue_source: "auto",
        auto_notice_seen_at: null,
        pdf_path: {
          not: null,
        },
        pdf_filename: {
          not: null,
        },
        pdf_saved_at: {
          not: null,
        },
      },
      orderBy: [
        {
          auto_issued_at: "asc",
        },
        {
          id: "asc",
        },
      ],
      select: {
        id: true,
        invoice_no: true,
        display_invoice_no: true,
        customer_id: true,
        invoice_date: true,
        auto_issued_at: true,
        pdf_filename: true,
        pdf_saved_at: true,
      },
    });

    const customerIds = [
      ...new Set(invoices.map((invoice) => invoice.customer_id)),
    ];

    const customers =
      customerIds.length > 0
        ? await prisma.customers.findMany({
            where: {
              id: {
                in: customerIds,
              },
            },
            select: {
              id: true,
              name: true,
            },
          })
        : [];

    const customerNameById = new Map(
      customers.map((customer) => [customer.id, customer.name])
    );

    return NextResponse.json({
      notices: invoices.map((invoice) => ({
        invoice_id: invoice.id,
        invoice_no: invoice.invoice_no,
        display_invoice_no: invoice.display_invoice_no,
        customer_id: invoice.customer_id,
        customer_name:
          customerNameById.get(invoice.customer_id) ?? "未登録",
        invoice_date: formatDate(invoice.invoice_date),
        auto_issued_at: invoice.auto_issued_at?.toISOString() ?? null,
        pdf_filename: invoice.pdf_filename,
        pdf_saved_at: invoice.pdf_saved_at?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch auto invoice notices", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}
