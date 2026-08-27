import fs from "node:fs";
import path from "node:path";
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
  "https://github.com/Sparticuz/chromium/releases/download/v147.0.0/chromium-v147.0.0-pack.x64.tar";

type InvoicePdfItem = {
  id: number;
  delivery_id: number;
  order_item_id: number | null;
  delivery_date: string;
  patient_name: string;
  work_name: string;
  tooth_display: string | null;
  tooth_snapshot: InvoicePdfTooth[] | null;
  material_usage_text: string | null;
  quantity: number;
  unit_price: Prisma.Decimal;
  amount: Prisma.Decimal;
  sort_order: number;
};

type InvoicePdfTooth = {
  tooth_no: string;
  is_bridge: boolean;
};

type ToothChart = {
  upperRight: ToothChartValue[];
  upperLeft: ToothChartValue[];
  lowerRight: ToothChartValue[];
  lowerLeft: ToothChartValue[];
  invalid: string[];
};

type ToothChartValue = {
  value: string;
  isBridge: boolean;
};

type InvoicePdfData = {
  id: number;
  invoice_no: string;
  display_invoice_no: string;
  customer_name: string;
  invoice_date: string;
  period_start: string;
  period_end: string;
  subtotal: Prisma.Decimal | null;
  tax_rate: Prisma.Decimal | null;
  tax_amount: Prisma.Decimal | null;
  total_amount: Prisma.Decimal | null;
  items: InvoicePdfItem[];
};

