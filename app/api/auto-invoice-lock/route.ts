import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { isAutoInvoiceLockHeld } from "@/lib/auto-invoices/auto-invoice-lock";

export async function GET() {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const locked = await isAutoInvoiceLockHeld();

    return NextResponse.json({
      locked,
    });
  } catch (error) {
    console.error("Failed to fetch auto invoice lock status", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}
