import { NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const orders = await prisma.orders.findMany();

    return NextResponse.json(orders);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const body = await request.json();

    const order = await prisma.orders.create({
      data: {
        customer_id: body.customer_id,
        patient_id: body.patient_id,
        order_date: new Date(body.order_date),
        delivery_date: body.delivery_date
          ? new Date(body.delivery_date)
          : null,
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
