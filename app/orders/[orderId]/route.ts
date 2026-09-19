import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { getCurrentUser, requireAuthResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type WorkItemType = "insurance" | "private";

class OrderEditError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

function parseOrderId(value: string) {
  const orderId = Number(value);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new OrderEditError("案件IDが正しくありません");
  }

  return orderId;
}

function parsePositiveInteger(value: unknown, fieldName: string) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new OrderEditError(`${fieldName}が正しくありません`);
  }

  return parsed;
}

function parseDateOnly(value: unknown) {
  if (typeof value !== "string") {
    throw new OrderEditError("納品予定日が正しくありません");
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw new OrderEditError("納品予定日が正しくありません");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new OrderEditError("納品予定日が正しくありません");
  }

  return date;
}

function formatDateOnly(value: Date | null) {
  if (!value) {
    return "";
  }

  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function parseEditBody(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new OrderEditError("入力内容が正しくありません");
  }

  const body = value as Record<string, unknown>;
  const type = body.type;

  if (type !== "insurance" && type !== "private") {
    throw new OrderEditError("作業区分が正しくありません");
  }

  const priceValue = body.price;
  const price =
    priceValue === null || priceValue === undefined || priceValue === ""
      ? null
      : Number(priceValue);

  if (price !== null && (!Number.isFinite(price) || price <= 0)) {
    throw new OrderEditError("価格は0より大きい数値で入力してください");
  }

  const quantity = parsePositiveInteger(body.quantity, "数量");

  if (quantity > 10) {
    throw new OrderEditError("数量は1から10で入力してください");
  }

  const workName = typeof body.work_name === "string" ? body.work_name.trim() : "";

  if (!workName || workName.length > 400) {
    throw new OrderEditError("作業内容が正しくありません");
  }

  const rawToothNumbers = Array.isArray(body.tooth_numbers)
    ? body.tooth_numbers.map(String)
    : [];
  const toothNumbers = [...new Set(rawToothNumbers)];
  const validToothNumbers = new Set([
    ...[1, 2, 3, 4].flatMap((quadrant) =>
      Array.from({ length: 8 }, (_, index) => `${quadrant}${index + 1}`)
    ),
    ...[5, 6, 7, 8].flatMap((quadrant) =>
      Array.from({ length: 5 }, (_, index) => `${quadrant}${index + 1}`)
    ),
  ]);

  if (toothNumbers.some((toothNumber) => !validToothNumbers.has(toothNumber))) {
    throw new OrderEditError("歯式が正しくありません");
  }

  return {
    customerId: parsePositiveInteger(body.customer_id, "医院"),
    patientId: parsePositiveInteger(body.patient_id, "患者"),
    type: type as WorkItemType,
    itemId: parsePositiveInteger(body.item_id, "作業内容"),
    workName,
    price: price === null ? null : Number(price.toFixed(2)),
    quantity,
    deliveryDate: parseDateOnly(body.delivery_date),
    toothNumbers,
    bridge: body.bridge === true,
    baseUpSupportTarget: body.base_up_support_target === true,
    remarks: typeof body.remarks === "string" ? body.remarks : "",
    updateCustomerPrice: body.update_customer_price === true,
  };
}

function handleOrderEditError(error: unknown, logMessage: string) {
  if (error instanceof OrderEditError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  ) {
    return NextResponse.json(
      { error: "他の更新と重なりました。もう一度お試しください" },
      { status: 409 }
    );
  }

  console.error(logMessage, error);
  return NextResponse.json({ error: "案件の更新に失敗しました" }, { status: 500 });
}

