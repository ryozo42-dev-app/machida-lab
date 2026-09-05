import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  createSession,
  getSessionCookieOptions,
} from "@/lib/auth";
import {
  EMAIL_OTP_MAX_ATTEMPTS,
  hashEmailOtpChallengeToken,
  verifyEmailOtp,
} from "@/lib/email-otp";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const INVALID_OTP_MESSAGE =
  "認証コードが正しくないか、有効期限が切れています";

function isValidVerifyBody(
  body: unknown
): body is { challenge_token: string; otp: string } {
  if (body === null || typeof body !== "object") {
    return false;
  }

  const record = body as Record<string, unknown>;

  return (
    typeof record.challenge_token === "string" &&
    record.challenge_token.length > 0 &&
    typeof record.otp === "string" &&
    /^[0-9]{6}$/.test(record.otp)
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!isValidVerifyBody(body)) {
      return NextResponse.json(
        { error: "リクエスト内容が正しくありません" },
        { status: 400 }
      );
    }

    const now = new Date();
    const challengeTokenHash = hashEmailOtpChallengeToken(
      body.challenge_token
    );
    const challenge =
      await prisma.email_otp_challenges.findUnique({
        where: {
          challenge_token_hash: challengeTokenHash,
        },
        select: {
          id: true,
          user_id: true,
          otp_hash: true,
          expires_at: true,
          consumed_at: true,
          invalidated_at: true,
          attempt_count: true,
          users: {
            select: {
              id: true,
              login_id: true,
              user_name: true,
              role: true,
            },
          },
        },
      });

    if (
      !challenge ||
      challenge.consumed_at !== null ||
      challenge.invalidated_at !== null ||
      challenge.expires_at.getTime() <= now.getTime() ||
      challenge.attempt_count >= EMAIL_OTP_MAX_ATTEMPTS
    ) {
      return NextResponse.json(
        { error: INVALID_OTP_MESSAGE },
        { status: 401 }
      );
    }

    const isValidOtp = verifyEmailOtp({
      challengeToken: body.challenge_token,
      otp: body.otp,
      expectedHash: challenge.otp_hash,
    });

    if (!isValidOtp) {
      await prisma.email_otp_challenges.update({
        where: {
          id: challenge.id,
        },
        data: {
          attempt_count: {
            increment: 1,
          },
        },
      });

      return NextResponse.json(
        { error: INVALID_OTP_MESSAGE },
        { status: 401 }
      );
    }

    const consumedResult =
      await prisma.email_otp_challenges.updateMany({
        where: {
          id: challenge.id,
          consumed_at: null,
          invalidated_at: null,
          expires_at: {
            gt: now,
          },
          attempt_count: {
            lt: EMAIL_OTP_MAX_ATTEMPTS,
          },
        },
        data: {
          consumed_at: now,
        },
      });

    if (consumedResult.count !== 1) {
      return NextResponse.json(
        { error: INVALID_OTP_MESSAGE },
        { status: 401 }
      );
    }

    const session = await createSession(challenge.user_id);
    const response = NextResponse.json({
      user: challenge.users,
    });

    response.cookies.set(
      AUTH_COOKIE_NAME,
      session.token,
      getSessionCookieOptions(session.expiresAt)
    );

    return response;
  } catch (error) {
    console.error("POST /api/auth/otp/verify failed", error);

    return NextResponse.json(
      { error: "認証コードの確認に失敗しました" },
      { status: 500 }
    );
  }
}
