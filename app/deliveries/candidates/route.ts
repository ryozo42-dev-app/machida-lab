import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parsePositiveInteger(value: string | null, fieldName: string) {
  if (value === null || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return parsed;
}

function parseDateParam(value: string | null) {
  if (value === null || value.trim() === "") {
    return null;
  }

  if (!DATE_PATTERN.test(value)) {
    throw new Error("date must be YYYY-MM-DD");
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("date is invalid");
  }

  return value;
}

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

function addUniquePrice(
  prices: Map<string, Prisma.Decimal>,
  key: string,
  itemId: number,
  price: Prisma.Decimal,
  priceType: string
) {
  if (prices.has(key)) {
    throw new Error(`Multiple ${priceType} prices are configured for item ${itemId}`);
  }

  if (price.lessThan(0)) {
    throw new Error(`${priceType} price must not be negative for item ${itemId}`);
  }

  prices.set(key, price);
}

export async function GET(request: NextRequest) {
  try {
    const customerId = parsePositiveInteger(
      request.nextUrl.searchParams.get("customer_id"),
      "customer_id"
    );
    const requestedDate = parseDateParam(request.nextUrl.searchParams.get("date"));

    const allOrders = await prisma.orders.findMany({
      where: {
        work_status: "completed",
        billed: false,
        ...(customerId === null ? {} : { customer_id: customerId }),
      },
      orderBy: [{ delivery_date: "asc" }, { id: "asc" }],
    });
    const filteredOrders = allOrders.filter((order) => {
      if (requestedDate === null) {
        return true;
      }

      if (order.delivery_date === null) {
        return false;
      }

      return formatDate(order.delivery_date) === requestedDate;
    });

    if (filteredOrders.length === 0) {
      return NextResponse.json([]);
    }

    const orderIds = filteredOrders.map((order) => order.id);
    const orderById = new Map(filteredOrders.map((order) => [order.id, order]));
    const customerIds = [...new Set(filteredOrders.map((order) => order.customer_id))];
    const patientIds = [...new Set(filteredOrders.map((order) => order.patient_id))];
    const [orderItems, customers, patients, orderTeeth] = await Promise.all([
      prisma.order_items.findMany({
        where: {
          order_id: {
            in: orderIds,
          },
          delivery_items: {
            is: null,
},
        },
        orderBy: [{ order_id: "asc" }, { id: "asc" }],
      }),
      prisma.customers.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, name: true },
      }),
      prisma.patients.findMany({
        where: { id: { in: patientIds } },
        select: { id: true, patient_name: true },
      }),
      prisma.order_teeth.findMany({
        where: {
          order_id: {
            in: orderIds,
          },
        },
        orderBy: [{ order_id: "asc" }, { id: "asc" }],
      }),
    ]);

    if (orderItems.length === 0) {
      return NextResponse.json([]);
    }

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

    const [insuranceItems, privateItems, insurancePriceRows, privatePriceRows] =
      await Promise.all([
        insuranceItemIds.length === 0
          ? Promise.resolve([] as Array<{ id: number; item_name: string }>)
          : prisma.$queryRawUnsafe<Array<{ id: number; item_name: string }>>(
              `
                SELECT
                  iim.id,
                  CONCAT_WS(' ', NULLIF(TRIM(iisc.name), ''), NULLIF(TRIM(iim.name), '')) AS item_name
                FROM insurance_item_masters iim
                LEFT JOIN insurance_sub_categories iisc ON iisc.id = iim.sub_category_id
                WHERE iim.id = ANY($1)
              `,
              insuranceItemIds
            ),
        prisma.private_items.findMany({
          where: {
            id: {
              in: privateItemIds,
            },
          },
          select: {
            id: true,
            item_name: true,
            standard_price: true,
          },
        }),
        prisma.customer_insurance_prices.findMany({
          where: {
            customer_id: {
              in: customerIds,
            },
            insurance_item_id: {
              in: insuranceItemIds,
            },
          },
          select: {
            customer_id: true,
            insurance_item_id: true,
            price: true,
          },
        }),
        prisma.customer_private_prices.findMany({
          where: {
            customer_id: {
              in: customerIds,
            },
            private_item_id: {
              in: privateItemIds,
            },
          },
          select: {
            customer_id: true,
            private_item_id: true,
            price: true,
          },
        }),
      ]);

    const customerNames = new Map(customers.map((customer) => [customer.id, customer.name]));
    const patientNames = new Map(patients.map((patient) => [patient.id, patient.patient_name]));
    const insuranceNames = new Map(insuranceItems.map((item) => [item.id, item.item_name]));
    const privateNames = new Map(privateItems.map((item) => [item.id, item.item_name]));
    const standardPrivatePrices = new Map(
      privateItems.flatMap((item) =>
        item.standard_price === null ? [] : [[item.id, item.standard_price] as const]
      )
    );

    const insurancePriceByKey = new Map<string, Prisma.Decimal>();
    const privatePriceByKey = new Map<string, Prisma.Decimal>();

    for (const row of insurancePriceRows) {
      const key = `${row.customer_id}:${row.insurance_item_id}`;
      addUniquePrice(
        insurancePriceByKey,
        key,
        row.insurance_item_id,
        row.price,
        "customer insurance"
      );
    }

    for (const row of privatePriceRows) {
      const key = `${row.customer_id}:${row.private_item_id}`;
      addUniquePrice(
        privatePriceByKey,
        key,
        row.private_item_id,
        row.price,
        "customer private"
      );
    }

    const teethByOrderId = orderTeeth.reduce<Map<number, string[]>>((acc, tooth) => {
      const current = acc.get(tooth.order_id) ?? [];
      current.push(tooth.tooth_no);
      acc.set(tooth.order_id, current);
      return acc;
    }, new Map<number, string[]>());

    const candidates = orderItems.map((item) => {
      const order = orderById.get(item.order_id);

      if (!order) {
        throw new Error(`Order ${item.order_id} not found`);
      }

      const hasInsuranceItem = item.insurance_item_id !== null;
      const hasPrivateItem = item.private_item_id !== null;

      if (hasInsuranceItem === hasPrivateItem) {
        throw new Error(`order_item ${item.id} must reference exactly one work item`);
      }

      const quantity = item.quantity ?? 1;
      const insurancePriceKey = `${order.customer_id}:${item.insurance_item_id}`;
      const privatePriceKey = `${order.customer_id}:${item.private_item_id}`;
      const unitPrice = hasInsuranceItem
        ? insurancePriceByKey.get(insurancePriceKey)
        : privatePriceByKey.get(privatePriceKey) ??
          standardPrivatePrices.get(item.private_item_id as number);
      const amount = unitPrice ? unitPrice.mul(quantity) : null;

      return {
        order_item_id: item.id,
        order_id: order.id,
        order_no: order.order_no ?? "",
        customer_id: order.customer_id,
        customer_name: customerNames.get(order.customer_id) ?? "未登録",
        patient_id: order.patient_id,
        patient_name: patientNames.get(order.patient_id) ?? "未登録",
        work_type_name:
          item.work_name?.trim() ||
          (hasInsuranceItem
            ? insuranceNames.get(item.insurance_item_id as number) ?? "未登録"
            : privateNames.get(item.private_item_id as number) ?? "未登録"),
        tooth_numbers: teethByOrderId.get(order.id) ?? [],
        delivery_date: order.delivery_date ? formatDate(order.delivery_date) : null,
        quantity,
        unit_price_preview: unitPrice ? unitPrice.toString() : null,
        amount_preview: amount ? amount.toString() : null,
        remarks: order.remarks ?? "",
        work_status: order.work_status,
        billed: order.billed ?? false,
      };
    });

    return NextResponse.json(candidates);
  } catch (error) {
    console.error("Failed to fetch delivery candidates", error);

    if (
      error instanceof Error &&
      (error.message.includes("must be") || error.message.includes("invalid"))
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Database Error" }, { status: 500 });
  }
}
