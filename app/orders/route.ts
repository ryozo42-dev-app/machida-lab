import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const MAX_PDF_SIZE = 10 * 1024 * 1024;
const orderFilesDirectory = path.join(process.cwd(), "storage", "order-files");

function parseOptionalPositiveInt(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function formatOrderNoDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}${values.month}${values.day}`;
}

async function parseOrderBody(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return req.json();
  }

  const formData = await req.formData();
  const pdf = formData.get("pdf");

  return {
    customer_id: Number(formData.get("customer_id")),
    patient_id: Number(formData.get("patient_id")),
    insurance_item_id: formData.get("insurance_item_id"),
    private_item_id: formData.get("private_item_id"),
    quantity: formData.get("quantity"),
    tooth_numbers: formData.getAll("tooth_numbers").map(String),
    order_date: formData.get("order_date") || new Date().toISOString(),
    delivery_date: formData.get("delivery_date") || new Date().toISOString(),
    insurance_type: String(formData.get("insurance_type") ?? "保険"),
    remarks: String(formData.get("remarks") ?? ""),
    pdf: pdf instanceof File && pdf.size > 0 ? pdf : null,
  };
}

export async function GET() {
  const orders = await prisma.orders.findMany({
    orderBy: {
      id: "desc",
    },
  });

  return NextResponse.json(orders);
}

export async function POST(req: NextRequest) {
  let temporaryFilePath: string | null = null;
  let savedFilePath: string | null = null;

  try {
    const body = await parseOrderBody(req);
    const orderDate = new Date(body.order_date);

    if (Number.isNaN(orderDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid order_date" },
        { status: 400 }
      );
    }

    const insuranceItemId = parseOptionalPositiveInt(body.insurance_item_id);
    const privateItemId = parseOptionalPositiveInt(body.private_item_id);
    const rawToothNumbers: unknown[] = Array.isArray(body.tooth_numbers)
      ? body.tooth_numbers
      : [];
    const toothNumbers: string[] = [
      ...new Set(rawToothNumbers.map((toothNumber) => String(toothNumber))),
    ];
    const validToothNumbers = new Set([
      ...[1, 2, 3, 4].flatMap((quadrant) =>
        Array.from({ length: 8 }, (_, index) => `${quadrant}${index + 1}`)
      ),
      ...[5, 6, 7, 8].flatMap((quadrant) =>
        Array.from({ length: 5 }, (_, index) => `${quadrant}${index + 1}`)
      ),
    ]);
    const pdf = body.pdf instanceof File ? body.pdf : null;

    if (pdf && (pdf.type !== "application/pdf" || pdf.size > MAX_PDF_SIZE)) {
      return NextResponse.json(
        { error: "Invalid PDF file" },
        { status: 400 }
      );
    }

    let pdfBuffer: Buffer | null = null;
    let storedFileName: string | null = null;

    if (pdf) {
      pdfBuffer = Buffer.from(await pdf.arrayBuffer());

      if (pdfBuffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
        return NextResponse.json(
          { error: "Invalid PDF file" },
          { status: 400 }
        );
      }

      storedFileName = `${randomUUID()}.pdf`;
      temporaryFilePath = path.join(orderFilesDirectory, `${storedFileName}.tmp`);
      savedFilePath = path.join(orderFilesDirectory, storedFileName);

      await mkdir(orderFilesDirectory, { recursive: true });
      await writeFile(temporaryFilePath, pdfBuffer, { flag: "wx" });
    }

    const hasInsuranceItem = insuranceItemId !== null;
    const hasPrivateItem = privateItemId !== null;

    if (hasInsuranceItem === hasPrivateItem) {
      return NextResponse.json(
        {
          error: "Exactly one of insurance_item_id or private_item_id must be specified",
        },
        { status: 400 }
      );
    }

    const selectedInsuranceType = hasInsuranceItem ? "保険" : "自費";

    if (
      body.insurance_type !== undefined &&
      body.insurance_type !== null &&
      String(body.insurance_type).trim().length > 0 &&
      String(body.insurance_type) !== selectedInsuranceType
    ) {
      return NextResponse.json(
        { error: "insurance_type does not match selected work item type" },
        { status: 400 }
      );
    }

    if (toothNumbers.some((toothNumber) => !validToothNumbers.has(toothNumber))) {
      return NextResponse.json(
        { error: "Invalid tooth_numbers" },
        { status: 400 }
      );
    }

    if (hasInsuranceItem) {
      const insuranceItem = await prisma.insurance_items.findUnique({
        where: { id: insuranceItemId },
        select: { id: true },
      });

      if (!insuranceItem) {
        return NextResponse.json(
          { error: "Invalid insurance_item_id" },
          { status: 400 }
        );
      }
    }

    if (hasPrivateItem) {
      const privateItem = await prisma.private_items.findUnique({
        where: { id: privateItemId },
        select: { id: true },
      });

      if (!privateItem) {
        return NextResponse.json(
          { error: "Invalid private_item_id" },
          { status: 400 }
        );
      }
    }

    const order = await prisma.$transaction(async (transaction) => {
      const orderNoDate = formatOrderNoDate(orderDate);
      const orderNoPrefix = `ORD-${orderNoDate}-`;
      const [sequenceRow] = await transaction.$queryRaw<Array<{ max_seq: number }>>`
        SELECT COALESCE(MAX(CAST(RIGHT(order_no, 3) AS INTEGER)), 0) AS max_seq
        FROM orders
        WHERE order_no LIKE ${`${orderNoPrefix}%`}
      `;
      const nextSequence = (sequenceRow?.max_seq ?? 0) + 1;
      const orderNo = `${orderNoPrefix}${String(nextSequence).padStart(3, "0")}`;

      const createdOrder = await transaction.orders.create({
        data: {
          order_no: orderNo,
          customer_id: body.customer_id,
          patient_id: body.patient_id,
          order_date: orderDate,
          delivery_date: body.delivery_date ? new Date(body.delivery_date) : null,
          insurance_type: selectedInsuranceType,
          remarks: body.remarks,
        },
      });

      await transaction.order_items.create({
        data: {
          order_id: createdOrder.id,
          insurance_item_id: hasInsuranceItem ? insuranceItemId : null,
          private_item_id: hasPrivateItem ? privateItemId : null,
            quantity: 1,
        },
      });

      if (toothNumbers.length > 0) {
        await transaction.order_teeth.createMany({
          data: toothNumbers.map((toothNumber) => ({
            order_id: createdOrder.id,
            tooth_no: toothNumber,
          })),
        });
      }

      if (pdf && storedFileName && temporaryFilePath && savedFilePath) {
        await rename(temporaryFilePath, savedFilePath);
        temporaryFilePath = null;

        await transaction.order_files.create({
          data: {
            order_id: createdOrder.id,
            file_name: pdf.name,
            file_path: path.posix.join("storage", "order-files", storedFileName),
          },
        });
      }

      return createdOrder;
    });

    return NextResponse.json(order);
  } catch (error) {
    console.error(error);

    await Promise.all(
      [temporaryFilePath, savedFilePath]
        .filter((filePath): filePath is string => filePath !== null)
        .map((filePath) =>
          rm(filePath, { force: true }).catch((cleanupError) => {
            console.error("Failed to clean up order PDF", cleanupError);
          })
        )
    );

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}
