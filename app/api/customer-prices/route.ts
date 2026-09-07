import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { requireAuthResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type WorkItemType = "insurance" | "private";

class CustomerPriceRequestError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePositiveInteger(value: unknown, fieldName: string) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CustomerPriceRequestError(`${fieldName} must be a positive integer`);
  }

  return parsed;
}

function parseType(value: unknown): WorkItemType {
  if (value !== "insurance" && value !== "private") {
    throw new CustomerPriceRequestError("type must be insurance or private");
  }

  return value;
}

function parsePrice(value: unknown) {
  const price = Number(value);

  if (!Number.isInteger(price) || price < 0) {
    throw new CustomerPriceRequestError("price must be a non-negative integer");
  }

  return price;
}

async function ensureCustomerExists(customerId: number) {
  const customer = await prisma.customers.findUnique({
    where: { id: customerId },
    select: { id: true },
  });

  if (!customer) {
    throw new CustomerPriceRequestError("Customer not found", 404);
  }
}

async function ensureItemExists(type: WorkItemType, itemId: number) {
  if (type === "insurance") {
    const item = await prisma.insurance_item_masters.findUnique({
      where: { id: itemId },
      select: { id: true },
    });

    if (!item) {
      throw new CustomerPriceRequestError("Item not found", 404);
    }

    return;
  }

  const item = await prisma.private_item_masters.findUnique({
    where: { id: itemId },
    select: { id: true },
  });

  if (!item) {
    throw new CustomerPriceRequestError("Item not found", 404);
  }
}

