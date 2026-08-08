import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type CreatePatientBody = {
  customer_id?: unknown;
  patient_name?: unknown;
  patient_kana?: unknown;
};

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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreatePatientBody;
    const customerId = Number(body.customer_id);
    const patientName = String(body.patient_name ?? "").trim();
    const patientKanaRaw = body.patient_kana;
    const patientKana =
      patientKanaRaw === undefined || patientKanaRaw === null
        ? null
        : String(patientKanaRaw).trim() || null;

    if (!Number.isInteger(customerId) || customerId <= 0) {
      return NextResponse.json(
        { error: "customer_id is required" },
        { status: 400 }
      );
    }

    if (patientName.length === 0) {
      return NextResponse.json(
        { error: "patient_name is required" },
        { status: 400 }
      );
    }

    if (patientName.length > 100) {
      return NextResponse.json(
        { error: "patient_name is too long" },
        { status: 400 }
      );
    }

    if (patientKana !== null && patientKana.length > 100) {
      return NextResponse.json(
        { error: "patient_kana is too long" },
        { status: 400 }
      );
    }

    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      select: { id: true },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Invalid customer_id" },
        { status: 400 }
      );
    }

    const patient = await prisma.patients.create({
      data: {
        customer_id: customerId,
        patient_name: patientName,
        patient_kana: patientKana,
      },
      select: {
        id: true,
        customer_id: true,
        patient_name: true,
        patient_kana: true,
      },
    });

    return NextResponse.json(patient, { status: 201 });
  } catch (error) {
    console.error("Failed to create patient", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}