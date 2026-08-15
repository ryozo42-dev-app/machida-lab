import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TRANSACTION_TYPES = new Set(["initial", "add", "use", "adjust"]);

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const data = body as Record<string, unknown>;

    const customerMaterialId = Number(data.customer_material_id);
    const orderId =
      data.order_id === null || data.order_id === undefined
        ? null
        : Number(data.order_id);

    const transactionType =
      typeof data.transaction_type === "string"
        ? data.transaction_type.trim()
        : "";

    const quantity = Number(data.quantity);
    const note =
      typeof data.note === "string" ? data.note.trim() || null : null;

    if (
      !Number.isInteger(customerMaterialId) ||
      customerMaterialId <= 0
    ) {
      return NextResponse.json(
        { error: "Invalid customer_material_id" },
        { status: 400 }
      );
    }

    if (
      orderId !== null &&
      (!Number.isInteger(orderId) || orderId <= 0)
    ) {
      return NextResponse.json(
        { error: "Invalid order_id" },
        { status: 400 }
      );
    }

    if (!TRANSACTION_TYPES.has(transactionType)) {
      return NextResponse.json(
        { error: "Invalid transaction_type" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: "quantity must be greater than 0" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const customerMaterial =
        await tx.customer_materials.findUnique({
          where: {
            id: customerMaterialId,
          },
          select: {
            id: true,
            current_quantity: true,
            is_active: true,
          },
        });

      if (!customerMaterial || !customerMaterial.is_active) {
        throw new Error("CUSTOMER_MATERIAL_NOT_FOUND");
      }

      const currentQuantity =
        Number(customerMaterial.current_quantity);

      let nextQuantity = currentQuantity;

      if (
        transactionType === "initial" ||
        transactionType === "add"
      ) {
        nextQuantity = currentQuantity + quantity;
      } else if (transactionType === "use") {
        nextQuantity = currentQuantity - quantity;

        if (nextQuantity < 0) {
          throw new Error("INSUFFICIENT_MATERIAL");
        }
      } else if (transactionType === "adjust") {
        nextQuantity = quantity;
      }

      const transaction =
        await tx.material_transactions.create({
          data: {
            customer_material_id: customerMaterialId,
            order_id: orderId,
            transaction_type: transactionType,
            quantity,
            note,
          },
          select: {
            id: true,
            customer_material_id: true,
            order_id: true,
            transaction_type: true,
            quantity: true,
            note: true,
            created_at: true,
          },
        });

      const updated =
        await tx.customer_materials.update({
          where: {
            id: customerMaterialId,
          },
          data: {
            current_quantity: nextQuantity,
          },
          select: {
            id: true,
            current_quantity: true,
          },
        });

      return {
        transaction,
        current_quantity: updated.current_quantity,
      };
    });

    return NextResponse.json(
      {
        id: result.transaction.id,
        customer_material_id:
          result.transaction.customer_material_id,
        order_id: result.transaction.order_id,
        transaction_type:
          result.transaction.transaction_type,
        quantity: result.transaction.quantity.toString(),
        note: result.transaction.note,
        current_quantity:
          result.current_quantity.toString(),
        created_at: result.transaction.created_at,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    if (
      error instanceof Error &&
      error.message === "CUSTOMER_MATERIAL_NOT_FOUND"
    ) {
      return NextResponse.json(
        { error: "Customer material not found" },
        { status: 404 }
      );
    }

    if (
      error instanceof Error &&
      error.message === "INSUFFICIENT_MATERIAL"
    ) {
      return NextResponse.json(
        { error: "Insufficient material quantity" },
        { status: 409 }
      );
    }

    console.error(
      "Failed to create material transaction",
      error
    );

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}