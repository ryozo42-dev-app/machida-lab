import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { requireAuthResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function formatDate(date: Date, separator = "-") {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}${separator}${month}${separator}${day}`;
}

// app/api/invoices/route.ts の formatMaterialQuantity/formatMaterialLabel と同一表示にする
function formatMaterialQuantity(value: Prisma.Decimal) {
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 3,
  }).format(Number(value));
}

function formatMaterialLabel(name: string) {
  if (name.includes("ミロ")) {
    return "ミロ";
  }

  if (name.includes("パラ") || name.includes("金銀パラジウム")) {
    return "パラ";
  }

  return name;
}

// app/deliveries/[id]/pdf/route.ts の toDepositMaterialType と同一判定
function toDepositMaterialType(name: string): "para" | "miro" | null {
  if (name.includes("パラ")) {
    return "para";
  }

  if (name.includes("ミロ")) {
    return "miro";
  }

  return null;
}

type HistoryItem = {
  patient_name: string;
  work_name: string;
  tooth_numbers: string[];
  material_usage_text: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
};

export async function GET(request: Request) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  const customerIdParam = url.searchParams.get("customer_id");
  const patientIdParam = url.searchParams.get("patient_id");

  const customerId = Number(customerIdParam);
  const patientId = Number(patientIdParam);

  if (
    !customerIdParam ||
    !Number.isInteger(customerId) ||
    customerId <= 0
  ) {
    return NextResponse.json(
      { error: "customer_id is required" },
      { status: 400 }
    );
  }

  if (
    !patientIdParam ||
    !Number.isInteger(patientId) ||
    patientId <= 0
  ) {
    return NextResponse.json(
      { error: "patient_id is required" },
      { status: 400 }
    );
  }

  try {
    const patient = await prisma.patients.findUnique({
      where: { id: patientId },
      select: { id: true, customer_id: true, patient_name: true },
    });

    if (!patient || patient.customer_id !== customerId) {
      return NextResponse.json(
        { error: "Patient not found" },
        { status: 404 }
      );
    }

    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setFullYear(fromDate.getFullYear() - 2);

    const emptyResponse = {
      patient: { id: patient.id, name: patient.patient_name },
      from_date: formatDate(fromDate),
      to_date: formatDate(today),
      groups: [] as Array<{ delivery_date: string; items: HistoryItem[] }>,
    };

    const orders = await prisma.orders.findMany({
      where: { customer_id: customerId, patient_id: patientId },
      select: { id: true },
    });

    const orderIds = orders.map((order) => order.id);

    if (orderIds.length === 0) {
      return NextResponse.json(emptyResponse);
    }

    const orderItems = await prisma.order_items.findMany({
      where: { order_id: { in: orderIds } },
      select: {
        id: true,
        order_id: true,
        work_name: true,
        insurance_item_id: true,
        private_item_id: true,
        private_item_master_id: true,
      },
    });

    const orderItemById = new Map(
      orderItems.map((item) => [item.id, item])
    );
    const orderItemIds = orderItems.map((item) => item.id);

    if (orderItemIds.length === 0) {
      return NextResponse.json(emptyResponse);
    }

    const deliveryItems = await prisma.delivery_items.findMany({
      where: { order_item_id: { in: orderItemIds } },
      select: {
        delivery_id: true,
        order_item_id: true,
        quantity: true,
        unit_price: true,
        amount: true,
      },
    });

    if (deliveryItems.length === 0) {
      return NextResponse.json(emptyResponse);
    }

    const deliveryIds = [
      ...new Set(deliveryItems.map((item) => item.delivery_id)),
    ];

    const deliveries = await prisma.deliveries.findMany({
      where: { id: { in: deliveryIds }, delivery_date: { gte: fromDate } },
      select: { id: true, delivery_date: true },
    });

    const deliveryDateById = new Map(
      deliveries.map((delivery) => [delivery.id, delivery.delivery_date])
    );

    const relevantDeliveryItems = deliveryItems.filter((item) =>
      deliveryDateById.has(item.delivery_id)
    );

    if (relevantDeliveryItems.length === 0) {
      return NextResponse.json(emptyResponse);
    }

    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      select: { show_material_on_delivery: true },
    });

    const relevantOrderItemIds = [
      ...new Set(relevantDeliveryItems.map((item) => item.order_item_id)),
    ];
    const relevantOrderIds = [
      ...new Set(
        relevantOrderItemIds.flatMap((id) => {
          const orderId = orderItemById.get(id)?.order_id;
          return orderId === undefined ? [] : [orderId];
        })
      ),
    ];
    const insuranceItemIds = [
      ...new Set(
        relevantOrderItemIds.flatMap((id) => {
          const value = orderItemById.get(id)?.insurance_item_id;
          return value === null || value === undefined ? [] : [value];
        })
      ),
    ];
    const privateItemIds = [
      ...new Set(
        relevantOrderItemIds.flatMap((id) => {
          const value = orderItemById.get(id)?.private_item_id;
          return value === null || value === undefined ? [] : [value];
        })
      ),
    ];
    const privateItemMasterIds = [
      ...new Set(
        relevantOrderItemIds.flatMap((id) => {
          const value = orderItemById.get(id)?.private_item_master_id;
          return value === null || value === undefined ? [] : [value];
        })
      ),
    ];

    const [
      orderTeeth,
      insuranceItemMasters,
      privateItems,
      privateItemMasters,
      materialTransactions,
    ] = await Promise.all([
      prisma.order_teeth.findMany({
        where: { order_id: { in: relevantOrderIds } },
        select: { order_id: true, tooth_no: true },
        orderBy: { id: "asc" },
      }),
      insuranceItemIds.length === 0
        ? Promise.resolve([])
        : prisma.insurance_item_masters.findMany({
            where: { id: { in: insuranceItemIds } },
            select: {
              id: true,
              name: true,
              insurance_sub_categories: { select: { name: true } },
            },
          }),
      privateItemIds.length === 0
        ? Promise.resolve([])
        : prisma.private_items.findMany({
            where: { id: { in: privateItemIds } },
            select: { id: true, item_name: true },
          }),
      privateItemMasterIds.length === 0
        ? Promise.resolve([])
        : prisma.private_item_masters.findMany({
            where: { id: { in: privateItemMasterIds } },
            select: { id: true, name: true },
          }),
      customer?.show_material_on_delivery
        ? prisma.customer_deposit_material_transactions.findMany({
            where: {
              order_item_id: { in: relevantOrderItemIds },
              transaction_type: { in: ["use", "use_reversal"] },
            },
            select: {
              order_item_id: true,
              transaction_type: true,
              quantity: true,
              customer_deposit_materials: {
                select: { materials: { select: { name: true } } },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const teethByOrderId = orderTeeth.reduce<Map<number, string[]>>(
      (acc, tooth) => {
        const current = acc.get(tooth.order_id) ?? [];
        current.push(tooth.tooth_no);
        acc.set(tooth.order_id, current);
        return acc;
      },
      new Map<number, string[]>()
    );

    const insuranceNameById = new Map(
      insuranceItemMasters.map((item) => {
        const name = [item.insurance_sub_categories.name, item.name]
          .map((part) => part.trim())
          .filter((part) => part.length > 0)
          .join(" ");

        return [item.id, name];
      })
    );
    const privateNameById = new Map(
      privateItems.map((item) => [item.id, item.item_name])
    );
    const privateMasterNameById = new Map(
      privateItemMasters.map((item) => [item.id, item.name])
    );

    const materialUsageByOrderItemId = new Map<
      number,
      Map<string, Prisma.Decimal>
    >();

    for (const transaction of materialTransactions) {
      if (transaction.order_item_id === null) {
        continue;
      }

      const materialName =
        transaction.customer_deposit_materials.materials.name;
      const materialType = toDepositMaterialType(materialName);

      if (materialType === null) {
        continue;
      }

      const label = formatMaterialLabel(materialName);
      const current =
        materialUsageByOrderItemId.get(transaction.order_item_id) ??
        new Map<string, Prisma.Decimal>();
      const currentQuantity =
        current.get(label) ?? new Prisma.Decimal(0);

      const nextQuantity =
        transaction.transaction_type === "use"
          ? currentQuantity.add(transaction.quantity)
          : transaction.transaction_type === "use_reversal"
            ? currentQuantity.sub(transaction.quantity)
            : currentQuantity;

      current.set(label, nextQuantity);
      materialUsageByOrderItemId.set(transaction.order_item_id, current);
    }

    const groupsByDate = new Map<string, HistoryItem[]>();

    for (const deliveryItem of relevantDeliveryItems) {
      const orderItem = orderItemById.get(deliveryItem.order_item_id);

      if (!orderItem) {
        continue;
      }

      const deliveryDate = deliveryDateById.get(deliveryItem.delivery_id);

      if (!deliveryDate) {
        continue;
      }

      const workName =
        orderItem.work_name?.trim() ||
        (orderItem.insurance_item_id !== null
          ? insuranceNameById.get(orderItem.insurance_item_id) ?? "未登録"
          : orderItem.private_item_id !== null
            ? privateNameById.get(orderItem.private_item_id) ?? "未登録"
            : orderItem.private_item_master_id !== null
              ? privateMasterNameById.get(
                  orderItem.private_item_master_id
                ) ?? "未登録"
              : "未登録");

      const toothNumbers = teethByOrderId.get(orderItem.order_id) ?? [];

      const materialUsage = materialUsageByOrderItemId.get(orderItem.id);
      const materialUsageText = materialUsage
        ? [...materialUsage.entries()]
            .filter(([, quantity]) => quantity.greaterThan(0))
            .map(
              ([label, quantity]) =>
                `${label} ${formatMaterialQuantity(quantity)}g`
            )
            .join("\n")
        : "";

      const dateKey = formatDate(deliveryDate);
      const items = groupsByDate.get(dateKey) ?? [];

      items.push({
        patient_name: patient.patient_name,
        work_name: workName,
        tooth_numbers: toothNumbers,
        material_usage_text: materialUsageText || null,
        quantity: deliveryItem.quantity,
        unit_price: Number(deliveryItem.unit_price),
        amount: Number(deliveryItem.amount),
      });

      groupsByDate.set(dateKey, items);
    }

    const groups = [...groupsByDate.entries()]
      .sort(([first], [second]) => (first < second ? 1 : first > second ? -1 : 0))
      .map(([delivery_date, items]) => ({ delivery_date, items }));

    return NextResponse.json({
      patient: { id: patient.id, name: patient.patient_name },
      from_date: formatDate(fromDate),
      to_date: formatDate(today),
      groups,
    });
  } catch (error) {
    console.error("Failed to fetch patient history", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}
