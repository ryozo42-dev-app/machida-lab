import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  createSession,
  getSessionCookieOptions,
  verifyPasswordLogin,
} from "@/lib/auth";
import {
  EMAIL_OTP_EXPIRES_IN_SECONDS,
  generateEmailOtp,
  generateEmailOtpChallengeToken,
  hashEmailOtp,
  hashEmailOtpChallengeToken,
} from "@/lib/email-otp";
import { sendEmailOtp } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

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

    if (process.env.EMAIL_2FA_ENABLED === "true") {
      if (!user.login_id) {
        throw new Error("User login_id is required for email 2FA");
      }

      const otp = generateEmailOtp();
      const challengeToken = generateEmailOtpChallengeToken();
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + EMAIL_OTP_EXPIRES_IN_SECONDS * 1000
      );

      await prisma.email_otp_challenges.create({
        data: {
          user_id: user.id,
          otp_hash: hashEmailOtp({
            challengeToken,
            otp,
          }),
          challenge_token_hash:
            hashEmailOtpChallengeToken(challengeToken),
          expires_at: expiresAt,
          attempt_count: 0,
          last_sent_at: now,
        },
      });

      await sendEmailOtp({
        to: user.login_id,
        otp,
      });

      return NextResponse.json({
        requires_otp: true,
        challenge_token: challengeToken,
      });
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
