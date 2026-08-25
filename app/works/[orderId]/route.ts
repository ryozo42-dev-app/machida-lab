import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const WORK_STATUSES = new Set(["in_progress", "completed"]);
const DEPOSIT_MATERIAL_TYPES = new Set(["para", "miro"]);

const DEPOSIT_MATERIAL_DEFINITIONS = {
  para: {
    pattern: "%パラ%",
  },
  miro: {
    pattern: "%ミロ%",
  },
} as const;

type DepositMaterialType = keyof typeof DEPOSIT_MATERIAL_DEFINITIONS;
type DepositMaterialUseInput = {
  materialType: DepositMaterialType;
  quantity: number;
  orderItemId: number;
};

type CustomerDepositMaterialRow = {
  id: number;
};

type DepositMaterialBalanceRow = {
  current_quantity: string;
};

type DepositMaterialUseTransactionRow = {
  id: number;
  deposit_material_id: number;
  transaction_type: string;
  quantity: string;
  order_id: number;
  order_item_id: number;
};

type OrderStatusRow = {
  id: number;
  work_status: string;
};

type DepositMaterialReversalTransactionRow =
  DepositMaterialUseTransactionRow;

function isDepositMaterialType(value: string): value is DepositMaterialType {
  return DEPOSIT_MATERIAL_TYPES.has(value);
}

