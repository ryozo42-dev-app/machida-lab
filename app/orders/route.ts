import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function parseOrderBody(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return req.json();
  }

  const formData = await req.formData();

  return {
    customer_id: Number(formData.get("customer_id")),
    patient_id: Number(formData.get("patient_id")),
    order_date: formData.get("order_date") || new Date().toISOString(),
    delivery_date: formData.get("delivery_date") || new Date().toISOString(),
    insurance_type: String(formData.get("insurance_type") ?? "保険"),
    remarks: String(formData.get("remarks") ?? ""),
  };
}

export async function GET() {
  const orders = await prisma.orders.findMany({
    orderBy: {
      id: "desc",
    },
  });

  return NextResponse.json(orders);
}

export async function POST(req: NextRequest) {
  try {
    const body = await parseOrderBody(req);

    const order = await prisma.orders.create({
      data: {
        customer_id: body.customer_id,
        patient_id: body.patient_id,
        order_date: new Date(body.order_date),
        delivery_date: body.delivery_date ? new Date(body.delivery_date) : null,
        insurance_type: body.insurance_type,
        remarks: body.remarks,
      },
    });

    return NextResponse.json(order);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}