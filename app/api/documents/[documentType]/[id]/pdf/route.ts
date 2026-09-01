import path from "node:path";
import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { readPdfIfExists } from "@/lib/document-storage";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function parsePositiveInteger(value: string) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function createPdfResponse(
  pdfBuffer: Uint8Array,
  fileName: string
) {
  const body = new ArrayBuffer(pdfBuffer.byteLength);
  new Uint8Array(body).set(pdfBuffer);

  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        fileName
      )}`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function findStoredPdf(
  documentType: string,
  id: number
) {
  if (documentType === "deliveries") {
    return prisma.deliveries.findFirst({
      where: {
        id,
        pdf_path: {
          not: null,
        },
        pdf_filename: {
          not: null,
        },
      },
      select: {
        pdf_path: true,
        pdf_filename: true,
      },
    });
  }

  if (documentType === "invoices") {
    return prisma.invoices.findFirst({
      where: {
        id,
        pdf_path: {
          not: null,
        },
        pdf_filename: {
          not: null,
        },
      },
      select: {
        pdf_path: true,
        pdf_filename: true,
      },
    });
  }

  return null;
}

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      documentType: string;
      id: string;
    }>;
  }
) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  const { documentType, id: idParam } = await params;
  const id = parsePositiveInteger(idParam);

  if (
    !id ||
    !["deliveries", "invoices"].includes(documentType)
  ) {
    return NextResponse.json(
      { error: "Document PDF not found" },
      { status: 404 }
    );
  }

  try {
    const storedPdf = await findStoredPdf(documentType, id);

    if (!storedPdf?.pdf_path) {
      return NextResponse.json(
        { error: "Document PDF not found" },
        { status: 404 }
      );
    }

    const pdf = await readPdfIfExists(storedPdf.pdf_path);

    if (!pdf) {
      return NextResponse.json(
        { error: "Document PDF not found" },
        { status: 404 }
      );
    }

    return createPdfResponse(
      pdf,
      storedPdf.pdf_filename ||
        path.basename(storedPdf.pdf_path)
    );
  } catch (error) {
    console.error("Failed to read stored document PDF", error);

    return NextResponse.json(
      { error: "Failed to read document PDF" },
      { status: 500 }
    );
  }
}