async function ensureActiveItemExists(type: WorkItemType, itemId: number) {
  if (type === "insurance") {
    const [item] = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT iim.id
      FROM insurance_item_masters iim
      INNER JOIN insurance_sub_categories isc
        ON isc.id = iim.sub_category_id
      INNER JOIN insurance_categories ic
        ON ic.id = isc.category_id
      WHERE
        iim.id = ${itemId}
        AND iim.is_active = true
        AND isc.is_active = true
        AND ic.is_active = true
      LIMIT 1
    `;

    if (!item) {
      throw new CustomerPriceRequestError("Item not found or inactive", 404);
    }

    return;
  }

  const [item] = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT pim.id
    FROM private_item_masters pim
    INNER JOIN private_sub_categories psc
      ON psc.id = pim.sub_category_id
    INNER JOIN private_categories pc
      ON pc.id = psc.category_id
    WHERE
      pim.id = ${itemId}
      AND pim.is_active = true
      AND psc.is_active = true
      AND pc.is_active = true
    LIMIT 1
  `;

  if (!item) {
    throw new CustomerPriceRequestError("Item not found or inactive", 404);
  }
}

async function findInsurancePriceRows(customerId: number, itemId: number) {
  return prisma.customer_insurance_prices.findMany({
    where: {
      customer_id: customerId,
      insurance_item_id: itemId,
    },
    select: {
      id: true,
      customer_id: true,
      insurance_item_id: true,
      price: true,
    },
  });
}

async function findPrivateMasterPriceRows(customerId: number, itemId: number) {
  return prisma.customer_private_prices.findMany({
    where: {
      customer_id: customerId,
      private_item_master_id: itemId,
    },
    select: {
      id: true,
      customer_id: true,
      private_item_master_id: true,
      price: true,
    },
  });
}

function requireSinglePriceRow<T>(rows: T[]) {
  if (rows.length === 0) {
    throw new CustomerPriceRequestError("Price not found", 404);
  }

  if (rows.length > 1) {
    throw new CustomerPriceRequestError("Multiple prices are configured for this item", 409);
  }

  return rows[0];
}

async function countUndeliveredOrderItems(
  type: WorkItemType,
  customerId: number,
  itemId: number
) {
  if (type === "insurance") {
    const [row] = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM order_items oi
      INNER JOIN orders o
        ON o.id = oi.order_id
      LEFT JOIN delivery_items di
        ON di.order_item_id = oi.id
      WHERE
        o.customer_id = ${customerId}
        AND oi.insurance_item_id = ${itemId}
        AND di.id IS NULL
    `;

    return row?.count ?? 0;
  }

  const [row] = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM order_items oi
    INNER JOIN orders o
      ON o.id = oi.order_id
    LEFT JOIN delivery_items di
      ON di.order_item_id = oi.id
    WHERE
      o.customer_id = ${customerId}
      AND oi.private_item_master_id = ${itemId}
      AND di.id IS NULL
  `;

  return row?.count ?? 0;
}

async function ensureNoUndeliveredOrderItems(
  type: WorkItemType,
  customerId: number,
  itemId: number
) {
  const count = await countUndeliveredOrderItems(type, customerId, itemId);

  if (count > 0) {
    throw new CustomerPriceRequestError(
      "未納品の受注があるため、この単価は削除できません",
      409
    );
  }
}

function handleCustomerPriceError(error: unknown, logMessage: string) {
  if (error instanceof CustomerPriceRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return NextResponse.json({ error: "Price already exists" }, { status: 409 });
  }

  console.error(logMessage, error);

  return NextResponse.json({ error: "Database Error" }, { status: 500 });
}

function parseBodyKey(body: unknown) {
  if (!isObject(body)) {
    throw new CustomerPriceRequestError("Request body must be an object");
  }

  return {
    customerId: parsePositiveInteger(body.customer_id, "customer_id"),
    type: parseType(body.type),
    itemId: parsePositiveInteger(body.item_id, "item_id"),
    body,
  };
}

async function getManagedPrice(
  type: WorkItemType,
  customerId: number,
  itemId: number
) {
  await ensureCustomerExists(customerId);
  await ensureItemExists(type, itemId);

  const rows =
    type === "insurance"
      ? await findInsurancePriceRows(customerId, itemId)
      : await findPrivateMasterPriceRows(customerId, itemId);

  if (rows.length > 1) {
    throw new CustomerPriceRequestError("Multiple prices are configured for this item", 409);
  }

  return rows[0] ?? null;
}

export async function GET(request: Request) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const searchParams = new URL(request.url).searchParams;

    const customerIdParam = searchParams.get("customer_id");
    const typeParam = searchParams.get("type");
    const itemIdParam = searchParams.get("item_id");
    const insuranceItemIdParam = searchParams.get("insurance_item_id");
    const privateItemIdParam = searchParams.get("private_item_id");
    const privateItemMasterIdParam = searchParams.get("private_item_master_id");
    const listParam = searchParams.get("list");

    const customerId = parsePositiveInteger(customerIdParam, "customer_id");
    const type = parseType(typeParam);

    if (listParam === "1") {
      await ensureCustomerExists(customerId);

      if (type === "insurance") {
        const rows = await prisma.customer_insurance_prices.findMany({
          where: { customer_id: customerId },
          orderBy: [{ insurance_item_id: "asc" }, { id: "asc" }],
          select: {
            id: true,
            customer_id: true,
            insurance_item_id: true,
            price: true,
          },
        });

        return NextResponse.json({
          prices: rows.map((row) => ({
            id: row.id,
            customer_id: row.customer_id,
            type,
            item_id: row.insurance_item_id,
            insurance_item_id: row.insurance_item_id,
            price: Number(row.price),
          })),
        });
      }

      const rows = await prisma.customer_private_prices.findMany({
        where: {
          customer_id: customerId,
          private_item_master_id: { not: null },
        },
        orderBy: [{ private_item_master_id: "asc" }, { id: "asc" }],
        select: {
          id: true,
          customer_id: true,
          private_item_master_id: true,
          price: true,
        },
      });

      return NextResponse.json({
        prices: rows.map((row) => ({
          id: row.id,
          customer_id: row.customer_id,
          type,
          item_id: row.private_item_master_id,
          private_item_master_id: row.private_item_master_id,
          price: Number(row.price),
        })),
      });
    }

    if (itemIdParam !== null && itemIdParam.trim() !== "") {
      const itemId = parsePositiveInteger(itemIdParam, "item_id");
      const priceRow = await getManagedPrice(type, customerId, itemId);

      return NextResponse.json({
        price: priceRow ? Number(priceRow.price) : null,
      });
    }

    const insuranceItemId =
      insuranceItemIdParam === null ? null : Number(insuranceItemIdParam);
    const privateItemId =
      privateItemIdParam === null ? null : Number(privateItemIdParam);
    const privateItemMasterId =
      privateItemMasterIdParam === null ? null : Number(privateItemMasterIdParam);

    if (type === "insurance") {
      if (
        insuranceItemIdParam === null ||
        insuranceItemIdParam.trim() === "" ||
        !Number.isInteger(insuranceItemId) ||
        insuranceItemId === null ||
        insuranceItemId <= 0
      ) {
        return NextResponse.json({ error: "insurance_item_id is required" }, { status: 400 });
      }

      const priceRow = await prisma.customer_insurance_prices.findFirst({
        where: {
          customer_id: customerId,
          insurance_item_id: insuranceItemId,
        },
        select: {
          price: true,
        },
      });

      return NextResponse.json({
        price: priceRow ? Number(priceRow.price) : null,
      });
    }

    const hasPrivateItemId =
      privateItemIdParam !== null && privateItemIdParam.trim() !== "";
    const hasPrivateItemMasterId =
      privateItemMasterIdParam !== null &&
      privateItemMasterIdParam.trim() !== "";

    if (hasPrivateItemId && hasPrivateItemMasterId) {
      return NextResponse.json(
        { error: "Only one of private_item_id or private_item_master_id can be specified" },
        { status: 400 }
      );
    }

    if (!hasPrivateItemId && !hasPrivateItemMasterId) {
      return NextResponse.json({ error: "private_item_id is required" }, { status: 400 });
    }

    if (hasPrivateItemMasterId) {
      if (
        !Number.isInteger(privateItemMasterId) ||
        privateItemMasterId === null ||
        privateItemMasterId <= 0
      ) {
        return NextResponse.json({ error: "private_item_master_id is required" }, { status: 400 });
      }

      const priceRow = await prisma.customer_private_prices.findFirst({
        where: {
          customer_id: customerId,
          private_item_master_id: privateItemMasterId,
        },
        select: {
          price: true,
        },
      });

      return NextResponse.json({
        price: priceRow ? Number(priceRow.price) : null,
      });
    }

    if (
      !Number.isInteger(privateItemId) ||
      privateItemId === null ||
      privateItemId <= 0
    ) {
      return NextResponse.json({ error: "private_item_id is required" }, { status: 400 });
    }

    const priceRow = await prisma.customer_private_prices.findFirst({
      where: {
        customer_id: customerId,
        private_item_id: privateItemId,
      },
      select: {
        price: true,
      },
    });

    return NextResponse.json({
      price: priceRow ? Number(priceRow.price) : null,
    });
  } catch (error) {
    return handleCustomerPriceError(error, "GET /api/customer-prices failed");
  }
}

