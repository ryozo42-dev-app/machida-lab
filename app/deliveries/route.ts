import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { requireAuthResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type DeliveryItemRequest = {
  order_item_id: number;
  quantity: number;
};

class DeliveryRequestError extends Error {
  constructor(
    message: string,
    readonly status: number = 400
  ) {
    super(message);
  }
}

function parsePositiveInteger(value: unknown, fieldName: string) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new DeliveryRequestError(`${fieldName} must be a positive integer`);
  }

  return parsed;
}

function parseDeliveryDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DeliveryRequestError("delivery_date must be YYYY-MM-DD");
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new DeliveryRequestError("delivery_date is invalid");
  }

  return date;
}

function parseDeliveryItems(value: unknown): DeliveryItemRequest[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new DeliveryRequestError("items must contain at least one item");
  }

  const items = value.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new DeliveryRequestError(`items[${index}] is invalid`);
    }

    const input = item as Record<string, unknown>;

    return {
      order_item_id: parsePositiveInteger(
        input.order_item_id,
        `items[${index}].order_item_id`
      ),
      quantity: parsePositiveInteger(input.quantity, `items[${index}].quantity`),
    };
  });

  if (new Set(items.map((item) => item.order_item_id)).size !== items.length) {
    throw new DeliveryRequestError("order_item_id must be unique within a delivery");
  }

  return items;
}

