import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const USER_ROLES = new Set(["admin", "staff"]);
const USER_SELECT = {
  id: true,
  login_id: true,
  user_name: true,
  role: true,
  created_at: true,
};

async function requireAdmin() {
  const user = await requireAuth();

  if (user.role !== "admin") {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      ),
    };
  }

  return {
    user,
    response: null,
  };
}

function normalizeLoginId(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeRequiredText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function GET() {
  try {
    const { response } = await requireAdmin();
    if (response) return response;

    const users = await prisma.users.findMany({
      orderBy: { id: "asc" },
      select: USER_SELECT,
    });

    return NextResponse.json(users);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.error("GET /api/users failed", error);

    return NextResponse.json(
      { error: "ユーザー一覧の取得に失敗しました" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { response } = await requireAdmin();
    if (response) return response;

    const body = await request.json();
    const userName = normalizeRequiredText(body.user_name);
    const loginId = normalizeLoginId(body.login_id);
    const password =
      typeof body.password === "string" ? body.password : "";
    const role = normalizeRequiredText(body.role);

    if (!userName || !loginId || !password) {
      return NextResponse.json(
        {
          error:
            "ユーザー名、メールアドレス、パスワードを入力してください",
        },
        { status: 400 }
      );
    }

    if (!USER_ROLES.has(role)) {
      return NextResponse.json(
        { error: "権限はadminまたはstaffを指定してください" },
        { status: 400 }
      );
    }

    const duplicate = await prisma.users.findUnique({
      where: { login_id: loginId },
      select: { id: true },
    });

    if (duplicate) {
      return NextResponse.json(
        { error: "同じメールアドレスが既に登録されています" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.users.create({
      data: {
        user_name: userName,
        login_id: loginId,
        password_hash: passwordHash,
        role,
      },
      select: USER_SELECT,
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (isUniqueError(error)) {
      return NextResponse.json(
        { error: "同じメールアドレスが既に登録されています" },
        { status: 409 }
      );
    }

    console.error("POST /api/users failed", error);

    return NextResponse.json(
      { error: "ユーザーの作成に失敗しました" },
      { status: 500 }
    );
  }
}
