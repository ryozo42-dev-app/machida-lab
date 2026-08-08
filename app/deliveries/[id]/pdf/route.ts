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

type DeliveryPdfItem = {
  delivery_item_id: number;
  order_item_id: number;
  order_no: string;
  patient_name: string;
  work_type_name: string;
  tooth_numbers: string[];
  quantity: number;
  unit_price: string;
  amount: string;
};

type DeliveryPdfData = {
  id: number;
  delivery_no: string;
  customer_name: string;
  delivery_date: string;
  total_amount: string;
  items: DeliveryPdfItem[];
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
          id: true,
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
  const orders = await prisma.orders.findMany({
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
  });

  const [customer, orderTeeth, insuranceItems, privateItems, patients] =
    await Promise.all([
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
      prisma.insurance_items.findMany({
        where: {
          id: {
            in: [
              ...new Set(
                orderItems.flatMap((item) =>
                  item.insurance_item_id === null ? [] : [item.insurance_item_id]
                )
              ),
            ],
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
            in: [
              ...new Set(
                orderItems.flatMap((item) =>
                  item.private_item_id === null ? [] : [item.private_item_id]
                )
              ),
            ],
          },
        },
        select: {
          id: true,
          item_name: true,
        },
      }),
      prisma.patients.findMany({
        where: {
          id: {
            in: [...new Set(orders.map((order) => order.patient_id))],
          },
        },
        select: {
          id: true,
          patient_name: true,
        },
      }),
    ]);

  const orderItemById = new Map(orderItems.map((item) => [item.id, item]));
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const patientNameById = new Map(patients.map((patient) => [patient.id, patient.patient_name]));
  const insuranceNameById = new Map(insuranceItems.map((item) => [item.id, item.item_name]));
  const privateNameById = new Map(privateItems.map((item) => [item.id, item.item_name]));
  const toothNumbersByOrderId = orderTeeth.reduce<Map<number, string[]>>((acc, tooth) => {
    const current = acc.get(tooth.order_id) ?? [];
    current.push(tooth.tooth_no);
    acc.set(tooth.order_id, current);
    return acc;
  }, new Map<number, string[]>());

  const items = delivery.delivery_items.map((deliveryItem) => {
    const orderItem = orderItemById.get(deliveryItem.order_item_id);

    if (!orderItem) {
      throw new Error(`order_item ${deliveryItem.order_item_id} not found`);
    }

    const order = orderById.get(orderItem.order_id);

    if (!order) {
      throw new Error(`order ${orderItem.order_id} not found`);
    }

    const patientName = patientNameById.get(order.patient_id) ?? "未登録";
    const workTypeName =
      orderItem.insurance_item_id !== null
        ? insuranceNameById.get(orderItem.insurance_item_id) ?? "未登録"
        : privateNameById.get(orderItem.private_item_id as number) ?? "未登録";

    return {
      delivery_item_id: deliveryItem.id,
      order_item_id: deliveryItem.order_item_id,
      order_no: order.order_no ?? "",
      patient_name: patientName === "未登録" ? patientName : `${patientName} 様`,
      work_type_name: workTypeName,
      tooth_numbers: toothNumbersByOrderId.get(order.id)?.map((value) => value) ?? [],
      quantity: deliveryItem.quantity,
      unit_price: formatYen(deliveryItem.unit_price),
      amount: formatYen(deliveryItem.amount),
    };
  });

  const totalAmount = delivery.total_amount ?? null;

  return {
    id: delivery.id,
    delivery_no: delivery.delivery_no ?? "",
    customer_name: customer?.name ?? "未登録",
    delivery_date: formatDate(delivery.delivery_date, "-"),
    total_amount: formatYen(totalAmount),
    items,
  };
}

