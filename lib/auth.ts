import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const AUTH_COOKIE_NAME = "machida_lab_session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

export type AuthUser = {
  id: number;
  login_id: string | null;
  user_name: string | null;
  role: string | null;
};

function normalizeLoginId(value: string) {
  return value.trim().toLowerCase();
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

function isSameHash(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function getSessionCookieOptions(expiresAt?: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    expires: expiresAt,
  };
}

export function getExpiredSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  };
}

export async function verifyPassword(
  password: string,
  passwordHash: string
) {
  return bcrypt.compare(password, passwordHash);
}

export async function verifyPasswordLogin(
  email: string,
  password: string
) {
  const loginId = normalizeLoginId(email);

  if (!loginId || !password) {
    return null;
  }

  const user = await prisma.users.findUnique({
    where: {
      login_id: loginId,
    },
    select: {
      id: true,
      login_id: true,
      user_name: true,
      password_hash: true,
      role: true,
    },
  });

  if (!user?.password_hash) {
    return null;
  }

  const isValid = await verifyPassword(
    password,
    user.password_hash
  );

  if (!isValid) {
    return null;
  }

  return {
    id: user.id,
    login_id: user.login_id,
    user_name: user.user_name,
    role: user.role,
  };
}

export async function createSession(userId: number) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(
    Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  );

  await prisma.user_sessions.create({
    data: {
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    },
  });

  return {
    token,
    expiresAt,
  };
}

export async function getSessionTokenFromCookie() {
  const cookieStore = await cookies();

  return cookieStore.get(AUTH_COOKIE_NAME)?.value ?? null;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getSessionTokenFromCookie();

  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const session = await prisma.user_sessions.findUnique({
    where: {
      token_hash: tokenHash,
    },
    select: {
      token_hash: true,
      expires_at: true,
      revoked_at: true,
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

  if (!session || !isSameHash(session.token_hash, tokenHash)) {
    return null;
  }

  if (session.revoked_at !== null) {
    return null;
  }

  if (session.expires_at.getTime() <= Date.now()) {
    return null;
  }

  return session.users;
}

export async function requireAuth() {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthError();
  }

  return user;
}

export async function requireAuthResponse() {
  try {
    await requireAuth();
    return null;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    throw error;
  }
}

export async function revokeSessionToken(token: string | null) {
  if (!token) {
    return;
  }

  await prisma.user_sessions.updateMany({
    where: {
      token_hash: hashSessionToken(token),
      revoked_at: null,
    },
    data: {
      revoked_at: new Date(),
    },
  });
}

export async function revokeCurrentSession() {
  const token = await getSessionTokenFromCookie();

  await revokeSessionToken(token);
}
