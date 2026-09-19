import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function formatDate(date: Date | null) {
  if (!date) {
    return "未設定";
  }

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("/");
}

export async function GET() {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const orders = await prisma.orders.findMany({
      where: { deleted_at: { not: null } },
      orderBy: [{ deleted_at: "desc" }, { id: "desc" }],
      select: {
        id: true,
        customer_id: true,
        patient_id: true,
        delivery_date: true,
        deleted_at: true,
      },
    });

    if (orders.length === 0) {
      return NextResponse.json([]);
    }

    const orderIds = orders.map((order) => order.id);
    const customerIds = [...new Set(orders.map((order) => order.customer_id))];
    const patientIds = [...new Set(orders.map((order) => order.patient_id))];
    const [customers, patients, orderItems] = await Promise.all([
      prisma.customers.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, name: true },
      }),
      prisma.patients.findMany({
        where: { id: { in: patientIds } },
        select: { id: true, patient_name: true },
      }),
      prisma.order_items.findMany({
        where: { order_id: { in: orderIds } },
        orderBy: [{ order_id: "asc" }, { id: "asc" }],
        select: { order_id: true, work_name: true },
      }),
    ]);

    const customerNames = new Map(
      customers.map((customer) => [customer.id, customer.name])
    );
    const patientNames = new Map(
      patients.map((patient) => [patient.id, patient.patient_name])
    );
    const workNamesByOrderId = new Map<number, string[]>();

    for (const item of orderItems) {
      const workName = item.work_name?.trim();

      if (!workName) {
        continue;
      }

      const names = workNamesByOrderId.get(item.order_id) ?? [];
      names.push(workName);
      workNamesByOrderId.set(item.order_id, names);
    }

    return NextResponse.json(
      orders.map((order) => ({
        id: order.id,
        clinic: customerNames.get(order.customer_id) ?? "未登録",
        patient: patientNames.get(order.patient_id) ?? "未登録",
        workType:
          [...new Set(workNamesByOrderId.get(order.id) ?? [])].join("、") ||
          "未登録",
        deliveryDate: formatDate(order.delivery_date),
        deletedAt: order.deleted_at?.toISOString() ?? "",
      }))
    );
  } catch (error) {
    console.error("GET /works/deleted failed", error);
    return NextResponse.json({ error: "削除済み案件の取得に失敗しました" }, { status: 500 });
  }
}
