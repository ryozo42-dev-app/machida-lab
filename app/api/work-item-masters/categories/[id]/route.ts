import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import {
  handleWorkItemMasterError,
  parseId,
  parsePatchBody,
  updateCategory,
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
    const category = await updateCategory(type, id, data);

    return NextResponse.json({
      ...category,
      type,
      level: "category",
    });
  } catch (error) {
    return handleWorkItemMasterError(
      error,
      "PATCH /api/work-item-masters/categories/[id] failed"
    );
  }
}
