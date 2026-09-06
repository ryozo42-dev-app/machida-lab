import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  const searchParams = new URL(request.url).searchParams;

  const customerIdParam = searchParams.get("customer_id");
  const typeParam = searchParams.get("type");
  const insuranceItemIdParam = searchParams.get("insurance_item_id");
  const privateItemIdParam = searchParams.get("private_item_id");
  const privateItemMasterIdParam = searchParams.get("private_item_master_id");

  const customerId = Number(customerIdParam);
  const insuranceItemId = insuranceItemIdParam === null ? null : Number(insuranceItemIdParam);
  const privateItemId = privateItemIdParam === null ? null : Number(privateItemIdParam);
  const privateItemMasterId =
    privateItemMasterIdParam === null ? null : Number(privateItemMasterIdParam);

  if (
    customerIdParam === null ||
    customerIdParam.trim() === "" ||
    !Number.isInteger(customerId) ||
    customerId <= 0
  ) {
    return NextResponse.json({ error: "customer_id is required" }, { status: 400 });
  }

  if (typeParam !== "insurance" && typeParam !== "private") {
    return NextResponse.json({ error: "type must be insurance or private" }, { status: 400 });
  }

  if (typeParam === "insurance") {
    if (
      insuranceItemIdParam === null ||
      insuranceItemIdParam.trim() === "" ||
      !Number.isInteger(insuranceItemId) ||
      insuranceItemId === null ||
      insuranceItemId <= 0
    ) {
      return NextResponse.json({ error: "insurance_item_id is required" }, { status: 400 });
    }

    const priceRow = await prisma.customer_insurance_prices.findFirst({
      where: {
        customer_id: customerId,
        insurance_item_id: insuranceItemId,
      },
      select: {
        price: true,
      },
    });

    return NextResponse.json({
      price: priceRow ? Number(priceRow.price) : null,
    });
  }

  const hasPrivateItemId =
    privateItemIdParam !== null && privateItemIdParam.trim() !== "";
  const hasPrivateItemMasterId =
    privateItemMasterIdParam !== null &&
    privateItemMasterIdParam.trim() !== "";

  if (hasPrivateItemId && hasPrivateItemMasterId) {
    return NextResponse.json(
      { error: "Only one of private_item_id or private_item_master_id can be specified" },
      { status: 400 }
    );
  }

  if (!hasPrivateItemId && !hasPrivateItemMasterId) {
    return NextResponse.json({ error: "private_item_id is required" }, { status: 400 });
  }

  if (hasPrivateItemMasterId) {
    if (
      !Number.isInteger(privateItemMasterId) ||
      privateItemMasterId === null ||
      privateItemMasterId <= 0
    ) {
      return NextResponse.json({ error: "private_item_master_id is required" }, { status: 400 });
    }

    const priceRow = await prisma.customer_private_prices.findFirst({
      where: {
        customer_id: customerId,
        private_item_master_id: privateItemMasterId,
      },
      select: {
        price: true,
      },
    });

    return NextResponse.json({
      price: priceRow ? Number(priceRow.price) : null,
    });
  }

  if (
    !Number.isInteger(privateItemId) ||
    privateItemId === null ||
    privateItemId <= 0
  ) {
    return NextResponse.json({ error: "private_item_id is required" }, { status: 400 });
  }

  const priceRow = await prisma.customer_private_prices.findFirst({
    where: {
      customer_id: customerId,
      private_item_id: privateItemId,
    },
    select: {
      price: true,
    },
  });

  return NextResponse.json({
    price: priceRow ? Number(priceRow.price) : null,
  });
}