async function assertEditableOrder(
  transaction: Prisma.TransactionClient,
  orderId: number
) {
  const order = await transaction.orders.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    throw new OrderEditError("案件が見つかりません", 404);
  }

  if (order.deleted_at !== null) {
    throw new OrderEditError("削除済みの案件は編集できません", 409);
  }

  const items = await transaction.order_items.findMany({
    where: { order_id: orderId },
    orderBy: { id: "asc" },
    include: {
      delivery_items: { select: { id: true } },
      invoice_items: { select: { id: true } },
    },
  });

  if (items.length !== 1) {
    throw new OrderEditError(
      "複数の作業内容を持つ案件はこの画面では編集できません",
      409
    );
  }

  if (items[0].delivery_items !== null) {
    throw new OrderEditError("この案件は納品済みのため編集できません", 409);
  }

  if (items[0].invoice_items.length > 0) {
    throw new OrderEditError("この案件は請求済みのため編集できません", 409);
  }

  return { order, item: items[0] };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const orderId = parseOrderId((await params).orderId);
    const result = await prisma.$transaction(async (transaction) => {
      const { order, item } = await assertEditableOrder(transaction, orderId);
      const [patient, teeth, orderFile] = await Promise.all([
        transaction.patients.findUnique({
          where: { id: order.patient_id },
          select: {
            id: true,
            customer_id: true,
            patient_name: true,
            patient_kana: true,
          },
        }),
        transaction.order_teeth.findMany({
          where: { order_id: orderId },
          orderBy: { id: "asc" },
          select: { tooth_no: true, is_bridge: true },
        }),
        transaction.order_files.findFirst({
          where: { order_id: orderId },
          orderBy: { id: "asc" },
          select: { id: true, file_name: true },
        }),
      ]);

      if (!patient) {
        throw new OrderEditError("患者情報が見つかりません", 409);
      }

      if (item.insurance_item_id !== null) {
        const master = await transaction.insurance_item_masters.findUnique({
          where: { id: item.insurance_item_id },
          include: {
            insurance_sub_categories: {
              include: { insurance_categories: true },
            },
          },
        });

        if (!master) {
          throw new OrderEditError("作業内容が見つかりません", 409);
        }

        return {
          id: order.id,
          customer_id: order.customer_id,
          patient,
          type: "insurance" as const,
          item_id: master.id,
          category_id: master.insurance_sub_categories.category_id,
          sub_category_id: master.sub_category_id,
          work_name:
            item.work_name?.trim() ||
            `${master.insurance_sub_categories.name} ${master.name}`.trim(),
          price: item.unit_price?.toString() ?? "",
          quantity: item.quantity ?? 1,
          delivery_date: formatDateOnly(order.delivery_date),
          tooth_numbers: teeth.map((tooth) => tooth.tooth_no),
          bridge: teeth.some((tooth) => tooth.is_bridge),
          base_up_support_target: item.base_up_support_target,
          remarks: order.remarks ?? "",
          order_file: orderFile,
        };
      }

      if (item.private_item_master_id !== null) {
        const master = await transaction.private_item_masters.findUnique({
          where: { id: item.private_item_master_id },
          include: {
            private_sub_categories: {
              include: { private_categories: true },
            },
          },
        });

        if (!master) {
          throw new OrderEditError("作業内容が見つかりません", 409);
        }

        return {
          id: order.id,
          customer_id: order.customer_id,
          patient,
          type: "private" as const,
          item_id: master.id,
          category_id: master.private_sub_categories.category_id,
          sub_category_id: master.sub_category_id,
          work_name:
            item.work_name?.trim() ||
            `${master.private_sub_categories.name} ${master.name}`.trim(),
          price: item.unit_price?.toString() ?? "",
          quantity: item.quantity ?? 1,
          delivery_date: formatDateOnly(order.delivery_date),
          tooth_numbers: teeth.map((tooth) => tooth.tooth_no),
          bridge: teeth.some((tooth) => tooth.is_bridge),
          base_up_support_target: item.base_up_support_target,
          remarks: order.remarks ?? "",
          order_file: orderFile,
        };
      }

      throw new OrderEditError(
        "この案件の作業内容は現在の編集画面に対応していません",
        409
      );
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleOrderEditError(error, "GET /orders/[orderId] failed");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const orderId = parseOrderId((await params).orderId);
    let requestBody: unknown;

    try {
      requestBody = await request.json();
    } catch {
      throw new OrderEditError("入力内容が正しくありません");
    }

    const input = parseEditBody(requestBody);

    const updatedOrder = await prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`
          SELECT id
          FROM orders
          WHERE id = ${orderId}
          FOR UPDATE
        `;
        await transaction.$queryRaw`
          SELECT id
          FROM order_items
          WHERE order_id = ${orderId}
          FOR UPDATE
        `;

        const { item } = await assertEditableOrder(transaction, orderId);
        const [customer, patient] = await Promise.all([
          transaction.customers.findUnique({
            where: { id: input.customerId },
            select: { id: true },
          }),
          transaction.patients.findFirst({
            where: {
              id: input.patientId,
              customer_id: input.customerId,
            },
            select: { id: true },
          }),
        ]);

        if (!customer) {
          throw new OrderEditError("医院が見つかりません");
        }

        if (!patient) {
          throw new OrderEditError("選択した医院の患者ではありません");
        }

        if (input.type === "insurance") {
          const [master] = await transaction.$queryRaw<Array<{ id: number }>>`
            SELECT iim.id
            FROM insurance_item_masters iim
            INNER JOIN insurance_sub_categories isc ON isc.id = iim.sub_category_id
            INNER JOIN insurance_categories ic ON ic.id = isc.category_id
            WHERE iim.id = ${input.itemId}
              AND iim.is_active = true
              AND isc.is_active = true
              AND ic.is_active = true
            LIMIT 1
          `;

          if (!master) {
            throw new OrderEditError("作業内容が見つかりません");
          }
        } else {
          const [master] = await transaction.$queryRaw<Array<{ id: number }>>`
            SELECT pim.id
            FROM private_item_masters pim
            INNER JOIN private_sub_categories psc ON psc.id = pim.sub_category_id
            INNER JOIN private_categories pc ON pc.id = psc.category_id
            WHERE pim.id = ${input.itemId}
              AND pim.is_active = true
              AND psc.is_active = true
              AND pc.is_active = true
            LIMIT 1
          `;

          if (!master) {
            throw new OrderEditError("作業内容が見つかりません");
          }
        }

        const order = await transaction.orders.update({
          where: { id: orderId },
          data: {
            customer_id: input.customerId,
            patient_id: input.patientId,
            delivery_date: input.deliveryDate,
            insurance_type: input.type === "insurance" ? "保険" : "自費",
            remarks: input.remarks,
          },
        });

        await transaction.order_items.update({
          where: { id: item.id },
          data: {
            insurance_item_id: input.type === "insurance" ? input.itemId : null,
            private_item_id: null,
            private_item_master_id: input.type === "private" ? input.itemId : null,
            work_name: input.workName,
            unit_price: input.price,
            quantity: input.quantity,
            base_up_support_target: input.baseUpSupportTarget,
          },
        });

        await transaction.order_teeth.deleteMany({ where: { order_id: orderId } });

        if (input.toothNumbers.length > 0) {
          await transaction.order_teeth.createMany({
            data: input.toothNumbers.map((toothNumber) => ({
              order_id: orderId,
              tooth_no: toothNumber,
              is_bridge: input.bridge,
            })),
          });
        }

        if (input.updateCustomerPrice) {
          if (input.price === null) {
            throw new OrderEditError("医院別価格を更新するには価格が必要です");
          }

          const priceRows =
            input.type === "insurance"
              ? await transaction.customer_insurance_prices.findMany({
                  where: {
                    customer_id: input.customerId,
                    insurance_item_id: input.itemId,
                  },
                  select: { id: true },
                })
              : await transaction.customer_private_prices.findMany({
                  where: {
                    customer_id: input.customerId,
                    private_item_master_id: input.itemId,
                  },
                  select: { id: true },
                });

          if (priceRows.length > 1) {
            throw new OrderEditError(
              "医院別価格を特定できないため更新できません",
              409
            );
          }

          if (input.type === "insurance") {
            if (priceRows.length === 0) {
              await transaction.customer_insurance_prices.create({
                data: {
                  customer_id: input.customerId,
                  insurance_item_id: input.itemId,
                  price: input.price,
                },
              });
            } else {
              await transaction.customer_insurance_prices.update({
                where: { id: priceRows[0].id },
                data: { price: input.price },
              });
            }
          } else {
            if (priceRows.length === 0) {
              await transaction.customer_private_prices.create({
                data: {
                  customer_id: input.customerId,
                  private_item_id: null,
                  private_item_master_id: input.itemId,
                  price: input.price,
                },
              });
            } else {
              await transaction.customer_private_prices.update({
                where: { id: priceRows[0].id },
                data: { price: input.price },
              });
            }
          }
        }

        return order;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return NextResponse.json({ id: updatedOrder.id });
  } catch (error) {
    return handleOrderEditError(error, "PATCH /orders/[orderId] failed");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const orderId = parseOrderId((await params).orderId);

    await prisma.$transaction(
      async (transaction) => {
        const lockedOrders = await transaction.$queryRaw<
          Array<{ id: number; deleted_at: Date | null }>
        >`
          SELECT id, deleted_at
          FROM orders
          WHERE id = ${orderId}
          FOR UPDATE
        `;
        const order = lockedOrders[0];

        if (!order) {
          throw new OrderEditError("案件が見つかりません", 404);
        }

        if (order.deleted_at !== null) {
          throw new OrderEditError("この案件は既に削除されています", 409);
        }

        const orderItems = await transaction.$queryRaw<Array<{ id: number }>>`
          SELECT id
          FROM order_items
          WHERE order_id = ${orderId}
          ORDER BY id
          FOR UPDATE
        `;
        const orderItemIds = orderItems.map((item) => item.id);

        if (orderItemIds.length > 0) {
          const deliveredItem = await transaction.delivery_items.findFirst({
            where: { order_item_id: { in: orderItemIds } },
            select: { id: true },
          });

          if (deliveredItem) {
            throw new OrderEditError("この案件は納品済みのため削除できません", 409);
          }

          const invoicedItem = await transaction.invoice_items.findFirst({
            where: { order_item_id: { in: orderItemIds } },
            select: { id: true },
          });

          if (invoicedItem) {
            throw new OrderEditError("この案件は請求済みのため削除できません", 409);
          }
        }

        await transaction.orders.update({
          where: { id: orderId },
          data: {
            deleted_at: new Date(),
            deleted_by: user.id,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return NextResponse.json({ id: orderId });
  } catch (error) {
    return handleOrderEditError(error, "DELETE /orders/[orderId] failed");
  }
}
