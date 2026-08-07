import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
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