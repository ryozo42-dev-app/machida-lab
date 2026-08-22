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