export async function POST(request: Request) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const { customerId, type, itemId, body } = parseBodyKey(await request.json());
    const price = parsePrice(body.price);

    await ensureCustomerExists(customerId);
    await ensureActiveItemExists(type, itemId);

    const existingRows =
      type === "insurance"
        ? await findInsurancePriceRows(customerId, itemId)
        : await findPrivateMasterPriceRows(customerId, itemId);

    if (existingRows.length > 0) {
      throw new CustomerPriceRequestError("Price already exists", 409);
    }

    if (type === "insurance") {
      const created = await prisma.customer_insurance_prices.create({
        data: {
          customer_id: customerId,
          insurance_item_id: itemId,
          price,
        },
        select: {
          id: true,
          customer_id: true,
          insurance_item_id: true,
          price: true,
        },
      });

      return NextResponse.json(
        {
          id: created.id,
          customer_id: created.customer_id,
          type,
          item_id: created.insurance_item_id,
          insurance_item_id: created.insurance_item_id,
          price: Number(created.price),
        },
        { status: 201 }
      );
    }

    const created = await prisma.customer_private_prices.create({
      data: {
        customer_id: customerId,
        private_item_id: null,
        private_item_master_id: itemId,
        price,
      },
      select: {
        id: true,
        customer_id: true,
        private_item_master_id: true,
        price: true,
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        customer_id: created.customer_id,
        type,
        item_id: created.private_item_master_id,
        private_item_master_id: created.private_item_master_id,
        price: Number(created.price),
      },
      { status: 201 }
    );
  } catch (error) {
    return handleCustomerPriceError(error, "POST /api/customer-prices failed");
  }
}

export async function PATCH(request: Request) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const { customerId, type, itemId, body } = parseBodyKey(await request.json());
    const price = parsePrice(body.price);

    await ensureCustomerExists(customerId);
    await ensureItemExists(type, itemId);

    if (type === "insurance") {
      const row = requireSinglePriceRow(
        await findInsurancePriceRows(customerId, itemId)
      );
      const updated = await prisma.customer_insurance_prices.update({
        where: { id: row.id },
        data: { price },
        select: {
          id: true,
          customer_id: true,
          insurance_item_id: true,
          price: true,
        },
      });

      return NextResponse.json({
        id: updated.id,
        customer_id: updated.customer_id,
        type,
        item_id: updated.insurance_item_id,
        insurance_item_id: updated.insurance_item_id,
        price: Number(updated.price),
      });
    }

    const row = requireSinglePriceRow(
      await findPrivateMasterPriceRows(customerId, itemId)
    );
    const updated = await prisma.customer_private_prices.update({
      where: { id: row.id },
      data: { price },
      select: {
        id: true,
        customer_id: true,
        private_item_master_id: true,
        price: true,
      },
    });

    return NextResponse.json({
      id: updated.id,
      customer_id: updated.customer_id,
      type,
      item_id: updated.private_item_master_id,
      private_item_master_id: updated.private_item_master_id,
      price: Number(updated.price),
    });
  } catch (error) {
    return handleCustomerPriceError(error, "PATCH /api/customer-prices failed");
  }
}

export async function DELETE(request: Request) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const { customerId, type, itemId } = parseBodyKey(await request.json());

    await ensureCustomerExists(customerId);
    await ensureItemExists(type, itemId);

    if (type === "insurance") {
      const row = requireSinglePriceRow(
        await findInsurancePriceRows(customerId, itemId)
      );

      await ensureNoUndeliveredOrderItems(type, customerId, itemId);

      await prisma.customer_insurance_prices.delete({
        where: { id: row.id },
      });

      return NextResponse.json({ deleted_count: 1 });
    }

    const row = requireSinglePriceRow(
      await findPrivateMasterPriceRows(customerId, itemId)
    );

    await ensureNoUndeliveredOrderItems(type, customerId, itemId);

    await prisma.customer_private_prices.delete({
      where: { id: row.id },
    });

    return NextResponse.json({ deleted_count: 1 });
  } catch (error) {
    return handleCustomerPriceError(error, "DELETE /api/customer-prices failed");
  }
}
