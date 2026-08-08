import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const WORK_STATUSES = new Set(["in_progress", "completed"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId: orderIdParam } = await params;
  const orderId = Number(orderIdParam);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  try {
    const body: unknown = await request.json();

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const workStatus = (body as Record<string, unknown>).work_status;

    if (typeof workStatus !== "string" || !WORK_STATUSES.has(workStatus)) {
      return NextResponse.json({ error: "Invalid work_status" }, { status: 400 });
    }

    const updated = await prisma.orders.updateMany({
      where: { id: orderId },
      data: { work_status: workStatus },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ id: orderId, work_status: workStatus });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    console.error("Failed to update work status", error);

    return NextResponse.json({ error: "Database Error" }, { status: 500 });
  }
}