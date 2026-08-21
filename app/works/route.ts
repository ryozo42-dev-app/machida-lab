import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function formatDate(date: Date, separator = "-") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}${separator}${values.month}${separator}${values.day}`;
}

function formatToothNumber(toothNumber: string) {
  if (!/^[1-8][1-8]$/.test(toothNumber)) {
    return toothNumber;
  }

  const quadrant = Number(toothNumber[0]);
  const position = Number(toothNumber[1]);
  const isDeciduous = quadrant >= 5;
  const jaw = [1, 2, 5, 6].includes(quadrant) ? "上顎" : "下顎";
  const side = [1, 4, 5, 8].includes(quadrant) ? "右" : "左";
  const deciduousTooth = ["", "A", "B", "C", "D", "E"][position];

  return `${jaw} ${side} ${isDeciduous ? deciduousTooth ?? position : position}`;
}

export async function GET() {
  try {
    const orders = await prisma.orders.findMany({
      where: {
        work_status: {
          in: ["pending", "in_progress"],
        },
      },
      orderBy: [{ delivery_date: "asc" }, { id: "asc" }],
    });

    if (orders.length === 0) {
      return NextResponse.json([]);
    }

    const orderIds = orders.map((order) => order.id);
    const customerIds = [...new Set(orders.map((order) => order.customer_id))];
    const patientIds = [...new Set(orders.map((order) => order.patient_id))];

    const [customers, patients, orderItems, orderTeeth, orderFiles] =
      await Promise.all([
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
          orderBy: { id: "asc" },
        }),
        prisma.order_teeth.findMany({
          where: { order_id: { in: orderIds } },
          orderBy: { id: "asc" },
        }),
        prisma.order_files.findMany({
          where: { order_id: { in: orderIds } },
          orderBy: { id: "asc" },
        }),
      ]);

    const insuranceItemIds = [
      ...new Set(
        orderItems.flatMap((item) =>
          item.insurance_item_id === null ? [] : [item.insurance_item_id]
        )
      ),
    ];

    const privateItemIds = [
      ...new Set(
        orderItems.flatMap((item) =>
          item.private_item_id === null ? [] : [item.private_item_id]
        )
      ),
    ];

    const [insuranceItemMasters, privateItems] = await Promise.all([
      insuranceItemIds.length === 0
        ? Promise.resolve([] as Array<{ id: number; name: string }>)
        : prisma.$queryRawUnsafe<Array<{ id: number; name: string }>>(
            "SELECT id, name FROM insurance_item_masters WHERE id = ANY($1)",
            insuranceItemIds
          ),
      prisma.private_items.findMany({
        where: { id: { in: privateItemIds } },
        select: { id: true, item_name: true },
      }),
    ]);

    const customerNames = new Map(
      customers.map((customer) => [customer.id, customer.name])
    );

    const patientNames = new Map(
      patients.map((patient) => [patient.id, patient.patient_name])
    );

    const insuranceItemNames = new Map(
      insuranceItemMasters.map((item) => [item.id, item.name])
    );

    const privateItemNames = new Map(
      privateItems.map((item) => [item.id, item.item_name])
    );

    const bridgeByOrderId = new Map<number, boolean>();

    for (const tooth of orderTeeth) {
      const current = bridgeByOrderId.get(tooth.order_id) ?? false;
      if (tooth.is_bridge) {
        bridgeByOrderId.set(tooth.order_id, true);
      } else if (!current) {
        bridgeByOrderId.set(tooth.order_id, false);
      }
    }

    const records = orders.map((order) => {
      const items = orderItems.filter((item) => item.order_id === order.id);

      const workTypes = items.flatMap((item) => {
        if (item.insurance_item_id !== null) {
          return insuranceItemNames.get(item.insurance_item_id) ?? [];
        }

        if (item.private_item_id !== null) {
          return privateItemNames.get(item.private_item_id) ?? [];
        }

        return [];
      });

      const teeth = orderTeeth
        .filter((tooth) => tooth.order_id === order.id)
        .map((tooth) => formatToothNumber(tooth.tooth_no));

      const pdf = orderFiles.find((file) => file.order_id === order.id);
      const isBridge = bridgeByOrderId.get(order.id) ?? false;

      return {
        id: order.id,
        orderNo: order.order_no ?? "",
        customerId: order.customer_id,
        clinic: customerNames.get(order.customer_id) ?? "未登録",
        patient: patientNames.get(order.patient_id) ?? "未登録",
        workType: [...new Set(workTypes)].join("、") || "未登録",
        deliveryDate: order.delivery_date
          ? formatDate(order.delivery_date, "/")
          : "未設定",
        tooth: teeth.join("、") || "未登録",
        memo: order.remarks ?? "",
        workStatus: order.work_status,
        completed: order.work_status === "completed",
        pdfUrl: pdf ? `/works/files/${pdf.id}` : null,
        isBridge,
      };
    });

    return NextResponse.json(records);
  } catch (error) {
    console.error("Failed to fetch work records", error);

    return NextResponse.json({ error: "Database Error" }, { status: 500 });
  }
}