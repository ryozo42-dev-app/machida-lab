import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const customerIdParam = new URL(request.url).searchParams.get("customer_id");
  const customerId = Number(customerIdParam);

  if (
    customerIdParam === null ||
    customerIdParam.trim() === "" ||
    !Number.isInteger(customerId) ||
    customerId <= 0
  ) {
    return NextResponse.json(
      { error: "customer_id is required" },
      { status: 400 }
    );
  }

  try {
    const patients = await prisma.patients.findMany({
      where: {
        customer_id: customerId,
      },
      select: {
        id: true,
        customer_id: true,
        patient_name: true,
        patient_kana: true,
      },
      orderBy: {
        patient_name: "asc",
      },
    });

    return NextResponse.json(patients);
  } catch (error) {
    console.error("Failed to fetch patients", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}