import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type CountRow = {
  count: bigint | number;
};

function getJstDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function createUtcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function getDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);

  return nextDate;
}

function toCount(rows: CountRow[]) {
  return Number(rows[0]?.count ?? 0);
}

export async function GET() {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const todayParts = getJstDateParts(new Date());
    const today = createUtcDate(
      todayParts.year,
      todayParts.month,
      todayParts.day
    );
    const tomorrow = addDays(today, 1);
    const monthStart = createUtcDate(
      todayParts.year,
      todayParts.month,
      1
    );
    const monthEnd = createUtcDate(
      todayParts.year,
      todayParts.month,
      getDaysInMonth(todayParts.year, todayParts.month)
    );

    const [
      deliveryTomorrowRows,
      unfinishedWorkCount,
      overdueRows,
      ordersThisMonthCount,
    ] = await Promise.all([
      prisma.$queryRaw<CountRow[]>`
        SELECT COUNT(DISTINCT o.id)::int AS count
        FROM orders o
        WHERE o.delivery_date = ${tomorrow}::date
          AND EXISTS (
            SELECT 1
            FROM order_items oi
            LEFT JOIN delivery_items di ON di.order_item_id = oi.id
            WHERE oi.order_id = o.id
              AND di.id IS NULL
          )
      `,
      prisma.orders.count({
        where: {
          work_status: {
            in: ["pending", "in_progress"],
          },
        },
      }),
      prisma.$queryRaw<CountRow[]>`
        SELECT COUNT(DISTINCT o.id)::int AS count
        FROM orders o
        WHERE o.delivery_date < ${today}::date
          AND EXISTS (
            SELECT 1
            FROM order_items oi
            LEFT JOIN delivery_items di ON di.order_item_id = oi.id
            WHERE oi.order_id = o.id
              AND di.id IS NULL
          )
      `,
      prisma.orders.count({
        where: {
          order_date: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
      }),
    ]);

    return NextResponse.json({
      deliveryTomorrowCount: toCount(deliveryTomorrowRows),
      unfinishedWorkCount,
      overdueCount: toCount(overdueRows),
      ordersThisMonthCount,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to fetch dashboard summary", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}
