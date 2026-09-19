import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { requireAuthResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

class OrderRestoreError extends Error {
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
    throw new OrderRestoreError("案件IDが正しくありません");
  }

  return orderId;
}

function handleRestoreError(error: unknown) {
  if (error instanceof OrderRestoreError) {
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

  console.error("POST /orders/[orderId]/restore failed", error);
  return NextResponse.json({ error: "案件の復元に失敗しました" }, { status: 500 });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

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
          throw new OrderRestoreError("案件が見つかりません", 404);
        }

        if (order.deleted_at === null) {
          throw new OrderRestoreError("この案件は削除されていません", 409);
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
            throw new OrderRestoreError(
              "納品済みデータがあるため復元できません",
              409
            );
          }

          const invoicedItem = await transaction.invoice_items.findFirst({
            where: { order_item_id: { in: orderItemIds } },
            select: { id: true },
          });

          if (invoicedItem) {
            throw new OrderRestoreError(
              "請求済みデータがあるため復元できません",
              409
            );
          }
        }

        await transaction.orders.update({
          where: { id: orderId },
          data: {
            deleted_at: null,
            deleted_by: null,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return NextResponse.json({ id: orderId });
  } catch (error) {
    return handleRestoreError(error);
  }
}
