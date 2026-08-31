import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  createSession,
  getSessionCookieOptions,
  verifyPasswordLogin,
} from "@/lib/auth";

export const runtime = "nodejs";

const INVALID_CREDENTIALS_MESSAGE =
  "メールアドレスまたはパスワードが正しくありません";

function isValidLoginBody(
  body: unknown
): body is { email: string; password: string } {
  if (body === null || typeof body !== "object") {
    return false;
  }

  const record = body as Record<string, unknown>;

  return (
    typeof record.email === "string" &&
    typeof record.password === "string"
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!isValidLoginBody(body)) {
      return NextResponse.json(
        { error: INVALID_CREDENTIALS_MESSAGE },
        { status: 401 }
      );
    }

    const user = await verifyPasswordLogin(
      body.email,
      body.password
    );

    if (!user) {
      return NextResponse.json(
        { error: INVALID_CREDENTIALS_MESSAGE },
        { status: 401 }
      );
    }

    const session = await createSession(user.id);
    const response = NextResponse.json({
      user,
    });

    response.cookies.set(
      AUTH_COOKIE_NAME,
      session.token,
      getSessionCookieOptions(session.expiresAt)
    );

    return response;
  } catch (error) {
    console.error("POST /api/auth/login failed", error);

    return NextResponse.json(
      { error: "ログイン処理に失敗しました" },
      { status: 500 }
    );
  }
}
