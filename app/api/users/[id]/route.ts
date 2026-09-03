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

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasOwn(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function isUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user: currentUser, response } = await requireAdmin();
    if (response) return response;

    const { id: idParam } = await context.params;
    const id = Number(idParam);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { error: "ユーザーIDが不正です" },
        { status: 400 }
      );
    }

    const existing = await prisma.users.findUnique({
      where: { id },
      select: {
        id: true,
        login_id: true,
        role: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "ユーザーが見つかりません" },
        { status: 404 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const data: {
      user_name?: string;
      login_id?: string;
      role?: string;
      password_hash?: string;
    } = {};

    if (hasOwn(body, "user_name")) {
      const userName = normalizeText(body.user_name);

      if (!userName) {
        return NextResponse.json(
          { error: "ユーザー名を入力してください" },
          { status: 400 }
        );
      }

      data.user_name = userName;
    }

    if (hasOwn(body, "login_id")) {
      const loginId = normalizeLoginId(body.login_id);

      if (!loginId) {
        return NextResponse.json(
          { error: "メールアドレスを入力してください" },
          { status: 400 }
        );
      }

      if (loginId !== existing.login_id) {
        const duplicate = await prisma.users.findUnique({
          where: { login_id: loginId },
          select: { id: true },
        });

        if (duplicate && duplicate.id !== id) {
          return NextResponse.json(
            { error: "同じメールアドレスが既に登録されています" },
            { status: 409 }
          );
        }
      }

      data.login_id = loginId;
    }

    if (hasOwn(body, "role")) {
      const role = normalizeText(body.role);

      if (!USER_ROLES.has(role)) {
        return NextResponse.json(
          { error: "権限はadminまたはstaffを指定してください" },
          { status: 400 }
        );
      }

      if (currentUser?.id === id && role === "staff") {
        return NextResponse.json(
          { error: "自分自身の権限をstaffへ変更できません" },
          { status: 400 }
        );
      }

      data.role = role;
    }

    if (hasOwn(body, "password")) {
      if (
        body.password !== null &&
        body.password !== undefined &&
        typeof body.password !== "string"
      ) {
        return NextResponse.json(
          { error: "パスワードが不正です" },
          { status: 400 }
        );
      }

      const password =
        typeof body.password === "string" ? body.password : "";

      if (password) {
        data.password_hash = await bcrypt.hash(password, 12);
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "更新項目がありません" },
        { status: 400 }
      );
    }

    const shouldRevokeTargetSessions =
      Boolean(data.password_hash) && currentUser?.id !== id;
    const revokedAt = new Date();

    const user = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.users.update({
        where: { id },
        data,
        select: USER_SELECT,
      });

      if (shouldRevokeTargetSessions) {
        await tx.user_sessions.updateMany({
          where: {
            user_id: id,
            revoked_at: null,
          },
          data: {
            revoked_at: revokedAt,
          },
        });
      }

      return updatedUser;
    });

    return NextResponse.json(user);
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

    console.error("PATCH /api/users/[id] failed", error);

    return NextResponse.json(
      { error: "ユーザーの更新に失敗しました" },
      { status: 500 }
    );
  }
}
