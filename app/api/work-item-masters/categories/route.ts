import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import {
  createCategory,
  handleWorkItemMasterError,
  parseCreateBody,
  parseType,
} from "../_shared";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const type = parseType(new URL(request.url).searchParams.get("type"));

    const categories =
      type === "insurance"
        ? await prisma.insurance_categories.findMany({
            orderBy: [{ sort_order: "asc" }, { id: "asc" }],
            select: { id: true, name: true, sort_order: true, is_active: true },
          })
        : await prisma.private_categories.findMany({
            orderBy: [{ sort_order: "asc" }, { id: "asc" }],
            select: { id: true, name: true, sort_order: true, is_active: true },
          });

    return NextResponse.json(
      categories.map((category) => ({
        ...category,
        type,
        level: "category",
      }))
    );
  } catch (error) {
    return handleWorkItemMasterError(
      error,
      "GET /api/work-item-masters/categories failed"
    );
  }
}

export async function POST(request: Request) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const { type, name } = parseCreateBody(await request.json(), 100);
    const category = await createCategory(type, name);

    return NextResponse.json(
      {
        ...category,
        type,
        level: "category",
      },
      { status: 201 }
    );
  } catch (error) {
    return handleWorkItemMasterError(
      error,
      "POST /api/work-item-masters/categories failed"
    );
  }
}
