import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import {
  handleWorkItemMasterError,
  parseId,
  parsePatchBody,
  updateItemMaster,
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
    const { type, ...data } = parsePatchBody(await request.json(), 200);
    const item = await updateItemMaster(type, id, data);

    return NextResponse.json({
      ...item,
      item_name: item.name,
      type,
      level: "item",
    });
  } catch (error) {
    return handleWorkItemMasterError(
      error,
      "PATCH /api/work-item-masters/items/[id] failed"
    );
  }
}
