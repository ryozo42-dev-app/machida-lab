import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function parseInvoiceIds(body: unknown) {
  if (body === null || typeof body !== "object") {
    return null;
  }

  const invoiceIds = (body as Record<string, unknown>).invoice_ids;

  if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
    return null;
  }

  const parsedIds = invoiceIds.filter(
    (invoiceId): invoiceId is number =>
      Number.isInteger(invoiceId) && invoiceId > 0
  );

  if (parsedIds.length !== invoiceIds.length) {
    return null;
  }

  return [...new Set(parsedIds)];
}

export async function POST(request: Request) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const invoiceIds = parseInvoiceIds(await request.json());

    if (!invoiceIds) {
      return NextResponse.json(
        { error: "invoice_ids must be a non-empty array of positive integers" },
        { status: 400 }
      );
    }

    const result = await prisma.invoices.updateMany({
      where: {
        id: {
          in: invoiceIds,
        },
        issue_source: "auto",
        auto_notice_seen_at: null,
      },
      data: {
        auto_notice_seen_at: new Date(),
      },
    });

    return NextResponse.json({
      updated_count: result.count,
    });
  } catch (error) {
    console.error("Failed to mark auto invoice notices as seen", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}
