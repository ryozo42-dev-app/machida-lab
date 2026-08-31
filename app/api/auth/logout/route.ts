import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  getExpiredSessionCookieOptions,
  revokeCurrentSession,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    await revokeCurrentSession();

    const response = NextResponse.json({
      ok: true,
    });

    response.cookies.set(
      AUTH_COOKIE_NAME,
      "",
      getExpiredSessionCookieOptions()
    );

    return response;
  } catch (error) {
    console.error("POST /api/auth/logout failed", error);

    return NextResponse.json(
      { error: "ログアウト処理に失敗しました" },
      { status: 500 }
    );
  }
}
