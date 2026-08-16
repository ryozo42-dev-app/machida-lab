import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await context.params;
    const id = Number(idParam);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { error: "歯科医院IDが不正です" },
        { status: 400 }
      );
    }

    const body = await request.json();

    const code = typeof body.code === "string" ? body.code.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!code || !name) {
      return NextResponse.json(
        { error: "歯科医院コードと医院名を入力してください" },
        { status: 400 }
      );
    }

    const billingClosingMonthEnd = Boolean(
      body.billing_closing_month_end
    );

    const billingClosingDay =
      billingClosingMonthEnd ||
      body.billing_closing_day === null ||
      body.billing_closing_day === undefined ||
      body.billing_closing_day === ""
        ? null
        : Number(body.billing_closing_day);

    const billingIssueMonthEnd = Boolean(body.billing_issue_month_end);

    const billingIssueDay =
      billingIssueMonthEnd ||
      body.billing_issue_day === null ||
      body.billing_issue_day === undefined ||
      body.billing_issue_day === ""
        ? null
        : Number(body.billing_issue_day);

    if (
      billingClosingDay !== null &&
      (!Number.isInteger(billingClosingDay) ||
        billingClosingDay < 1 ||
        billingClosingDay > 31)
    ) {
      return NextResponse.json(
        { error: "請求締日は1〜31で入力してください" },
        { status: 400 }
      );
    }

    if (
      billingIssueDay !== null &&
      (!Number.isInteger(billingIssueDay) ||
        billingIssueDay < 1 ||
        billingIssueDay > 31)
    ) {
      return NextResponse.json(
        { error: "請求書発行日は1〜31で入力してください" },
        { status: 400 }
      );
    }

    const existing = await prisma.customers.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "歯科医院が見つかりません" },
        { status: 404 }
      );
    }

    const duplicate = await prisma.customers.findFirst({
      where: {
        AND: [
          { id: { not: id } },
          {
            OR: [{ code }, { name }],
          },
        ],
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    if (duplicate) {
      return NextResponse.json(
        {
          error:
            duplicate.code === code
              ? "歯科医院コードが既に登録されています"
              : "同じ歯科医院名が既に登録されています",
        },
        { status: 409 }
      );
    }

    const customer = await prisma.customers.update({
      where: { id },
      data: {
        code,
        name,
        billing_closing_day: billingClosingDay,
        billing_closing_month_end: billingClosingMonthEnd,
        billing_issue_day: billingIssueDay,
        billing_issue_month_end: billingIssueMonthEnd,
        show_material_on_delivery: Boolean(body.show_material_on_delivery),
      },
      select: {
        id: true,
        code: true,
        name: true,
        billing_closing_day: true,
        billing_closing_month_end: true,
        billing_issue_day: true,
        billing_issue_month_end: true,
        show_material_on_delivery: true,
      },
    });

    return NextResponse.json(customer);
  } catch (error) {
    console.error("Failed to update customer", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}