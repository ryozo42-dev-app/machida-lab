import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const orderFilesDirectory = path.resolve(process.cwd(), "storage", "order-files");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  const { fileId: fileIdParam } = await params;
  const fileId = Number(fileIdParam);

  if (!Number.isInteger(fileId) || fileId <= 0) {
    return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
  }

  try {
    const orderFile = await prisma.order_files.findUnique({
      where: { id: fileId },
      select: { file_name: true, file_path: true },
    });

    if (!orderFile?.file_path) {
      return NextResponse.json({ error: "PDF not found" }, { status: 404 });
    }

    const storedFileName = path.basename(orderFile.file_path);
    const expectedFilePath = path.posix.join(
      "storage",
      "order-files",
      storedFileName
    );

    if (orderFile.file_path !== expectedFilePath) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    const filePath = path.join(orderFilesDirectory, storedFileName);
    const file = await readFile(filePath);

    if (file.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return NextResponse.json({ error: "Invalid PDF file" }, { status: 500 });
    }

    const fileName = orderFile.file_name ?? `order-file-${fileId}.pdf`;

    return new Response(file, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return NextResponse.json({ error: "PDF not found" }, { status: 404 });
    }

    console.error("Failed to read order PDF", error);

    return NextResponse.json({ error: "Database Error" }, { status: 500 });
  }
}