function parsePositiveInteger(value: string) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function formatDate(date: Date | null, separator = "/") {
  if (date === null) {
    return "-";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

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

function formatPercent(value: Prisma.Decimal | null) {
  if (value === null) {
    return "-";
  }

  return `${value.toString()}%`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatOptionalText(value: string | null) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : "-";
}

function createEmptyToothChart(): ToothChart {
  return {
    upperRight: [],
    upperLeft: [],
    lowerRight: [],
    lowerLeft: [],
    invalid: [],
  };
}

function sortToothValues(values: ToothChartValue[]) {
  return [...values].sort((first, second) => {
    const firstNumber = Number(first.value);
    const secondNumber = Number(second.value);

    if (
      Number.isFinite(firstNumber) &&
      Number.isFinite(secondNumber)
    ) {
      return firstNumber - secondNumber;
    }

    return first.value.localeCompare(second.value, "ja");
  });
}

function createToothChart(teeth: InvoicePdfTooth[]) {
  const chart = createEmptyToothChart();

  for (const tooth of teeth) {
    const normalized = tooth.tooth_no.trim();
    const match = normalized.match(/^([1-8])([1-8])$/);

    if (!match) {
      chart.invalid.push(normalized);
      continue;
    }

    const quadrant = Number(match[1]);
    const position = match[2];

    const value = {
      value: position,
      isBridge: tooth.is_bridge,
    };

    if (quadrant === 1 || quadrant === 5) {
      chart.upperRight.push(value);
    } else if (quadrant === 2 || quadrant === 6) {
      chart.upperLeft.push(value);
    } else if (quadrant === 3 || quadrant === 7) {
      chart.lowerLeft.push(value);
    } else if (quadrant === 4 || quadrant === 8) {
      chart.lowerRight.push(value);
    }
  }

  chart.upperRight = sortToothValues(chart.upperRight);
  chart.upperLeft = sortToothValues(chart.upperLeft);
  chart.lowerRight = sortToothValues(chart.lowerRight);
  chart.lowerLeft = sortToothValues(chart.lowerLeft);

  return chart;
}

function expandBridgeValues(values: ToothChartValue[]) {
  const bridgeNumbers = values
    .filter((tooth) => tooth.isBridge)
    .map((tooth) => Number(tooth.value))
    .filter((value) => Number.isInteger(value));

  if (bridgeNumbers.length < 2) {
    return values;
  }

  const bridgeStart = Math.min(...bridgeNumbers);
  const bridgeEnd = Math.max(...bridgeNumbers);
  const expanded = new Map<number, ToothChartValue>();

  for (const tooth of values) {
    const toothNumber = Number(tooth.value);

    if (Number.isInteger(toothNumber)) {
      expanded.set(toothNumber, {
        value: tooth.value,
        isBridge: false,
      });
    }
  }

  for (
    let toothNumber = bridgeStart;
    toothNumber <= bridgeEnd;
    toothNumber += 1
  ) {
    expanded.set(toothNumber, {
      value: String(toothNumber),
      isBridge:
        toothNumber === bridgeStart || toothNumber === bridgeEnd,
    });
  }

  return sortToothValues([...expanded.values()]);
}

function renderToothSide(values: ToothChartValue[]) {
  const displayValues = expandBridgeValues(values);

  const bridgeIndexes = displayValues.flatMap((tooth, index) =>
    tooth.isBridge ? [index] : []
  );

  const bridgeStart = bridgeIndexes[0] ?? -1;
  const bridgeEnd = bridgeIndexes.at(-1) ?? -1;

  return displayValues
    .map((tooth, index) => {
      const escapedValue = escapeHtml(tooth.value);

      if (
        tooth.isBridge &&
        (index === bridgeStart || index === bridgeEnd)
      ) {
        return `<span class="tooth-bridge-end">${escapedValue}</span>`;
      }

      return `<span class="tooth-number">${escapedValue}</span>`;
    })
    .join(" ");
}

function renderToothNumbersHtml(teeth: InvoicePdfTooth[]) {
  if (teeth.length === 0) {
    return `<span class="tooth-empty">-</span>`;
  }

  const chart = createToothChart(teeth);

  const hasUpper =
    chart.upperRight.length > 0 ||
    chart.upperLeft.length > 0;

  const hasLower =
    chart.lowerRight.length > 0 ||
    chart.lowerLeft.length > 0;

  const hasChartValue = hasUpper || hasLower;

  if (!hasChartValue) {
    return `<span>${teeth
      .map((tooth) => escapeHtml(tooth.tooth_no))
      .join(", ")}</span>`;
  }

  const invalidHtml =
    chart.invalid.length > 0
      ? `<div class="tooth-invalid">${chart.invalid
          .map(escapeHtml)
          .join(", ")}</div>`
      : "";

  return `
    <div class="tooth-chart" aria-label="歯式">
      <div class="tooth-row tooth-row-upper">
        <div class="tooth-side tooth-side-right">${renderToothSide(
          chart.upperRight
        )}</div>
        <div class="tooth-axis tooth-axis-upper${
          hasUpper ? " is-visible" : ""
        }"></div>
        <div class="tooth-side tooth-side-left">${renderToothSide(
          chart.upperLeft
        )}</div>
      </div>

      <div class="tooth-boundary"></div>

      <div class="tooth-row tooth-row-lower">
        <div class="tooth-side tooth-side-right">${renderToothSide(
          chart.lowerRight
        )}</div>
        <div class="tooth-axis tooth-axis-lower${
          hasLower ? " is-visible" : ""
        }"></div>
        <div class="tooth-side tooth-side-left">${renderToothSide(
          chart.lowerLeft
        )}</div>
      </div>
    </div>

    ${invalidHtml}
  `;
}

function parseToothSnapshot(
  value: Prisma.JsonValue | null
): InvoicePdfTooth[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const teeth = value.flatMap((item) => {
    if (
      item === null ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      return [];
    }

    const toothNo = item.tooth_no;
    const isBridge = item.is_bridge;

    if (
      typeof toothNo !== "string" ||
      typeof isBridge !== "boolean"
    ) {
      return [];
    }

    return [
      {
        tooth_no: toothNo,
        is_bridge: isBridge,
      },
    ];
  });

  return teeth.length > 0 ? teeth : null;
}

function renderInvoiceItemToothHtml(item: InvoicePdfItem) {
  if (item.tooth_snapshot) {
    return renderToothNumbersHtml(item.tooth_snapshot);
  }

  return escapeHtml(formatOptionalText(item.tooth_display));
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
  const localChromePath =
    !process.env.VERCEL ? findLocalChromePath() : null;

  if (localChromePath) {
    return puppeteer.launch({
      executablePath: localChromePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    });
  }

  const packLocation =
    process.env.CHROMIUM_PACK_LOCATION ||
    process.env.CHROMIUM_PACK_URL ||
    DEFAULT_CHROMIUM_PACK_URL;

  const executablePath =
    await chromium.executablePath(packLocation);

  return puppeteer.launch({
    args: puppeteer.defaultArgs({
      args: chromium.args,
      headless: "shell",
    }),
    executablePath,
    headless: "shell",
    defaultViewport: {
      width: 1240,
      height: 1754,
      deviceScaleFactor: 1,
    },
  });
}

async function fetchInvoicePdfData(
  invoiceId: number
): Promise<InvoicePdfData | null> {
  const invoice = await prisma.invoices.findUnique({
    where: {
      id: invoiceId,
    },
    select: {
      id: true,
      invoice_no: true,
      display_invoice_no: true,
      customer_id: true,
      invoice_date: true,
      period_start: true,
      period_end: true,
      subtotal: true,
      tax_rate: true,
      tax_amount: true,
      total_amount: true,
    },
  });

  if (!invoice) {
    return null;
  }

  const [customer, invoiceItems] = await Promise.all([
    prisma.customers.findUnique({
      where: {
        id: invoice.customer_id,
      },
      select: {
        name: true,
      },
    }),

    prisma.invoice_items.findMany({
      where: {
        invoice_id: invoice.id,
      },
      orderBy: [
        {
          sort_order: "asc",
        },
        {
          id: "asc",
        },
      ],
      select: {
        id: true,
        delivery_id: true,
        order_item_id: true,
        delivery_date: true,
        patient_name: true,
        work_name: true,
        tooth_display: true,
        tooth_snapshot: true,
        material_usage_text: true,
        quantity: true,
        unit_price: true,
        amount: true,
        sort_order: true,
      },
    }),
  ]);

  return {
    id: invoice.id,
    invoice_no: invoice.invoice_no ?? "",
    display_invoice_no:
      invoice.display_invoice_no ??
      invoice.invoice_no ??
      "",
    customer_name: customer?.name ?? "未登録",
    invoice_date: formatDate(invoice.invoice_date, "-"),
    period_start: formatDate(invoice.period_start, "-"),
    period_end: formatDate(invoice.period_end, "-"),
    subtotal: invoice.subtotal,
    tax_rate: invoice.tax_rate,
    tax_amount: invoice.tax_amount,
    total_amount: invoice.total_amount,
    items: invoiceItems.map((item) => ({
      ...item,
      delivery_date: formatDate(item.delivery_date, "-"),
      tooth_snapshot: parseToothSnapshot(item.tooth_snapshot),
    })),
  };
}

function createInvoiceHtml(data: InvoicePdfData) {
  const font400 = fs
    .readFileSync(
      path.join(
        process.cwd(),
        "public/fonts/noto-sans-jp-japanese-400-normal.woff2"
      )
    )
    .toString("base64");

  const font700 = fs
    .readFileSync(
      path.join(
        process.cwd(),
        "public/fonts/noto-sans-jp-japanese-700-normal.woff2"
      )
    )
    .toString("base64");

  const itemsHtml = data.items
    .map((item) => {
      const isBus = item.work_name === "BUS";

      return `
        <tr>
          <td>${escapeHtml(
            isBus
              ? "-"
              : formatOptionalText(item.patient_name)
          )}</td>
          <td>${escapeHtml(formatOptionalText(item.work_name))}</td>
          <td class="tooth-cell">
            ${renderInvoiceItemToothHtml(item)}
          </td>
          <td class="material-cell">${escapeHtml(
            formatOptionalText(item.material_usage_text)
          ).replaceAll("\n", "<br />")}</td>
          <td class="quantity-cell">${escapeHtml(
            String(item.quantity)
          )}</td>
          <td class="money-cell">${escapeHtml(
            formatYen(item.unit_price)
          )}</td>
          <td class="money-cell">${escapeHtml(
            formatYen(item.amount)
          )}</td>
        </tr>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0"
    />

    <style>
      @font-face {
        font-family: "Noto Sans JP";
        font-style: normal;
        font-weight: 400;
        src: url(data:font/woff2;base64,${font400})
          format("woff2");
      }

      @font-face {
        font-family: "Noto Sans JP";
        font-style: normal;
        font-weight: 700;
        src: url(data:font/woff2;base64,${font700})
          format("woff2");
      }

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

      .invoice-page {
        width: 210mm;
        min-height: 297mm;
        padding: 18mm 16mm;
        margin: 0 auto;
        background: #ffffff;
      }

      .invoice-page + .invoice-page {
        page-break-before: always;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 24px;
        border-bottom: 1px solid #222222;
        padding-bottom: 14px;
      }

      .title {
        margin: 0;
        font-size: 28px;
        font-weight: 700;
        line-height: 1.2;
      }

      .customer-name {
        margin-top: 28px;
        font-size: 17px;
        font-weight: 700;
      }

      .lab-info {
        width: 220px;
        font-size: 10px;
        line-height: 1.7;
      }

      .lab-name {
        margin-bottom: 5px;
        font-size: 16px;
        font-weight: 700;
      }

      .cover-lab-info {
        width: max-content;
      }

      .cover-customer-name {
        font-size: 21px;
      }

      .section {
        margin-top: 24px;
      }

      .section-title {
        margin: 0 0 10px 0;
        font-size: 14px;
        font-weight: 700;
      }

      .info-grid,
      .total-grid {
        display: grid;
        grid-template-columns: 140px 1fr;
        width: 100%;
        border-top: 1px solid #222222;
        border-left: 1px solid #222222;
      }

      .info-grid > div,
      .total-grid > div {
        border-right: 1px solid #222222;
        border-bottom: 1px solid #222222;
        padding: 8px 10px;
      }

      .cover-grid {
        font-size: 13px;
      }

      .invoice-no-value {
        font-weight: 400;
      }

      .label {
        font-weight: 700;
        background: #ffffff;
      }

      .amount-value {
        text-align: right;
      }

      .grand-total {
        font-size: 16px;
        font-weight: 700;
      }

      .bank-info {
        margin-top: 22px;
        border: 1px solid #222222;
        border-radius: 6px;
        padding: 12px 14px;
        font-size: 14px;
        line-height: 1.7;
      }

      .bank-title {
        margin-bottom: 6px;
        font-weight: 700;
      }

      .bank-row {
        display: grid;
        grid-template-columns: 72px 1fr;
        column-gap: 14px;
      }

      .detail-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 9px;
      }

      .detail-table th,
      .detail-table td {
        border: 1px solid #222222;
        padding: 7px 5px;
        vertical-align: middle;
        overflow: hidden;
      }

      .detail-table th {
        font-weight: 700;
        text-align: center;
        white-space: nowrap;
      }

      .detail-table td:nth-child(1),
      .detail-table td:nth-child(2) {
        text-align: left;
        overflow-wrap: anywhere;
      }

      .detail-table td:nth-child(3),
      .detail-table td:nth-child(4),
      .quantity-cell {
        text-align: center;
      }

      .detail-table td.tooth-cell {
        padding: 4px 3px;
        text-align: center;
      }

      .tooth-chart {
        display: grid;
        grid-template-rows: 16px 1px 16px;
        width: 100%;
        min-width: 58px;
        max-width: 74px;
        margin: 0 auto;
        color: #111111;
        font-size: 10px;
        font-weight: 600;
        line-height: 1;
      }

      .tooth-row {
        display: grid;
        grid-template-columns:
          minmax(0, 1fr)
          1px
          minmax(0, 1fr);
        align-items: center;
        min-height: 0;
      }

      .tooth-boundary {
        width: 100%;
        height: 1px;
        background: #222222;
      }

      .tooth-axis {
        width: 1px;
        height: 100%;
        background: transparent;
      }

      .tooth-axis.is-visible {
        background: #222222;
      }

      .tooth-axis-upper {
        align-self: end;
      }

      .tooth-axis-lower {
        align-self: start;
      }

      .tooth-side {
        min-width: 0;
        white-space: nowrap;
      }

      .tooth-number,
      .tooth-bridge-end {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 12px;
        height: 12px;
        vertical-align: middle;
      }

      .tooth-bridge-end {
        border: 1px solid #222222;
        border-radius: 999px;
      }

      .tooth-side-right {
        padding-right: 7px;
        text-align: right;
      }

      .tooth-side-left {
        padding-left: 7px;
        text-align: left;
      }

      .tooth-empty,
      .tooth-invalid {
        font-size: 9px;
        line-height: 1.2;
      }

      .tooth-invalid {
        margin-top: 2px;
      }

      .material-cell {
        line-height: 1.5;
        white-space: normal;
      }

      .money-cell {
        text-align: right;
        white-space: nowrap;
      }
    </style>
  </head>

  <body>
    <section class="invoice-page">
      <header class="header">
        <div>
          <h1 class="title">請求書</h1>
          <div class="customer-name cover-customer-name">
            ${escapeHtml(data.customer_name)} 様
          </div>
        </div>

        <div class="lab-info cover-lab-info">
          <div class="lab-name">町田歯科技工所</div>
          <div>〒547-0034</div>
          <div>大阪府大阪市平野区背戸口2-1-18</div>
          <div>TEL/FAX：06-7504-6229</div>
          <div>T8810900908573</div>
        </div>
      </header>

      <section class="section">
        <h2 class="section-title">請求情報</h2>
        <div class="info-grid cover-grid">
          <div class="label">請求書番号</div>
          <div class="invoice-no-value">
            ${escapeHtml(data.display_invoice_no)}
          </div>
          <div class="label">請求日</div>
          <div>${escapeHtml(data.invoice_date)}</div>
          <div class="label">請求対象期間</div>
          <div>
            ${escapeHtml(data.period_start)}
            ～
            ${escapeHtml(data.period_end)}
          </div>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">ご請求金額</h2>
        <div class="total-grid cover-grid">
          <div class="label">税抜合計</div>
          <div class="amount-value">
            ${escapeHtml(formatYen(data.subtotal))}
          </div>
          <div class="label">消費税率</div>
          <div class="amount-value">
            ${escapeHtml(formatPercent(data.tax_rate))}
          </div>
          <div class="label">消費税額</div>
          <div class="amount-value">
            ${escapeHtml(formatYen(data.tax_amount))}
          </div>
          <div class="label grand-total">税込合計</div>
          <div class="amount-value grand-total">
            ${escapeHtml(formatYen(data.total_amount))}
          </div>
        </div>
      </section>

      <section class="bank-info">
        <div class="bank-title">振込先情報</div>
        <div class="bank-row">
          <span>銀行名</span>
          <span>楽天銀行</span>
        </div>
        <div class="bank-row">
          <span>支店名</span>
          <span>タイコ支店</span>
        </div>
        <div class="bank-row">
          <span>口座</span>
          <span>普通 4054570　大城寮三</span>
        </div>
      </section>
    </section>

    <section class="invoice-page">
      <header class="header">
        <div>
          <h1 class="title">請求明細</h1>
          <div class="customer-name">
            ${escapeHtml(data.customer_name)} 様
          </div>
        </div>

        <div class="lab-info">
          <div>請求書番号：${escapeHtml(data.display_invoice_no)}</div>
          <div>請求日：${escapeHtml(data.invoice_date)}</div>
        </div>
      </header>

      <section class="section">
        <table class="detail-table">
          <colgroup>
            <col style="width: 15%;" />
            <col style="width: 31.5%;" />
            <col style="width: 20%;" />
            <col style="width: 9%;" />
            <col style="width: 5%;" />
            <col style="width: 9.75%;" />
            <col style="width: 9.75%;" />
          </colgroup>

          <thead>
            <tr>
              <th>患者名</th>
              <th>作業内容</th>
              <th>部位</th>
              <th>使用材料</th>
              <th>数量</th>
              <th>単価</th>
              <th>金額</th>
            </tr>
          </thead>

          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
      </section>
    </section>
  </body>
</html>`;
}

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const resolvedParams = await params;

  const invoiceId = parsePositiveInteger(
    resolvedParams.id
  );

  if (invoiceId === null) {
    return NextResponse.json(
      { error: "Invalid invoice id" },
      { status: 400 }
    );
  }

  let browser:
    | Awaited<ReturnType<typeof puppeteer.launch>>
    | null = null;

  try {
    const data = await fetchInvoicePdfData(invoiceId);

    if (!data) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const html = createInvoiceHtml(data);

    browser = await createBrowser();

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "domcontentloaded",
    });

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

    const fileName = `${
      data.display_invoice_no || `invoice-${data.id}`
    }.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
          fileName
        )}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Failed to generate invoice PDF", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
