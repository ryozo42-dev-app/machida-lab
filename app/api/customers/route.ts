import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const customers = await prisma.customers.findMany({
      select: {
        id: true,
        code: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(customers);
  } catch (error) {
    console.error("Failed to fetch customers", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const code = typeof body.code === "string" ? body.code.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!code || !name) {
      return NextResponse.json(
        { error: "歯科医院コードと医院名を入力してください" },
        { status: 400 }
      );
    }

    const existing = await prisma.customers.findFirst({
      where: {
        OR: [
          { code },
          { name },
        ],
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    if (existing) {
      return NextResponse.json(
        {
          error:
            existing.code === code
              ? "歯科医院コードが既に登録されています"
              : "同じ歯科医院名が既に登録されています",
        },
        { status: 409 }
      );
    }

    const customer = await prisma.customers.create({
      data: {
        code,
        name,
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    console.error("Failed to create customer", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}
