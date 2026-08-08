import path from "node:path";
import PDFDocument from "pdfkit";
import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const regularFontPath = path.join(
  process.cwd(),
  "node_modules",
  "@fontsource",
  "noto-sans-jp",
  "files",
  "noto-sans-jp-japanese-400-normal.woff"
);

const boldFontPath = path.join(
  process.cwd(),
  "node_modules",
  "@fontsource",
  "noto-sans-jp",
  "files",
  "noto-sans-jp-japanese-700-normal.woff"
);

function parsePositiveInteger(value: string) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function formatDate(date: Date, separator = "/") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}${separator}${values.month}${separator}${values.day}`;
}

function formatYen(value: Prisma.Decimal | null) {
  if (value === null) {
    return "-";
  }

  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function drawTableHeader(doc: PDFKit.PDFDocument, startX: number, y: number, widths: number[]) {
  const headers = ["患者名", "受注No", "作業内容", "歯番", "数量", "単価", "金額"];
  let x = startX;

  doc.save();
  doc.rect(startX, y, widths.reduce((sum, width) => sum + width, 0), 24).fill("#F3F4F6");
  doc.restore();
  doc.font(boldFontPath).fontSize(9).fillColor("#111827");

  headers.forEach((header, index) => {
    const width = widths[index];
    const align = index >= 4 ? "right" : "left";
    doc.text(header, x + 4, y + 7, { width: width - 8, align });
    x += width;
  });

  doc
    .moveTo(startX, y)
    .lineTo(startX + widths.reduce((sum, width) => sum + width, 0), y)
    .strokeColor("#D1D5DB")
    .stroke();

  return y + 24;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const deliveryId = parsePositiveInteger(resolvedParams.id);

  if (deliveryId === null) {
    return NextResponse.json({ error: "Invalid delivery id" }, { status: 400 });
  }

  try {
    const delivery = await prisma.deliveries.findUnique({
      where: { id: deliveryId },
      select: {
        id: true,
        delivery_no: true,
        customer_id: true,
        delivery_date: true,
        total_amount: true,
        delivery_items: {
          orderBy: { id: "asc" },
          select: {
            order_item_id: true,
            quantity: true,
            unit_price: true,
            amount: true,
          },
        },
      },
    });

    if (!delivery) {
      return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
    }

    const orderItemIds = delivery.delivery_items.map((item) => item.order_item_id);
    const orderItems = await prisma.order_items.findMany({
      where: {
        id: {
          in: orderItemIds,
        },
      },
      select: {
        id: true,
        order_id: true,
        insurance_item_id: true,
        private_item_id: true,
      },
    });
    const orderIds = [...new Set(orderItems.map((item) => item.order_id))];
    const [orders, customer, orderTeeth] = await Promise.all([
      prisma.orders.findMany({
        where: {
          id: {
            in: orderIds,
          },
        },
        select: {
          id: true,
          order_no: true,
          patient_id: true,
        },
      }),
      prisma.customers.findUnique({
        where: { id: delivery.customer_id },
        select: { name: true },
      }),
      prisma.order_teeth.findMany({
        where: {
          order_id: {
            in: orderIds,
          },
        },
        orderBy: [{ order_id: "asc" }, { id: "asc" }],
      }),
    ]);

    const patientIds = [...new Set(orders.map((order) => order.patient_id))];
    const insuranceItemIds = [
      ...new Set(
        orderItems.flatMap((item) =>
          item.insurance_item_id === null ? [] : [item.insurance_item_id]
        )
      ),
    ];
    const privateItemIds = [
      ...new Set(
        orderItems.flatMap((item) =>
          item.private_item_id === null ? [] : [item.private_item_id]
        )
      ),
    ];
    const [patients, insuranceItems, privateItems] = await Promise.all([
      prisma.patients.findMany({
        where: {
          id: {
            in: patientIds,
          },
        },
        select: {
          id: true,
          patient_name: true,
        },
      }),
      prisma.insurance_items.findMany({
        where: {
          id: {
            in: insuranceItemIds,
          },
        },
        select: {
          id: true,
          item_name: true,
        },
      }),
      prisma.private_items.findMany({
        where: {
          id: {
            in: privateItemIds,
          },
        },
        select: {
          id: true,
          item_name: true,
        },
      }),
    ]);

    const orderItemById = new Map(orderItems.map((item) => [item.id, item]));
    const orderById = new Map(orders.map((order) => [order.id, order]));
    const patientById = new Map(patients.map((patient) => [patient.id, patient.patient_name]));
    const insuranceNameById = new Map(
      insuranceItems.map((item) => [item.id, item.item_name])
    );
    const privateNameById = new Map(privateItems.map((item) => [item.id, item.item_name]));
    const toothNumbersByOrderId = orderTeeth.reduce<Map<number, string[]>>((acc, tooth) => {
      const current = acc.get(tooth.order_id) ?? [];
      current.push(tooth.tooth_no);
      acc.set(tooth.order_id, current);
      return acc;
    }, new Map<number, string[]>());

    const detailRows = delivery.delivery_items.map((deliveryItem) => {
      const orderItem = orderItemById.get(deliveryItem.order_item_id);

      if (!orderItem) {
        throw new Error(`order_item ${deliveryItem.order_item_id} not found`);
      }

      const order = orderById.get(orderItem.order_id);

      if (!order) {
        throw new Error(`order ${orderItem.order_id} not found`);
      }

      const workTypeName = orderItem.insurance_item_id !== null
        ? insuranceNameById.get(orderItem.insurance_item_id) ?? "未登録"
        : privateNameById.get(orderItem.private_item_id as number) ?? "未登録";
      const patientName = patientById.get(order.patient_id) ?? "未登録";

      return {
        patientName: patientName === "未登録" ? patientName : `${patientName} 様`,
        orderNo: order.order_no ?? "",
        workTypeName,
        toothNumbers: toothNumbersByOrderId.get(order.id)?.join(", ") ?? "-",
        quantity: String(deliveryItem.quantity),
        unitPrice: formatYen(deliveryItem.unit_price),
        amount: formatYen(deliveryItem.amount),
      };
    });

    const totalAmount =
      delivery.total_amount ??
      delivery.delivery_items.reduce(
        (sum, item) => sum.add(item.amount),
        new Prisma.Decimal(0)
      );

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: "A4",
        margin: 48,
        bufferPages: true,
        font: regularFontPath,
      });
      const chunks: Buffer[] = [];
      const tableStartX = 48;
      const tableWidths = [82, 90, 135, 65, 38, 62, 70];
      const bottomLimit = 760;

      doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.font(regularFontPath);

      let y = 52;
      doc.font(boldFontPath).fontSize(30).fillColor("#111827").text("納品書", 48, y);

      const labBlockX = 365;
      const labBlockY = 64;
      const labBlockWidth = 182;
      const labBlockHeight = 124;

      doc.save();
      doc.rect(labBlockX, labBlockY, labBlockWidth, labBlockHeight).fill("#F3F4F6");
      doc.restore();

      doc.font(boldFontPath).fontSize(30).fillColor("#111827");
      doc.text("町田歯科技工所", labBlockX + 12, labBlockY + 18, {
        width: labBlockWidth - 24,
        align: "left",
      });
      doc.font(regularFontPath).fontSize(10).fillColor("#111827");
      doc.text("〒547-0034", labBlockX + 12, labBlockY + 78, {
        width: labBlockWidth - 24,
        align: "left",
      });
      doc.text("大阪府大阪市平野区背戸口2-1-18", labBlockX + 12, labBlockY + 98, {
        width: labBlockWidth - 24,
        align: "left",
      });
      doc.text("TEL：06-6701-0563", labBlockX + 12, labBlockY + 118, {
        width: labBlockWidth - 24,
        align: "left",
      });

      y += 78;
      doc.font(regularFontPath).fontSize(14).fillColor("#111827");
      doc.text(`納品書番号: ${delivery.delivery_no ?? ""}`, 48, y);
      y += 28;
      doc.text(`納品日: ${formatDate(delivery.delivery_date)}`, 48, y);
      y += 52;

      doc.font(boldFontPath).fontSize(30).fillColor("#111827");
      doc.text(`${customer?.name ?? "未登録"} 様`, 48, y);
      y += 52;

      doc
        .moveTo(48, y)
        .lineTo(547, y)
        .strokeColor("#9CA3AF")
        .stroke();
      y += 24;

      y = drawTableHeader(doc, tableStartX, y, tableWidths);

      for (const row of detailRows) {
        const heights = [
          doc.heightOfString(row.patientName, { width: tableWidths[0] - 8 }),
          doc.heightOfString(row.orderNo, { width: tableWidths[1] - 8 }),
          doc.heightOfString(row.workTypeName, { width: tableWidths[2] - 8 }),
          doc.heightOfString(row.toothNumbers, { width: tableWidths[3] - 8 }),
          doc.heightOfString(row.quantity, { width: tableWidths[4] - 8 }),
          doc.heightOfString(row.unitPrice, { width: tableWidths[5] - 8 }),
          doc.heightOfString(row.amount, { width: tableWidths[6] - 8 }),
        ];
        const rowHeight = Math.max(...heights, 14) + 10;

        if (y + rowHeight > bottomLimit) {
          doc.addPage({ size: "A4", margin: 48 });
          y = 52;
          doc.font(regularFontPath).fontSize(10).fillColor("#111827");
          doc.text(`納品書番号: ${delivery.delivery_no ?? ""}`, 48, y);
          y += 28;
          y = drawTableHeader(doc, tableStartX, y, tableWidths);
        }

        let x = tableStartX;
        const values = [
          row.patientName,
          row.orderNo,
          row.workTypeName,
          row.toothNumbers,
          row.quantity,
          row.unitPrice,
          row.amount,
        ];

        doc.font(regularFontPath).fontSize(9).fillColor("#111827");
        values.forEach((value, index) => {
          const width = tableWidths[index];
          const align = index >= 4 ? "right" : "left";
          doc.text(value, x + 4, y + 5, { width: width - 8, align });
          x += width;
        });

        doc
          .moveTo(tableStartX, y + rowHeight)
          .lineTo(tableStartX + tableWidths.reduce((sum, width) => sum + width, 0), y + rowHeight)
          .strokeColor("#E5E7EB")
          .stroke();

        y += rowHeight;
      }

      y += 16;
      doc.font(boldFontPath).fontSize(11).fillColor("#111827");
      doc.text(`合計金額: ${formatYen(totalAmount)}`, 340, y, { width: 160, align: "right" });

      const pageRange = doc.bufferedPageRange();
      for (let pageIndex = 0; pageIndex < pageRange.count; pageIndex += 1) {
        doc.switchToPage(pageIndex);
        doc.font(regularFontPath).fontSize(8).fillColor("#6B7280");
        doc.text(
          `${pageIndex + 1} / ${pageRange.count}`,
          48,
          800,
          { width: 499, align: "center" }
        );
      }

      doc.end();
    });

    const fileName = `${delivery.delivery_no ?? `delivery-${delivery.id}`}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Failed to generate delivery PDF", error);

    return NextResponse.json({ error: "Database Error" }, { status: 500 });
  }
}
