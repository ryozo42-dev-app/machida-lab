import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export async function GET() {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const today = new Date();

    const [taxRates, busRates] = await Promise.all([
      prisma.taxRate.findMany({
        select: {
          id: true,
          tax_rate: true,
          effective_from: true,
          created_at: true,
          updated_at: true,
        },
        orderBy: { effective_from: "desc" },
      }),
      prisma.baseUpSupportRate.findMany({
        select: {
          id: true,
          amount: true,
          effective_from: true,
          created_at: true,
        },
        orderBy: { effective_from: "desc" },
      }),
    ]);

    const taxHistory = taxRates.map((row) => ({
      id: row.id,
      tax_rate: Number(row.tax_rate),
      effective_from: formatDate(row.effective_from),
    }));
    const currentTax =
      taxHistory.find(
        (row) => new Date(row.effective_from) <= today
      ) ?? null;

    const busHistory = busRates.map((row) => ({
      id: row.id,
      amount: row.amount,
      effective_from: formatDate(row.effective_from),
    }));
    const currentBus =
      busHistory.find(
        (row) => new Date(row.effective_from) <= today
      ) ?? null;

    return NextResponse.json({
      tax: {
        current: currentTax,
        history: taxHistory,
      },
      bus: {
        current: currentBus,
        history: busHistory,
      },
    });
  } catch (error) {
    console.error("Failed to fetch invoice settings", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}

function parseEffectiveFrom(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return date;
}

export async function POST(request: Request) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const body = await request.json();

    const type = body.type;

    if (type !== "tax" && type !== "bus") {
      return NextResponse.json(
        { error: "typeはtaxまたはbusを指定してください" },
        { status: 400 }
      );
    }

    const effectiveFrom = parseEffectiveFrom(body.effective_from);

    if (!effectiveFrom) {
      return NextResponse.json(
        { error: "effective_fromはYYYY-MM-DD形式で指定してください" },
        { status: 400 }
      );
    }

    const value = Number(body.value);

    if (type === "tax") {
      if (!Number.isFinite(value) || value < 0 || value > 25) {
        return NextResponse.json(
          { error: "税率は0〜25の範囲で入力してください" },
          { status: 400 }
        );
      }

      const duplicate = await prisma.taxRate.findFirst({
        where: { effective_from: effectiveFrom },
        select: { id: true },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: "同じ適用開始日の設定が既に登録されています。" },
          { status: 409 }
        );
      }

      const created = await prisma.taxRate.create({
        data: {
          tax_rate: value,
          effective_from: effectiveFrom,
        },
        select: {
          id: true,
          tax_rate: true,
          effective_from: true,
        },
      });

      return NextResponse.json(
        {
          id: created.id,
          tax_rate: Number(created.tax_rate),
          effective_from: formatDate(created.effective_from),
        },
        { status: 201 }
      );
    }

    if (!Number.isInteger(value) || value < 0) {
      return NextResponse.json(
        { error: "金額は0以上の整数で入力してください" },
        { status: 400 }
      );
    }

    const duplicate = await prisma.baseUpSupportRate.findFirst({
      where: { effective_from: effectiveFrom },
      select: { id: true },
    });

    if (duplicate) {
      return NextResponse.json(
        { error: "同じ適用開始日の設定が既に登録されています。" },
        { status: 409 }
      );
    }

    const created = await prisma.baseUpSupportRate.create({
      data: {
        amount: value,
        effective_from: effectiveFrom,
      },
      select: {
        id: true,
        amount: true,
        effective_from: true,
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        amount: created.amount,
        effective_from: formatDate(created.effective_from),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create invoice setting", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}

