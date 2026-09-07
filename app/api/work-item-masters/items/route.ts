import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import {
  createItemMaster,
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
    const subCategoryId = parseParentId(
      searchParams.get("sub_category_id"),
      "sub_category_id"
    );

    const items =
      type === "insurance"
        ? await prisma.insurance_item_masters.findMany({
            where: { sub_category_id: subCategoryId },
            orderBy: [{ sort_order: "asc" }, { id: "asc" }],
            select: {
              id: true,
              sub_category_id: true,
              name: true,
              sort_order: true,
              is_active: true,
            },
          })
        : await prisma.private_item_masters.findMany({
            where: { sub_category_id: subCategoryId },
            orderBy: [{ sort_order: "asc" }, { id: "asc" }],
            select: {
              id: true,
              sub_category_id: true,
              name: true,
              sort_order: true,
              is_active: true,
            },
          });

    return NextResponse.json(
      items.map((item) => ({
        ...item,
        item_name: item.name,
        type,
        level: "item",
      }))
    );
  } catch (error) {
    return handleWorkItemMasterError(
      error,
      "GET /api/work-item-masters/items failed"
    );
  }
}

export async function POST(request: Request) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const { type, name, body } = parseCreateBody(await request.json(), 200);
    const subCategoryId = parseParentId(body.sub_category_id, "sub_category_id");
    const item = await createItemMaster(type, subCategoryId, name);

    return NextResponse.json(
      {
        ...item,
        item_name: item.name,
        type,
        level: "item",
      },
      { status: 201 }
    );
  } catch (error) {
    return handleWorkItemMasterError(
      error,
      "POST /api/work-item-masters/items failed"
    );
  }
}
