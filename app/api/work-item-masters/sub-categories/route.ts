import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import {
  createSubCategory,
  handleWorkItemMasterError,
  parseCreateBody,
  parseParentId,
  parseType,
} from "../_shared";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const searchParams = new URL(request.url).searchParams;
    const type = parseType(searchParams.get("type"));
    const categoryId = parseParentId(searchParams.get("category_id"), "category_id");

    const subCategories =
      type === "insurance"
        ? await prisma.insurance_sub_categories.findMany({
            where: { category_id: categoryId },
            orderBy: [{ sort_order: "asc" }, { id: "asc" }],
            select: {
              id: true,
              category_id: true,
              name: true,
              sort_order: true,
              is_active: true,
            },
          })
        : await prisma.private_sub_categories.findMany({
            where: { category_id: categoryId },
            orderBy: [{ sort_order: "asc" }, { id: "asc" }],
            select: {
              id: true,
              category_id: true,
              name: true,
              sort_order: true,
              is_active: true,
            },
          });

    return NextResponse.json(
      subCategories.map((subCategory) => ({
        ...subCategory,
        type,
        level: "sub_category",
      }))
    );
  } catch (error) {
    return handleWorkItemMasterError(
      error,
      "GET /api/work-item-masters/sub-categories failed"
    );
  }
}

export async function POST(request: Request) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const { type, name, body } = parseCreateBody(await request.json(), 100);
    const categoryId = parseParentId(body.category_id, "category_id");
    const subCategory = await createSubCategory(type, categoryId, name);

    return NextResponse.json(
      {
        ...subCategory,
        type,
        level: "sub_category",
      },
      { status: 201 }
    );
  } catch (error) {
    return handleWorkItemMasterError(
      error,
      "POST /api/work-item-masters/sub-categories failed"
    );
  }
}
