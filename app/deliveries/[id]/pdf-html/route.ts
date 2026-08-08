import fs from "node:fs";
import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";
import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const LOCAL_CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

const DEFAULT_CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v147.0.0/chromium-v147.0.0-pack.tar";

type DeliveryDetailRow = {
  patientName: string;
  orderNo: string;
  workTypeName: string;
  toothNumbers: string;
  quantity: string;
  unitPrice: string;
  amount: string;
};

type DeliveryPdfData = {
  id: number;
  deliveryNo: string;
  deliveryDate: string;
  customerName: string;
  detailRows: DeliveryDetailRow[];
  totalAmount: string;
};

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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function findLocalChromePath() {
  for (const candidate of LOCAL_CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function createBrowser() {
  const localChromePath = !process.env.VERCEL ? findLocalChromePath() : null;

  if (localChromePath) {
    return puppeteer.launch({
      executablePath: localChromePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  const packLocation =
    process.env.CHROMIUM_PACK_LOCATION ||
    process.env.CHROMIUM_PACK_URL ||
    DEFAULT_CHROMIUM_PACK_URL;
  const executablePath = await chromium.executablePath(packLocation);

  return puppeteer.launch({
    args: puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
    executablePath,
    headless: "shell",
    defaultViewport: {
      width: 1240,
      height: 1754,
      deviceScaleFactor: 1,
    },
  });
}

async function fetchDeliveryPdfData(deliveryId: number): Promise<DeliveryPdfData | null> {
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
    return null;
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
  const insuranceNameById = new Map(insuranceItems.map((item) => [item.id, item.item_name]));
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

    const workTypeName =
      orderItem.insurance_item_id !== null
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
    delivery.delivery_items.reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));

  return {
    id: delivery.id,
    deliveryNo: delivery.delivery_no ?? "",
    deliveryDate: formatDate(delivery.delivery_date),
    customerName: customer?.name ?? "未登録",
    detailRows,
    totalAmount: formatYen(totalAmount),
  };
}

function createDeliveryHtml(data: DeliveryPdfData) {
  const detailRowsHtml = data.detailRows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.patientName)}</td>
          <td>${escapeHtml(row.orderNo)}</td>
          <td>${escapeHtml(row.workTypeName)}</td>
          <td>${escapeHtml(row.toothNumbers)}</td>
          <td class="numeric">${escapeHtml(row.quantity)}</td>
          <td class="numeric">${escapeHtml(row.unitPrice)}</td>
          <td class="numeric">${escapeHtml(row.amount)}</td>
        </tr>
      `
    )
    .join("");

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      @page {
        size: A4 portrait;
        margin: 14mm;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        color: #111827;
        font-family: "Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
        font-size: 12px;
      }

      .sheet {
        width: 100%;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }

      .header-left {
        width: 66%;
      }

      .title {
        margin: 0;
        font-size: 36px;
        font-weight: 700;
        line-height: 1.1;
      }

      .meta {
        margin-top: 22px;
        font-size: 16px;
        line-height: 1.8;
      }

      .clinic {
        margin-top: 24px;
        font-size: 30px;
        font-weight: 700;
        line-height: 1.3;
      }

      .header-right {
        width: 34%;
        padding: 2px 0 0 12px;
        text-align: left;
      }

      .lab-name {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        line-height: 1.35;
      }

      .lab-info {
        margin: 6px 0 0;
        font-size: 10px;
        line-height: 1.55;
        white-space: normal;
      }

      .lab-line + .lab-line {
        margin-top: 2px;
      }

      .sheet .header .header-right {
        width: 34% !important;
        padding: 0 !important;
        margin: 0 !important;
        border: none !important;
        background: transparent !important;
        box-sizing: border-box !important;
        text-align: left !important;
      }

      .sheet .header .header-right .lab-name {
        margin: 0 !important;
        padding: 0 !important;
        font-size: 16px !important;
        font-weight: 700 !important;
        line-height: 1.35 !important;
        display: block !important;
        position: static !important;
      }

      .sheet .header .header-right .lab-info {
        margin: 6px 0 0 !important;
        padding: 0 !important;
        font-size: 10px !important;
        font-weight: 400 !important;
        line-height: 1.55 !important;
        white-space: normal !important;
        display: block !important;
        position: static !important;
      }

      .sheet .header .header-right .lab-line {
        margin: 0 !important;
        padding: 0 !important;
        display: block !important;
        position: static !important;
        font-size: 10px !important;
        line-height: 1.55 !important;
      }

      .sheet .header .header-right .lab-line + .lab-line {
        margin-top: 2px !important;
      }

      .divider {
        margin: 18px 0 14px;
        border: 0;
        border-top: 1px solid #9ca3af;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }

      thead th {
        border: 1px solid #d1d5db;
        background: #f3f4f6;
        padding: 8px 6px;
        font-size: 11px;
        font-weight: 700;
        text-align: left;
      }

      tbody td {
        border: 1px solid #e5e7eb;
        padding: 8px 6px;
        font-size: 11px;
        vertical-align: top;
        overflow-wrap: anywhere;
      }

      .numeric {
        text-align: right;
      }

      .col-patient { width: 16%; }
      .col-order { width: 16%; }
      .col-work { width: 26%; }
      .col-tooth { width: 12%; }
      .col-qty { width: 8%; }
      .col-unit { width: 11%; }
      .col-amount { width: 11%; }

      .total {
        margin-top: 14px;
        text-align: right;
        font-size: 16px;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <section class="header">
        <div class="header-left">
          <h1 class="title">納品書</h1>
          <div class="meta">
            <div>納品書番号: ${escapeHtml(data.deliveryNo)}</div>
            <div>納品日: ${escapeHtml(data.deliveryDate)}</div>
          </div>
          <div class="clinic">${escapeHtml(data.customerName)} 様</div>
        </div>
        <div class="header-right">
          <h2 class="lab-name">町田歯科技工所</h2>
          <div class="lab-info">
            <div class="lab-line">〒547-0034</div>
            <div class="lab-line">大阪府大阪市平野区背戸口2-1-18</div>
            <div class="lab-line">TEL：06-6701-0563</div>
          </div>
        </div>
      </section>

      <hr class="divider" />

      <table>
        <thead>
          <tr>
            <th class="col-patient">患者名</th>
            <th class="col-order">受注No</th>
            <th class="col-work">作業内容</th>
            <th class="col-tooth">歯番</th>
            <th class="col-qty numeric">数量</th>
            <th class="col-unit numeric">単価</th>
            <th class="col-amount numeric">金額</th>
          </tr>
        </thead>
        <tbody>
          ${detailRowsHtml}
        </tbody>
      </table>

      <div class="total">合計金額: ${escapeHtml(data.totalAmount)}</div>
    </main>
  </body>
</html>`;
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

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

  try {
    const data = await fetchDeliveryPdfData(deliveryId);

    if (!data) {
      return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
    }

    const html = createDeliveryHtml(data);

    browser = await createBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
      },
    });

    const fileName = `${data.deliveryNo || `delivery-${data.id}`}-html.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Failed to generate HTML delivery PDF", error);

    return NextResponse.json({ error: "Database Error" }, { status: 500 });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}