function formatDate(date: Date, separator = "") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}${separator}${values.month}${separator}${values.day}`;
}

function createNextDeliveryNo(deliveryDate: Date, existingDeliveryNos: string[]) {
  const dateKey = formatDate(deliveryDate);
  const prefix = `DEL-${dateKey}-`;
  const pattern = new RegExp(`^${prefix}(\\d+)$`);

  const maxSequence = existingDeliveryNos.reduce((max, value) => {
    const match = value.match(pattern);

    if (!match) {
      return max;
    }

    const sequence = Number(match[1]);

    if (!Number.isInteger(sequence) || sequence <= max) {
      return max;
    }

    return sequence;
  }, 0);

  return `${prefix}${String(maxSequence + 1).padStart(3, "0")}`;
}

function addUniquePrice(
  prices: Map<number, Prisma.Decimal>,
  itemId: number,
  price: Prisma.Decimal,
  priceType: string
) {
  if (prices.has(itemId)) {
    throw new DeliveryRequestError(
      `Multiple ${priceType} prices are configured for item ${itemId}`,
      409
    );
  }

  if (price.lessThan(0)) {
    throw new DeliveryRequestError(
      `${priceType} price must not be negative for item ${itemId}`,
      409
    );
  }

  prices.set(itemId, price);
}

export async function GET() {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const deliveries = await prisma.deliveries.findMany({
      include: {
        delivery_items: {
          orderBy: {
            id: "asc",
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    });

    return NextResponse.json(deliveries);
  } catch (error) {
    console.error("Failed to fetch deliveries", error);

    return NextResponse.json({ error: "Database Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const parsedBody: unknown = await request.json();

    if (
      typeof parsedBody !== "object" ||
      parsedBody === null ||
      Array.isArray(parsedBody)
    ) {
      throw new DeliveryRequestError("Request body must be an object");
    }

    const body = parsedBody as Record<string, unknown>;
    const customerId = parsePositiveInteger(body.customer_id, "customer_id");
    const deliveryDate = parseDeliveryDate(body.delivery_date);
    const items = parseDeliveryItems(body.items);

    const delivery = await prisma.$transaction(
      async (transaction) => {
        const orderItemIds = items.map((item) => item.order_item_id);
        const requestedQuantityByOrderItemId = new Map(
          items.map((item) => [item.order_item_id, item.quantity])
        );
        const orderItems = await transaction.order_items.findMany({
          where: {
            id: {
              in: orderItemIds,
            },
          },
          select: {
            id: true,
            order_id: true,
            insurance_item_id: true,
            private_item_id: true,
            quantity: true,
          },
        });

        if (orderItems.length !== orderItemIds.length) {
          throw new DeliveryRequestError("指定された受注明細が存在しません", 409);
        }

        const deliveredOrderItems = await transaction.delivery_items.findMany({
          where: {
            order_item_id: {
              in: orderItemIds,
            },
          },
          select: {
            order_item_id: true,
          },
        });

        if (deliveredOrderItems.length > 0) {
          throw new DeliveryRequestError(
            "すでに納品済みの受注が含まれています。画面を更新してください。",
            409
          );
        }

        const orders = await transaction.orders.findMany({
          where: {
            id: {
              in: [...new Set(orderItems.map((item) => item.order_id))],
            },
          },
          select: {
            id: true,
            customer_id: true,
            work_status: true,
            billed: true,
          },
        });

        if (orders.length !== new Set(orderItems.map((item) => item.order_id)).size) {
          throw new DeliveryRequestError("対象受注が存在しません", 409);
        }

        for (const order of orders) {
          if (order.work_status !== "completed") {
            throw new DeliveryRequestError(
              "作業完了していない受注が含まれています",
              409
            );
          }

          if (order.billed ?? false) {
            throw new DeliveryRequestError("請求済みの受注は納品確定できません", 409);
          }

          if (order.customer_id !== customerId) {
            throw new DeliveryRequestError(
              "異なる歯科医院の受注を同じ納品書に混在できません",
              409
            );
          }
        }

        for (const orderItem of orderItems) {
          if (orderItem.quantity === null || orderItem.quantity <= 0) {
            throw new DeliveryRequestError(
              `order_item ${orderItem.id} の数量が不正です`,
              409
            );
          }

          const requested = requestedQuantityByOrderItemId.get(orderItem.id) ?? 0;

          if (requested !== orderItem.quantity) {
            throw new DeliveryRequestError(
              `order_item ${orderItem.id} の数量が最新状態と一致しません。画面を更新してください。`,
              409
            );
          }
        }

        const insuranceItemIds = orderItems.flatMap((item) =>
          item.insurance_item_id === null ? [] : [item.insurance_item_id]
        );
        const privateItemIds = orderItems.flatMap((item) =>
          item.private_item_id === null ? [] : [item.private_item_id]
        );
        const [insurancePriceRows, privatePriceRows, privateItems] =
          await Promise.all([
            transaction.customer_insurance_prices.findMany({
              where: {
                customer_id: customerId,
                insurance_item_id: {
                  in: insuranceItemIds,
                },
              },
              select: {
                insurance_item_id: true,
                price: true,
              },
            }),
            transaction.customer_private_prices.findMany({
              where: {
                customer_id: customerId,
                private_item_id: {
                  in: privateItemIds,
                },
              },
              select: {
                private_item_id: true,
                price: true,
              },
            }),
            transaction.private_items.findMany({
              where: {
                id: {
                  in: privateItemIds,
                },
              },
              select: {
                id: true,
                standard_price: true,
              },
            }),
          ]);
        const insurancePrices = new Map<number, Prisma.Decimal>();
        const privatePrices = new Map<number, Prisma.Decimal>();
        const standardPrivatePrices = new Map(
          privateItems.flatMap((item) =>
            item.standard_price === null ? [] : [[item.id, item.standard_price] as const]
          )
        );

        for (const row of insurancePriceRows) {
          addUniquePrice(
            insurancePrices,
            row.insurance_item_id,
            row.price,
            "customer insurance"
          );
        }

        for (const row of privatePriceRows) {
          addUniquePrice(
            privatePrices,
            row.private_item_id,
            row.price,
            "customer private"
          );
        }

        const resolvedItems = orderItems.map((orderItem) => {
          const hasInsuranceItem = orderItem.insurance_item_id !== null;
          const hasPrivateItem = orderItem.private_item_id !== null;

          if (hasInsuranceItem === hasPrivateItem) {
            throw new DeliveryRequestError(
              `order_item ${orderItem.id} の作業内容設定が不正です`,
              409
            );
          }

          const unitPrice = hasInsuranceItem
            ? insurancePrices.get(orderItem.insurance_item_id as number)
            : privatePrices.get(orderItem.private_item_id as number) ??
              standardPrivatePrices.get(orderItem.private_item_id as number);

          if (unitPrice === undefined) {
            throw new DeliveryRequestError(
              `order_item ${orderItem.id} の単価が設定されていません`,
              409
            );
          }

          if (unitPrice.lessThan(0)) {
            throw new DeliveryRequestError(
              `order_item ${orderItem.id} の単価が不正です`,
              409
            );
          }

          const quantity = orderItem.quantity as number;

          return {
            order_item_id: orderItem.id,
            quantity,
            unit_price: unitPrice,
            amount: unitPrice.mul(quantity),
          };
        });
        const totalAmount = resolvedItems.reduce(
          (total, item) => total.add(item.amount),
          new Prisma.Decimal(0)
        );
        const applicableTaxRate = await transaction.taxRate.findFirst({
          where: {
            effective_from: {
              lte: deliveryDate,
            },
          },
          orderBy: {
            effective_from: "desc",
          },
          select: {
            tax_rate: true,
          },
        });

        if (!applicableTaxRate) {
          throw new DeliveryRequestError("納品日に適用可能な税率設定がありません", 409);
        }

        const taxRate = applicableTaxRate.tax_rate;
        const taxAmount = totalAmount
          .mul(taxRate)
          .div(100)
          .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
        const totalAmountIncludingTax = totalAmount.add(taxAmount);

        const existingDeliveryNos = await transaction.deliveries.findMany({
          where: {
            delivery_date: deliveryDate,
            delivery_no: {
              startsWith: `DEL-${formatDate(deliveryDate)}-`,
            },
          },
          select: {
            delivery_no: true,
          },
        });
        const nextDeliveryNo = createNextDeliveryNo(
          deliveryDate,
          existingDeliveryNos.flatMap((row) => (row.delivery_no ? [row.delivery_no] : []))
        );

        const customer = await transaction.customers.findUnique({
          where: {
            id: customerId,
          },
          select: {
            id: true,
            name: true,
          },
        });

        if (!customer) {
          throw new DeliveryRequestError("歯科医院が存在しません", 409);
        }

        const createdDelivery = await transaction.deliveries.create({
          data: {
            delivery_no: nextDeliveryNo,
            customer_id: customerId,
            delivery_date: deliveryDate,
            total_amount: totalAmount,
            tax_rate: taxRate,
            tax_amount: taxAmount,
            total_amount_including_tax: totalAmountIncludingTax,
            delivery_items: {
              create: resolvedItems,
            },
          },
          include: {
            delivery_items: {
              orderBy: {
                id: "asc",
              },
            },
          },
        });

        return {
          ...createdDelivery,
          customer_name: customer.name,
        };
      },
      {
        isolationLevel: "Serializable",
      }
    );

    return NextResponse.json(delivery, { status: 201 });
  } catch (error) {
    if (error instanceof DeliveryRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2003", "P2034"].includes(error.code)
    ) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "すでに納品済みの受注が含まれています。画面を更新してください。" },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "The delivery could not be created due to conflicting data" },
        { status: 409 }
      );
    }

    console.error("Failed to create delivery", error);

    return NextResponse.json({ error: "Database Error" }, { status: 500 });
  }
}
