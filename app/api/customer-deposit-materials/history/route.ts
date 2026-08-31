import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type CustomerDepositMaterialTransactionRow = {
  id: number;
  deposit_material_id: number;
  transaction_type: string;
  quantity: string;
  order_id: number | null;
  order_item_id: number | null;
  created_at: Date;
  material_id: number;
  material_name: string;
  unit: string;
};

const DEPOSIT_MATERIAL_TYPES = new Set(["para", "miro"]);

const getMaterialNamePattern = (materialType: string) =>
  materialType === "para" ? "%パラ%" : "%ミロ%";

export async function GET(request: Request) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  const searchParams = new URL(request.url).searchParams;
  const customerIdParam = searchParams.get("customer_id");
  const materialType =
    searchParams.get("material_type")?.trim() ?? "";

  if (!customerIdParam) {
    return NextResponse.json(
      { error: "customer_id is required" },
      { status: 400 }
    );
  }

  const customerId = Number(customerIdParam);

  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json(
      { error: "Invalid customer_id" },
      { status: 400 }
    );
  }

  if (!DEPOSIT_MATERIAL_TYPES.has(materialType)) {
    return NextResponse.json(
      { error: "Invalid material_type" },
      { status: 400 }
    );
  }

  try {
    const customer = await prisma.customers.findUnique({
      where: {
        id: customerId,
      },
      select: {
        id: true,
      },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    const materialNamePattern = getMaterialNamePattern(materialType);
    const transactions = await prisma.$queryRaw<
      CustomerDepositMaterialTransactionRow[]
    >`
      SELECT
        cdmt.id,
        cdmt.deposit_material_id,
        cdmt.transaction_type,
        cdmt.quantity::text AS quantity,
        cdmt.order_id,
        cdmt.order_item_id,
        cdmt.created_at,
        cdm.material_id,
        m.name AS material_name,
        m.unit
      FROM customer_deposit_material_transactions cdmt
      INNER JOIN customer_deposit_materials cdm
        ON cdm.id = cdmt.deposit_material_id
      INNER JOIN materials m
        ON m.id = cdm.material_id
      WHERE cdm.customer_id = ${customerId}
        AND m.name LIKE ${materialNamePattern}
      ORDER BY
        cdmt.created_at DESC,
        cdmt.id DESC
    `;

    return NextResponse.json(
      transactions.map((item) => ({
        id: item.id,
        deposit_material_id: item.deposit_material_id,
        transaction_type: item.transaction_type,
        quantity: item.quantity,
        order_id: item.order_id,
        order_item_id: item.order_item_id,
        created_at: item.created_at,
        material_id: item.material_id,
        material_name: item.material_name,
        unit: item.unit,
      }))
    );
  } catch (error) {
    console.error(
      "Failed to fetch customer deposit material transactions",
      error
    );

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}
