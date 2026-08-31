import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const materials = await prisma.materials.findMany({
      where: {
        is_active: true,
      },
      select: {
        id: true,
        name: true,
        unit: true,
        is_active: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(materials);
  } catch (error) {
    console.error("Failed to fetch materials", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}
export async function POST(request: Request) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  try {
    const body: unknown = await request.json();

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const data = body as Record<string, unknown>;
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const unit = typeof data.unit === "string" ? data.unit.trim() : "";

    if (!name || !unit) {
      return NextResponse.json(
        { error: "name and unit are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.materials.findFirst({
      where: {
        name,
        is_active: true,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Material already exists" },
        { status: 409 }
      );
    }

    const material = await prisma.materials.create({
      data: {
        name,
        unit,
        is_active: true,
      },
      select: {
        id: true,
        name: true,
        unit: true,
        is_active: true,
      },
    });

    return NextResponse.json(material, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    console.error("Failed to create material", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}
