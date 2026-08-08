import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const insuranceItems = await prisma.insurance_items.findMany({
      select: {
        id: true,
        category: true,
        item_name: true,
      },
      orderBy: [
        { category: "asc" },
        { item_name: "asc" },
      ],
    });

    return NextResponse.json(insuranceItems);
  } catch (error) {
    console.error("Failed to fetch insurance items", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}