function createDeliveryHtml(data: DeliveryPdfData) {
  const itemsHtml = data.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.patient_name)}</td>
          <td>${escapeHtml(item.order_no)}</td>
          <td>${escapeHtml(item.work_type_name)}</td>
          <td>${escapeHtml(item.tooth_numbers.join(", ") || "-")}</td>
          <td>${escapeHtml(String(item.quantity))}</td>
          <td>${escapeHtml(item.unit_price)}</td>
          <td>${escapeHtml(item.amount)}</td>
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
  margin: 0;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  background: #ffffff;
}

body {
  font-family:
    "Noto Sans JP",
    "Hiragino Kaku Gothic ProN",
    "Yu Gothic",
    sans-serif;
  color: #111111;
  font-size: 11px;
}

.delivery-sheet {
  width: 210mm;
  min-height: 297mm;
  padding: 18mm 16mm;
  margin: 0 auto;
  background: #ffffff;
}

.delivery-header {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
}

.header-left {
  width: 62%;
}

.title {
  margin: 0;
  padding: 0;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}

.delivery-meta {
  margin-top: 12px;
  font-size: 11px;
  line-height: 1.8;
}

.customer-name {
  margin-top: 20px;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.4;
}

.lab-info {
  position: absolute;
  top: 45px;
  right: -4px;
  width: 210px;
  margin: 0;
  padding: 0;
  font-size: 10px;
  line-height: 1.7;
  text-align: left;
}

.lab-name {
  margin: 0 0 5px 0;
  padding: 0;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.4;
}

.separator {
  width: 100%;
  border-top: 1px solid #222222;
  margin-top: 18px;
  margin-bottom: 14px;
}

.delivery-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 9px;
}

.delivery-table th,
.delivery-table td {
  border: 1px solid #222222;
  padding: 7px 5px;
  vertical-align: middle;
}

.delivery-table th {
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
}

.delivery-table td:nth-child(1) {
  width: 17%;
}

.delivery-table td:nth-child(2) {
  width: 15%;
}

.delivery-table td:nth-child(3) {
  width: 24%;
}

.delivery-table td:nth-child(4) {
  width: 10%;
  text-align: center;
}

.delivery-table td:nth-child(5) {
  width: 8%;
  text-align: right;
}

.delivery-table td:nth-child(6) {
  width: 13%;
  text-align: right;
}

.delivery-table td:nth-child(7) {
  width: 13%;
  text-align: right;
}

.delivery-table th:nth-child(1),
.delivery-table th:nth-child(2),
.delivery-table th:nth-child(3) {
  text-align: left;
}

.total {
  width: 100%;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 18px;
  margin-top: 18px;
  font-size: 12px;
}

.total strong {
  font-size: 16px;
  font-weight: 700;
}
    </style>
  </head>
  <body>
    <main class="delivery-sheet">
      <header class="delivery-header">

        <section class="header-left">

          <h1 class="title">納品書</h1>

          <div class="delivery-meta">
            <div>納品書番号：<span>${escapeHtml(data.delivery_no)}</span></div>
            <div>納品日：<span>${escapeHtml(data.delivery_date)}</span></div>
          </div>

          <div class="customer-name">
            ${escapeHtml(data.customer_name)} 様
          </div>

        </section>

        <section class="lab-info">
          <div class="lab-name">町田歯科技工所</div>
          <div>〒547-0034</div>
          <div>大阪府大阪市平野区背戸口2-1-18</div>
          <div>TEL：06-6701-0563</div>
        </section>

      </header>

      <div class="separator"></div>

      <table class="delivery-table">

        <thead>
          <tr>
            <th>患者名</th>
            <th>受注No</th>
            <th>作業内容</th>
            <th>歯番</th>
            <th>数量</th>
            <th>単価</th>
            <th>金額</th>
          </tr>
        </thead>

        <tbody>
          ${itemsHtml}
        </tbody>

      </table>

      <div class="total">
        <span>合計金額</span>
        <strong>${escapeHtml(data.total_amount)}</strong>
      </div>

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

    const fileName = `${data.delivery_no || `delivery-${data.id}`}.pdf`;

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
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}