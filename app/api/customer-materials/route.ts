import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  const searchParams = new URL(request.url).searchParams;
  const customerIdParam = searchParams.get("customer_id");

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

  try {
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
      },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    const customerMaterials = await prisma.customer_materials.findMany({
      where: {
        customer_id: customerId,
        is_active: true,
      },
      select: {
        id: true,
        customer_id: true,
        material_id: true,
        current_quantity: true,
        report_on_delivery: true,
        materials: {
          select: {
            id: true,
            name: true,
            unit: true,
          },
        },
      },
      orderBy: {
        material_id: "asc",
      },
    });

    return NextResponse.json(
      customerMaterials.map((item) => ({
        id: item.id,
        customer_id: item.customer_id,
        material_id: item.material_id,
        material_name: item.materials.name,
        unit: item.materials.unit,
        current_quantity: item.current_quantity.toString(),
        report_on_delivery: item.report_on_delivery,
      }))
    );
  } catch (error) {
    console.error("Failed to fetch customer materials", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}
export async function POST(request: Request) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

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

    const materialId =
      typeof data.material_id === "number"
        ? data.material_id
        : Number(data.material_id);

    const currentQuantity =
      typeof data.current_quantity === "number"
        ? data.current_quantity
        : Number(data.current_quantity);

    const reportOnDelivery =
      typeof data.report_on_delivery === "boolean"
        ? data.report_on_delivery
        : false;

    if (
      !Number.isInteger(customerId) ||
      customerId <= 0 ||
      !Number.isInteger(materialId) ||
      materialId <= 0 ||
      !Number.isFinite(currentQuantity) ||
      currentQuantity < 0
    ) {
      return NextResponse.json(
        { error: "Invalid customer_id, material_id, or current_quantity" },
        { status: 400 }
      );
    }

    const [customer, material] = await Promise.all([
      prisma.customers.findUnique({
        where: { id: customerId },
        select: { id: true },
      }),
      prisma.materials.findUnique({
        where: { id: materialId },
        select: { id: true, is_active: true },
      }),
    ]);

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    if (!material || !material.is_active) {
      return NextResponse.json(
        { error: "Material not found" },
        { status: 404 }
      );
    }

    const existing = await prisma.customer_materials.findFirst({
      where: {
        customer_id: customerId,
        material_id: materialId,
        is_active: true,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Customer material already exists" },
        { status: 409 }
      );
    }

    const customerMaterial = await prisma.customer_materials.create({
      data: {
        customer_id: customerId,
        material_id: materialId,
        current_quantity: currentQuantity,
        report_on_delivery: reportOnDelivery,
        is_active: true,
      },
      select: {
        id: true,
        customer_id: true,
        material_id: true,
        current_quantity: true,
        report_on_delivery: true,
        materials: {
          select: {
            id: true,
            name: true,
            unit: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        id: customerMaterial.id,
        customer_id: customerMaterial.customer_id,
        material_id: customerMaterial.material_id,
        material_name: customerMaterial.materials.name,
        unit: customerMaterial.materials.unit,
        current_quantity: customerMaterial.current_quantity.toString(),
        report_on_delivery: customerMaterial.report_on_delivery,
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

    console.error("Failed to create customer material", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}