function parseDepositMaterialUse(
  value: unknown
): DepositMaterialUseInput | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_DEPOSIT_MATERIAL_USE");
  }

  const data = value as Record<string, unknown>;
  const materialType =
    typeof data.material_type === "string" ? data.material_type.trim() : "";
  const quantity =
    typeof data.quantity === "number"
      ? data.quantity
      : Number(data.quantity);
  const orderItemId =
    typeof data.order_item_id === "number"
      ? data.order_item_id
      : Number(data.order_item_id);

  if (!isDepositMaterialType(materialType)) {
    throw new Error("INVALID_DEPOSIT_MATERIAL_USE");
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("INVALID_DEPOSIT_MATERIAL_USE_QUANTITY");
  }

  if (!Number.isInteger(orderItemId) || orderItemId <= 0) {
    throw new Error("INVALID_DEPOSIT_MATERIAL_USE_ORDER_ITEM");
  }

  return {
    materialType,
    quantity,
    orderItemId,
  };
}

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

    const data = body as Record<string, unknown>;
    const workStatus = data.work_status;

    if (typeof workStatus !== "string" || !WORK_STATUSES.has(workStatus)) {
      return NextResponse.json({ error: "Invalid work_status" }, { status: 400 });
    }

    const depositMaterialUse = parseDepositMaterialUse(
      data.deposit_material_use
    );

    if (depositMaterialUse && workStatus !== "completed") {
      return NextResponse.json(
        { error: "預かり材料使用量は作業終了時のみ登録できます" },
        { status: 400 }
      );
    }

    if (workStatus === "in_progress") {
      const result = await prisma.$transaction(async (tx) => {
        const orders = await tx.$queryRaw<OrderStatusRow[]>`
          SELECT id, work_status
          FROM orders
          WHERE id = ${orderId}
          FOR UPDATE
        `;
        const order = orders[0];

        if (!order) {
          throw new Error("ORDER_NOT_FOUND");
        }

        let reversalTransactions:
          DepositMaterialReversalTransactionRow[] = [];

        if (order.work_status === "completed") {
          reversalTransactions = await tx.$queryRaw<
            DepositMaterialReversalTransactionRow[]
          >`
            WITH active_uses AS (
              SELECT
                deposit_material_id,
                order_id,
                order_item_id,
                quantity,
                SUM(
                  CASE
                    WHEN transaction_type = 'use' THEN 1
                    WHEN transaction_type = 'use_reversal' THEN -1
                    ELSE 0
                  END
                )::int AS active_count
              FROM customer_deposit_material_transactions
              WHERE order_id = ${orderId}
                AND transaction_type IN ('use', 'use_reversal')
                AND order_item_id IS NOT NULL
              GROUP BY
                deposit_material_id,
                order_id,
                order_item_id,
                quantity
              HAVING
                SUM(
                  CASE
                    WHEN transaction_type = 'use' THEN 1
                    WHEN transaction_type = 'use_reversal' THEN -1
                    ELSE 0
                  END
                ) > 0
            ),
            inserted AS (
              INSERT INTO customer_deposit_material_transactions (
                deposit_material_id,
                transaction_type,
                quantity,
                order_id,
                order_item_id
              )
              SELECT
                active_uses.deposit_material_id,
                'use_reversal',
                active_uses.quantity,
                active_uses.order_id,
                active_uses.order_item_id
              FROM active_uses
              CROSS JOIN LATERAL generate_series(1, active_uses.active_count)
              RETURNING
                id,
                deposit_material_id,
                transaction_type,
                quantity::text AS quantity,
                order_id,
                order_item_id
            )
            SELECT
              id,
              deposit_material_id,
              transaction_type,
              quantity,
              order_id,
              order_item_id
            FROM inserted
          `;
        }

        const updated = await tx.orders.updateMany({
          where: { id: orderId },
          data: { work_status: workStatus },
        });

        if (updated.count === 0) {
          throw new Error("ORDER_NOT_FOUND");
        }

        return {
          reversalTransactions,
        };
      });

      return NextResponse.json({
        id: orderId,
        work_status: workStatus,
        deposit_material_use_reversals: result.reversalTransactions,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.orders.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          customer_id: true,
          work_status: true,
        },
      });

      if (!order) {
        throw new Error("ORDER_NOT_FOUND");
      }

      if (order.work_status === "completed") {
        throw new Error("WORK_ALREADY_COMPLETED");
      }

      let useTransaction: DepositMaterialUseTransactionRow | null = null;

      if (depositMaterialUse) {
        const orderItem = await tx.order_items.findFirst({
          where: {
            id: depositMaterialUse.orderItemId,
            order_id: orderId,
          },
          select: {
            id: true,
          },
        });

        if (!orderItem) {
          throw new Error("ORDER_ITEM_NOT_FOUND");
        }

        const materialDefinition =
          DEPOSIT_MATERIAL_DEFINITIONS[depositMaterialUse.materialType];
        const materials = await tx.$queryRaw<{ id: number }[]>`
          SELECT id
          FROM materials
          WHERE is_active = true
            AND name LIKE ${materialDefinition.pattern}
          ORDER BY id ASC
          LIMIT 1
        `;
        const material = materials[0];

        if (!material) {
          throw new Error("DEPOSIT_MATERIAL_NOT_FOUND");
        }

        const depositMaterials = await tx.$queryRaw<
          CustomerDepositMaterialRow[]
        >`
          SELECT cdm.id
          FROM customer_deposit_materials cdm
          WHERE cdm.customer_id = ${order.customer_id}
            AND cdm.material_id = ${material.id}
          FOR UPDATE
        `;
        const depositMaterial = depositMaterials[0];

        if (!depositMaterial) {
          throw new Error("CUSTOMER_DEPOSIT_MATERIAL_NOT_FOUND");
        }

        const balanceRows = await tx.$queryRaw<
          DepositMaterialBalanceRow[]
        >`
          SELECT
            COALESCE(
              SUM(
                CASE
                  WHEN cdmt.transaction_type = 'deposit' THEN cdmt.quantity
                  WHEN cdmt.transaction_type = 'use_reversal' THEN cdmt.quantity
                  WHEN cdmt.transaction_type = 'use' THEN -cdmt.quantity
                  ELSE 0
                END
              ),
              0
            )::text AS current_quantity
          FROM customer_deposit_material_transactions cdmt
          WHERE cdmt.deposit_material_id = ${depositMaterial.id}
        `;

        const currentQuantity = Number(
          balanceRows[0]?.current_quantity ?? "0"
        );

        if (
          !Number.isFinite(currentQuantity) ||
          currentQuantity < depositMaterialUse.quantity
        ) {
          throw new Error("INSUFFICIENT_DEPOSIT_MATERIAL");
        }

        const transactions = await tx.$queryRaw<
          DepositMaterialUseTransactionRow[]
        >`
          INSERT INTO customer_deposit_material_transactions (
            deposit_material_id,
            transaction_type,
            quantity,
            order_id,
            order_item_id
          )
          VALUES (
            ${depositMaterial.id},
            'use',
            ${depositMaterialUse.quantity},
            ${orderId},
            ${depositMaterialUse.orderItemId}
          )
          RETURNING
            id,
            deposit_material_id,
            transaction_type,
            quantity::text AS quantity,
            order_id,
            order_item_id
        `;

        useTransaction = transactions[0] ?? null;

        if (!useTransaction) {
          throw new Error("DEPOSIT_MATERIAL_USE_NOT_CREATED");
        }
      }

      const updated = await tx.orders.updateMany({
        where: {
          id: orderId,
          work_status: {
            not: "completed",
          },
        },
        data: { work_status: workStatus },
      });

      if (updated.count === 0) {
        throw new Error("WORK_ALREADY_COMPLETED");
      }

      return {
        useTransaction,
      };
    });

    return NextResponse.json({
      id: orderId,
      work_status: workStatus,
      deposit_material_use: result.useTransaction,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (error instanceof Error) {
      if (error.message === "INVALID_DEPOSIT_MATERIAL_USE") {
        return NextResponse.json(
          { error: "預かり材料使用量の入力が不正です" },
          { status: 400 }
        );
      }

      if (error.message === "INVALID_DEPOSIT_MATERIAL_USE_QUANTITY") {
        return NextResponse.json(
          { error: "使用量は0より大きい数値を入力してください" },
          { status: 400 }
        );
      }

      if (error.message === "INVALID_DEPOSIT_MATERIAL_USE_ORDER_ITEM") {
        return NextResponse.json(
          { error: "作業項目を特定できません" },
          { status: 400 }
        );
      }

      if (error.message === "ORDER_NOT_FOUND") {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      if (error.message === "ORDER_ITEM_NOT_FOUND") {
        return NextResponse.json(
          { error: "作業項目を特定できません" },
          { status: 404 }
        );
      }

      if (error.message === "WORK_ALREADY_COMPLETED") {
        return NextResponse.json(
          { error: "この作業はすでに完了しています" },
          { status: 409 }
        );
      }

      if (
        error.message === "DEPOSIT_MATERIAL_NOT_FOUND" ||
        error.message === "CUSTOMER_DEPOSIT_MATERIAL_NOT_FOUND"
      ) {
        return NextResponse.json(
          { error: "選択した預かり材料が登録されていません" },
          { status: 404 }
        );
      }

      if (error.message === "INSUFFICIENT_DEPOSIT_MATERIAL") {
        return NextResponse.json(
          { error: "現在の預かり残を超えています" },
          { status: 409 }
        );
      }
    }

    console.error("Failed to update work status", error);

    return NextResponse.json({ error: "Database Error" }, { status: 500 });
  }
}
