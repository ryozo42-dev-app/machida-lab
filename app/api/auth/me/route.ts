import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      user,
    });
  } catch (error) {
    console.error("GET /api/auth/me failed", error);

    return NextResponse.json(
      { error: "認証状態の取得に失敗しました" },
      { status: 500 }
    );
  }
}
