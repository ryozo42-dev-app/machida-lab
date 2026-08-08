import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
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
    const deliveryDate = parseDeliveryDate(body.delivery_date);
    const items = parseDeliveryItems(body.items);
    const deliveryNo =
      body.delivery_no === null || body.delivery_no === undefined
        ? null
        : String(body.delivery_no).trim();

    if (deliveryNo !== null && deliveryNo.length > 50) {
      throw new DeliveryRequestError("delivery_no must be 50 characters or fewer");
    }

    const delivery = await prisma.$transaction(
      async (transaction) => {
        const orderItemIds = items.map((item) => item.order_item_id);
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
          throw new DeliveryRequestError("One or more order_items do not exist");
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
          },
        });
        const customerByOrderId = new Map(
          orders.map((order) => [order.id, order.customer_id])
        );
        const customerIds = new Set(
          orderItems.map((item) => customerByOrderId.get(item.order_id))
        );

        if (customerIds.has(undefined)) {
          throw new DeliveryRequestError(
            "An order referenced by order_items does not exist",
            409
          );
        }

        if (customerIds.size !== 1) {
          throw new DeliveryRequestError(
            "All order_items in a delivery must belong to the same customer"
          );
        }

        const customerId = [...customerIds][0] as number;
        const deliveredQuantities = await transaction.delivery_items.groupBy({
          by: ["order_item_id"],
          where: {
            order_item_id: {
              in: orderItemIds,
            },
          },
          _sum: {
            quantity: true,
          },
        });
        const deliveredQuantityByOrderItemId = new Map(
          deliveredQuantities.map((item) => [
            item.order_item_id,
            item._sum.quantity ?? 0,
          ])
        );
        const requestedQuantityByOrderItemId = new Map(
          items.map((item) => [item.order_item_id, item.quantity])
        );

        for (const orderItem of orderItems) {
          if (orderItem.quantity === null || orderItem.quantity <= 0) {
            throw new DeliveryRequestError(
              `order_item ${orderItem.id} has an invalid quantity`,
              409
            );
          }

          const alreadyDelivered =
            deliveredQuantityByOrderItemId.get(orderItem.id) ?? 0;
          const requested = requestedQuantityByOrderItemId.get(orderItem.id) ?? 0;

          if (alreadyDelivered + requested > orderItem.quantity) {
            throw new DeliveryRequestError(
              `Delivery quantity exceeds the remaining quantity for order_item ${orderItem.id}`,
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
              `order_item ${orderItem.id} must reference exactly one price item`,
              409
            );
          }

          const unitPrice = hasInsuranceItem
            ? insurancePrices.get(orderItem.insurance_item_id as number)
            : privatePrices.get(orderItem.private_item_id as number) ??
              standardPrivatePrices.get(orderItem.private_item_id as number);

          if (unitPrice === undefined) {
            throw new DeliveryRequestError(
              `No price is configured for order_item ${orderItem.id}`,
              409
            );
          }

          if (unitPrice.lessThan(0)) {
            throw new DeliveryRequestError(
              `Price must not be negative for order_item ${orderItem.id}`,
              409
            );
          }

          const quantity = requestedQuantityByOrderItemId.get(orderItem.id) as number;

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

        return transaction.deliveries.create({
          data: {
            delivery_no: deliveryNo || null,
            customer_id: customerId,
            delivery_date: deliveryDate,
            total_amount: totalAmount,
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
      return NextResponse.json(
        { error: "The delivery could not be created due to conflicting data" },
        { status: 409 }
      );
    }

    console.error("Failed to create delivery", error);

    return NextResponse.json({ error: "Database Error" }, { status: 500 });
  }
}