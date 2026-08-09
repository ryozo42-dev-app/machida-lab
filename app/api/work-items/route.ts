import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type WorkItemType = "insurance" | "private";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const customerIdParam = searchParams.get("customer_id");
  const typeParam = searchParams.get("type");
  const keyword = searchParams.get("q")?.trim() ?? "";
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

  if (typeParam !== "insurance" && typeParam !== "private") {
    return NextResponse.json(
      { error: "type must be insurance or private" },
      { status: 400 }
    );
  }

  if (keyword.length === 0) {
    return NextResponse.json([]);
  }

  try {
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

    const type = typeParam as WorkItemType;

    if (type === "insurance") {
      const items = await prisma.insurance_items.findMany({
        where: {
          item_name: {
            contains: keyword,
            mode: "insensitive",
          },
        },
        select: {
          id: true,
          item_name: true,
        },
        orderBy: {
          item_name: "asc",
        },
        take: 20,
      });

      return NextResponse.json(
        items.map((item) => ({
          id: item.id,
          item_name: item.item_name,
          type,
        }))
      );
    }

    const items = await prisma.private_items.findMany({
      where: {
        item_name: {
          contains: keyword,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        item_name: true,
      },
      orderBy: {
        item_name: "asc",
      },
      take: 20,
    });

    return NextResponse.json(
      items.map((item) => ({
        id: item.id,
        item_name: item.item_name,
        type,
      }))
    );
  } catch (error) {
    console.error("Failed to fetch work items", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}
