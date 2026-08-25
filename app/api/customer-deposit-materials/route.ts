import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type CustomerDepositMaterialBalanceRow = {
  id: number;
  customer_id: number;
  material_id: number;
  material_name: string;
  unit: string;
  current_quantity: string;
};

type DepositMaterialType = "para" | "miro";

const DEPOSIT_MATERIAL_TYPES = new Set(["para", "miro"]);

const DEPOSIT_MATERIAL_DEFINITIONS: Record<
  DepositMaterialType,
  { name: string; pattern: string; unit: string }
> = {
  para: {
    name: "パラ",
    pattern: "%パラ%",
    unit: "g",
  },
  miro: {
    name: "ミロ",
    pattern: "%ミロ%",
    unit: "g",
  },
};

const isDepositMaterialType = (
  value: string
): value is DepositMaterialType => DEPOSIT_MATERIAL_TYPES.has(value);

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const customerIdParam = searchParams.get("customer_id");
  const materialIdParam = searchParams.get("material_id");

  if (!customerIdParam) {
    return NextResponse.json(
      { error: "customer_id is required" },
      { status: 400 }
    );
  }

  const customerId = Number(customerIdParam);
  const materialId = materialIdParam ? Number(materialIdParam) : null;

  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json(
      { error: "Invalid customer_id" },
      { status: 400 }
    );
  }

  if (
    materialId !== null &&
    (!Number.isInteger(materialId) || materialId <= 0)
  ) {
    return NextResponse.json(
      { error: "Invalid material_id" },
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

    const materialFilter =
      materialId === null
        ? Prisma.empty
        : Prisma.sql`AND cdm.material_id = ${materialId}`;

    const balances = await prisma.$queryRaw<
      CustomerDepositMaterialBalanceRow[]
    >`
      SELECT
        cdm.id,
        cdm.customer_id,
        cdm.material_id,
        m.name AS material_name,
        m.unit,
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
      FROM customer_deposit_materials cdm
      INNER JOIN materials m
        ON m.id = cdm.material_id
      LEFT JOIN customer_deposit_material_transactions cdmt
        ON cdmt.deposit_material_id = cdm.id
      WHERE cdm.customer_id = ${customerId}
      ${materialFilter}
      GROUP BY
        cdm.id,
        cdm.customer_id,
        cdm.material_id,
        m.name,
        m.unit
      ORDER BY
        m.name ASC,
        cdm.material_id ASC
    `;

    return NextResponse.json(
      balances.map((item) => ({
        id: item.id,
        customer_id: item.customer_id,
        material_id: item.material_id,
        material_name: item.material_name,
        unit: item.unit,
        current_quantity: item.current_quantity,
      }))
    );
  } catch (error) {
    console.error(
      "Failed to fetch customer deposit material balances",
      error
    );

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}

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

    const customerId =
      typeof data.customer_id === "number"
        ? data.customer_id
        : Number(data.customer_id);

    const materialType =
      typeof data.material_type === "string"
        ? data.material_type.trim()
        : "";

    const quantity =
      typeof data.quantity === "number"
        ? data.quantity
        : Number(data.quantity);

    if (!Number.isInteger(customerId) || customerId <= 0) {
      return NextResponse.json(
        { error: "Invalid customer_id" },
        { status: 400 }
      );
    }

    if (!isDepositMaterialType(materialType)) {
      return NextResponse.json(
        { error: "Invalid material_type" },
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
      const customer = await tx.customers.findUnique({
        where: {
          id: customerId,
        },
        select: {
          id: true,
        },
      });

      if (!customer) {
        throw new Error("CUSTOMER_NOT_FOUND");
      }

      const materialDefinition =
        DEPOSIT_MATERIAL_DEFINITIONS[materialType];
      const materials = await tx.$queryRaw<
        { id: number; name: string; unit: string }[]
      >`
        SELECT id, name, unit
        FROM materials
        WHERE is_active = true
          AND name LIKE ${materialDefinition.pattern}
        ORDER BY id ASC
        LIMIT 1
      `;

      const material =
        materials[0] ??
        (await tx.materials.create({
          data: {
            name: materialDefinition.name,
            unit: materialDefinition.unit,
            is_active: true,
          },
          select: {
            id: true,
            name: true,
            unit: true,
          },
        }));

      const depositMaterials = await tx.$queryRaw<{ id: number }[]>`
        INSERT INTO customer_deposit_materials (
          customer_id,
          material_id
        )
        VALUES (
          ${customerId},
          ${material.id}
        )
        ON CONFLICT (customer_id, material_id)
        DO UPDATE SET updated_at = NOW()
        RETURNING id
      `;

      const depositMaterial = depositMaterials[0];

      if (!depositMaterial) {
        throw new Error("DEPOSIT_MATERIAL_NOT_FOUND");
      }

      const transactions = await tx.$queryRaw<
        {
          id: number;
          deposit_material_id: number;
          transaction_type: string;
          quantity: string;
          created_at: Date;
        }[]
      >`
        INSERT INTO customer_deposit_material_transactions (
          deposit_material_id,
          transaction_type,
          quantity
        )
        VALUES (
          ${depositMaterial.id},
          'deposit',
          ${quantity}
        )
        RETURNING
          id,
          deposit_material_id,
          transaction_type,
          quantity::text AS quantity,
          created_at
      `;

      const transaction = transactions[0];

      if (!transaction) {
        throw new Error("DEPOSIT_TRANSACTION_NOT_CREATED");
      }

      return {
        transaction,
        material,
      };
    });

    return NextResponse.json(
      {
        id: result.transaction.id,
        deposit_material_id:
          result.transaction.deposit_material_id,
        transaction_type: result.transaction.transaction_type,
        quantity: result.transaction.quantity,
        material_id: result.material.id,
        material_name: result.material.name,
        unit: result.material.unit,
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
      error.message === "CUSTOMER_NOT_FOUND"
    ) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    if (
      error instanceof Error &&
      error.message === "MATERIAL_NOT_FOUND"
    ) {
      return NextResponse.json(
        { error: "Material not found" },
        { status: 404 }
      );
    }

    console.error(
      "Failed to create customer deposit material transaction",
      error
    );

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}
