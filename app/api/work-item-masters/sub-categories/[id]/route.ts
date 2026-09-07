import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import {
  handleWorkItemMasterError,
  parseId,
  parsePatchBody,
  updateSubCategory,
} from "../../_shared";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);
    const { type, ...data } = parsePatchBody(await request.json(), 100);
    const subCategory = await updateSubCategory(type, id, data);

    return NextResponse.json({
      ...subCategory,
      type,
      level: "sub_category",
    });
  } catch (error) {
    return handleWorkItemMasterError(
      error,
      "PATCH /api/work-item-masters/sub-categories/[id] failed"
    );
  }
}
