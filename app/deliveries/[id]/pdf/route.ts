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

const BASE_UP_SUPPORT_AMOUNT_PER_ITEM = 136;

type DeliveryPdfItem = {
  delivery_item_id: number;
  order_item_id: number;
  patient_name: string;
  work_type_name: string;
  teeth: DeliveryPdfTooth[];
  used_materials: DeliveryPdfUsedMaterialItem[];
  quantity: number;
  unit_price: string;
  amount: string;
};

type DeliveryPdfUsedMaterialItem = {
  label: string;
  unit: string;
  quantity: string;
};

type DeliveryPdfTooth = {
  tooth_no: string;
  is_bridge: boolean;
};

type DeliveryPdfData = {
  id: number;
  delivery_no: string;
  customer_name: string;
  delivery_date: string;
  material_summary: DeliveryMaterialSummaryItem[];
  total_amount: string;
  tax_rate: Prisma.Decimal | null;
  tax_amount: Prisma.Decimal | null;
  total_amount_including_tax: Prisma.Decimal | null;
  total_amount_with_base_up_support: string;
  base_up_support_amount: string | null;
  items: DeliveryPdfItem[];
};

type DeliveryMaterialSummaryItem = {
  label: string;
  unit: string;
  used_quantity: string;
  remaining_quantity: string;
};

type DepositMaterialType = "para" | "miro";

type DepositMaterialTransactionForPdf = {
  order_item_id: number | null;
  transaction_type: "deposit" | "use" | "use_reversal" | string;
  quantity: string;
  material_name: string;
  unit: string;
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

function formatPlainYen(value: number) {
  return `${new Intl.NumberFormat("ja-JP").format(value)}円`;
}

function formatMaterialQuantity(value: Prisma.Decimal | number) {
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 3,
  }).format(Number(value));
}

function toDepositMaterialType(name: string): DepositMaterialType | null {
  if (name.includes("パラ")) {
    return "para";
  }

  if (name.includes("ミロ")) {
    return "miro";
  }

  return null;
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

function createToothChart(teeth: DeliveryPdfTooth[]) {
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

function renderToothNumbersHtml(teeth: DeliveryPdfTooth[]) {
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

async function fetchDeliveryPdfData(
  deliveryId: number
): Promise<DeliveryPdfData | null> {
  const delivery = await prisma.deliveries.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      delivery_no: true,
      customer_id: true,
      delivery_date: true,
      total_amount: true,
      tax_rate: true,
      tax_amount: true,
      total_amount_including_tax: true,
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

  const orderItemIds = delivery.delivery_items.map(
    (item) => item.order_item_id
  );

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
      work_name: true,
      base_up_support_target: true,
      quantity: true,
    },
  });

  const orderIds = [
    ...new Set(orderItems.map((item) => item.order_id)),
  ];

  const insuranceItemIds = [
    ...new Set(
      orderItems.flatMap((item) =>
        item.insurance_item_id === null
          ? []
          : [item.insurance_item_id]
      )
    ),
  ];

  const privateItemIds = [
    ...new Set(
      orderItems.flatMap((item) =>
        item.private_item_id === null
          ? []
          : [item.private_item_id]
      )
    ),
  ];

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

  const [
    customer,
    orderTeeth,
    insuranceItems,
    privateItems,
    patients,
  ] = await Promise.all([
    prisma.customers.findUnique({
      where: { id: delivery.customer_id },
      select: {
        name: true,
        show_material_on_delivery: true,
      },
    }),

    prisma.order_teeth.findMany({
      where: {
        order_id: {
          in: orderIds,
        },
      },
      orderBy: [
        { order_id: "asc" },
        { id: "asc" },
      ],
    }),

    insuranceItemIds.length === 0
      ? Promise.resolve(
          [] as Array<{
            id: number;
            item_name: string;
          }>
        )
      : prisma.$queryRawUnsafe<
          Array<{
            id: number;
            item_name: string;
          }>
        >(
          `
            SELECT
              iim.id,
              CONCAT_WS(
                ' ',
                NULLIF(TRIM(iisc.name), ''),
                NULLIF(TRIM(iim.name), '')
              ) AS item_name
            FROM insurance_item_masters iim
            LEFT JOIN insurance_sub_categories iisc
              ON iisc.id = iim.sub_category_id
            WHERE iim.id = ANY($1)
          `,
          insuranceItemIds
        ),

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

    prisma.patients.findMany({
      where: {
        id: {
          in: [
            ...new Set(
              orders.map((order) => order.patient_id)
            ),
          ],
        },
      },
      select: {
        id: true,
        patient_name: true,
      },
    }),

  ]);

  const depositMaterialTransactions =
    customer?.show_material_on_delivery
      ? await prisma.$queryRaw<DepositMaterialTransactionForPdf[]>`
          SELECT
            cdmt.order_item_id,
            cdmt.transaction_type,
            cdmt.quantity::text AS quantity,
            m.name AS material_name,
            m.unit
          FROM customer_deposit_material_transactions cdmt
          INNER JOIN customer_deposit_materials cdm
            ON cdm.id = cdmt.deposit_material_id
          INNER JOIN materials m
            ON m.id = cdm.material_id
          WHERE cdm.customer_id = ${delivery.customer_id}
            AND cdmt.transaction_type IN (
              'deposit',
              'use',
              'use_reversal'
            )
            AND (
              m.name LIKE ${"%パラ%"}
              OR m.name LIKE ${"%ミロ%"}
            )
        `
      : [];

  const orderItemById = new Map(
    orderItems.map((item) => [item.id, item])
  );

  const orderById = new Map(
    orders.map((order) => [order.id, order])
  );

  const patientNameById = new Map(
    patients.map((patient) => [
      patient.id,
      patient.patient_name,
    ])
  );

  const insuranceNameById = new Map(
    insuranceItems.map((item) => [
      item.id,
      item.item_name,
    ])
  );

  const privateNameById = new Map(
    privateItems.map((item) => [
      item.id,
      item.item_name,
    ])
  );

  const deliveryOrderItemIds = new Set(orderItemIds);
  const materialTypes: DepositMaterialType[] = ["para", "miro"];
  const materialLabels: Record<DepositMaterialType, string> = {
    para: "パラ",
    miro: "ミロ",
  };
  const unitsByMaterialType = new Map<DepositMaterialType, string>();
  const remainingQuantityByMaterialType = new Map<
    DepositMaterialType,
    Prisma.Decimal
  >();
  const usedQuantityByOrderItemAndMaterial = new Map<
    string,
    Prisma.Decimal
  >();

  for (const transaction of depositMaterialTransactions) {
    const materialType = toDepositMaterialType(
      transaction.material_name
    );

    if (materialType === null) {
      continue;
    }

    unitsByMaterialType.set(materialType, transaction.unit);

    const quantity = new Prisma.Decimal(transaction.quantity);
    const currentRemaining =
      remainingQuantityByMaterialType.get(materialType) ??
      new Prisma.Decimal(0);

    if (transaction.transaction_type === "deposit") {
      remainingQuantityByMaterialType.set(
        materialType,
        currentRemaining.add(quantity)
      );
    } else if (transaction.transaction_type === "use") {
      remainingQuantityByMaterialType.set(
        materialType,
        currentRemaining.sub(quantity)
      );
    } else if (transaction.transaction_type === "use_reversal") {
      remainingQuantityByMaterialType.set(
        materialType,
        currentRemaining.add(quantity)
      );
    }

    if (
      transaction.order_item_id === null ||
      !deliveryOrderItemIds.has(transaction.order_item_id)
    ) {
      continue;
    }

    const orderItemMaterialKey = `${transaction.order_item_id}:${materialType}`;
    const currentUsed =
      usedQuantityByOrderItemAndMaterial.get(orderItemMaterialKey) ??
      new Prisma.Decimal(0);

    if (transaction.transaction_type === "use") {
      usedQuantityByOrderItemAndMaterial.set(
        orderItemMaterialKey,
        currentUsed.add(quantity)
      );
    } else if (transaction.transaction_type === "use_reversal") {
      usedQuantityByOrderItemAndMaterial.set(
        orderItemMaterialKey,
        currentUsed.sub(quantity)
      );
    }
  }

  const materialSummary =
    customer?.show_material_on_delivery
      ? materialTypes.map((materialType) => {
          const usedQuantity = orderItemIds.reduce(
            (total, orderItemId) =>
              total.add(
                usedQuantityByOrderItemAndMaterial.get(
                  `${orderItemId}:${materialType}`
                ) ?? new Prisma.Decimal(0)
              ),
            new Prisma.Decimal(0)
          );

          return {
            label: materialLabels[materialType],
            unit: unitsByMaterialType.get(materialType) ?? "g",
            used_quantity: formatMaterialQuantity(usedQuantity),
            remaining_quantity: formatMaterialQuantity(
              remainingQuantityByMaterialType.get(materialType) ??
                new Prisma.Decimal(0)
            ),
          };
        })
      : [];

  const teethByOrderId =
    orderTeeth.reduce<Map<number, DeliveryPdfTooth[]>>(
      (acc, tooth) => {
        const current =
          acc.get(tooth.order_id) ?? [];

        current.push({
          tooth_no: tooth.tooth_no,
          is_bridge: tooth.is_bridge,
        });

        acc.set(tooth.order_id, current);

        return acc;
      },
      new Map<number, DeliveryPdfTooth[]>()
    );

  const items = delivery.delivery_items.map(
    (deliveryItem) => {
      const orderItem = orderItemById.get(
        deliveryItem.order_item_id
      );

      if (!orderItem) {
        throw new Error(
          `order_item ${deliveryItem.order_item_id} not found`
        );
      }

      const order = orderById.get(
        orderItem.order_id
      );

      if (!order) {
        throw new Error(
          `order ${orderItem.order_id} not found`
        );
      }

      const patientName =
        patientNameById.get(order.patient_id) ??
        "未登録";

      const workTypeName =
        orderItem.work_name?.trim() ||
        (orderItem.insurance_item_id !== null
          ? insuranceNameById.get(
              orderItem.insurance_item_id
            ) ?? "未登録"
          : privateNameById.get(
              orderItem.private_item_id as number
            ) ?? "未登録");

      const usedMaterials = customer?.show_material_on_delivery
        ? materialTypes.flatMap((materialType) => {
            const quantity =
              usedQuantityByOrderItemAndMaterial.get(
                `${deliveryItem.order_item_id}:${materialType}`
              ) ?? new Prisma.Decimal(0);

            if (quantity.lte(0)) {
              return [];
            }

            return [
              {
                label: materialLabels[materialType],
                unit:
                  unitsByMaterialType.get(materialType) ?? "g",
                quantity: formatMaterialQuantity(quantity),
              },
            ];
          })
        : [];

      return {
        delivery_item_id: deliveryItem.id,
        order_item_id: deliveryItem.order_item_id,
        patient_name:
          patientName === "未登録"
            ? patientName
            : `${patientName} 様`,
        work_type_name: workTypeName,
        teeth:
          teethByOrderId.get(order.id) ?? [],
        used_materials: usedMaterials,
        quantity: deliveryItem.quantity,
        unit_price: formatYen(
          deliveryItem.unit_price
        ),
        amount: formatYen(
          deliveryItem.amount
        ),
      };
    }
  );

  const totalAmount =
    delivery.total_amount ?? null;

  const baseUpSupportAmount =
    orderItems.reduce((total, orderItem) => {
      if (!orderItem.base_up_support_target) {
        return total;
      }

      return (
        total +
        BASE_UP_SUPPORT_AMOUNT_PER_ITEM *
          (orderItem.quantity ?? 1)
      );
    }, 0);

  const totalAmountWithBaseUpSupport = (
    delivery.total_amount_including_tax ??
    totalAmount ??
    new Prisma.Decimal(0)
  ).add(baseUpSupportAmount);

  return {
    id: delivery.id,
    delivery_no: delivery.delivery_no ?? "",
    customer_name:
      customer?.name ?? "未登録",
    delivery_date: formatDate(
      delivery.delivery_date,
      "-"
    ),
    material_summary: materialSummary,
    total_amount: formatYen(totalAmount),
    tax_rate: delivery.tax_rate,
    tax_amount: delivery.tax_amount,
    total_amount_including_tax:
      delivery.total_amount_including_tax,
    total_amount_with_base_up_support:
      formatYen(totalAmountWithBaseUpSupport),
    base_up_support_amount:
      baseUpSupportAmount > 0
        ? formatPlainYen(
            baseUpSupportAmount
          )
        : null,
    items,
  };
}

function createDeliveryHtml(
  data: DeliveryPdfData
) {
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
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.patient_name)}</td>
          <td>${escapeHtml(item.work_type_name)}</td>
          <td class="tooth-cell">
            ${renderToothNumbersHtml(item.teeth)}
          </td>
          <td class="used-material-cell">
            ${
              item.used_materials.length > 0
                ? item.used_materials
                    .map(
                      (material) => `
                        <div>
                          ${escapeHtml(material.label)}
                          ${escapeHtml(material.quantity)}${escapeHtml(
                            material.unit
                          )}
                        </div>
                      `
                    )
                    .join("")
                : "-"
            }
          </td>
          <td class="quantity-cell">
            ${escapeHtml(String(item.quantity))}
          </td>
          <td class="unit-price-cell">
            ${escapeHtml(item.unit_price)}
          </td>
          <td class="amount-cell">
            ${escapeHtml(item.amount)}
          </td>
        </tr>
      `
    )
    .join("");

  const hasTaxSummary =
    data.tax_rate !== null &&
    data.tax_amount !== null &&
    data.total_amount_including_tax !== null;

  const baseUpSupportHtml =
    data.base_up_support_amount
      ? `
        <div class="total-row">
          <span>ベースアップ支援金</span>
          <span>${escapeHtml(
            data.base_up_support_amount
          )}</span>
        </div>
      `
      : "";

  const materialSummaryHtml =
    data.material_summary.length > 0
      ? data.material_summary
          .map(
            (item) => `
              <div class="overview-material-row">
                <span>
                  使用${escapeHtml(
                    item.label
                  )} ${escapeHtml(
                    item.used_quantity
                  )}${escapeHtml(item.unit)}
                </span>

                <span>
                  残${escapeHtml(
                    item.label
                  )} ${escapeHtml(
                    item.remaining_quantity
                  )}${escapeHtml(item.unit)}
                </span>
              </div>
            `
          )
          .join("")
      : "";

  const totalHtml = hasTaxSummary
    ? (() => {
        const taxRate = data.tax_rate;
        const taxAmount = data.tax_amount;

        return `
          <div class="total-row">
            <span>合計金額（税抜）</span>
            <span>${escapeHtml(
              data.total_amount
            )}</span>
          </div>

          <div class="total-row">
            <span>税率</span>
            <span>${escapeHtml(
              formatPercent(taxRate)
            )}</span>
          </div>

          <div class="total-row">
            <span>消費税額</span>
            <span>${escapeHtml(
              formatYen(taxAmount)
            )}</span>
          </div>

          ${baseUpSupportHtml}

          <div class="total-divider"></div>

          <div class="total-row total-row-grand">
            <span>合計金額（税込）</span>
            <span>${escapeHtml(
              data.total_amount_with_base_up_support
            )}</span>
          </div>
        `;
      })()
    : `
        ${baseUpSupportHtml}

        <div class="total-row total-row-grand">
          <span>合計金額</span>
          <span>${escapeHtml(
            data.total_amount_with_base_up_support
          )}</span>
        </div>
      `;

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

      /*
       * =====================================================
       * 納品書明細テーブル
       *
       * 列幅は colgroup で固定
       *
       * 患者名    15%
       * 作業内容 31.5%
       * 部位      20%
       * 使用材料   9%
       * 数量       5%
       * 単価     9.75%
       * 金額     9.75%
       * 合計    100%
       * =====================================================
       */

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
        overflow: hidden;
      }

      .delivery-table th {
        font-weight: 600;
        text-align: center;
        white-space: nowrap;
      }

      /*
       * 患者名
       */
      .delivery-table th:nth-child(1),
      .delivery-table td:nth-child(1) {
        text-align: left;
      }

      /*
       * 作業内容
       */
      .delivery-table th:nth-child(2),
      .delivery-table td:nth-child(2) {
        text-align: left;
        white-space: normal;
        overflow-wrap: anywhere;
      }

      /*
       * 部位
       */
      .delivery-table th:nth-child(3),
      .delivery-table td:nth-child(3) {
        text-align: center;
      }

      /*
       * 使用材料
       *
       * 将来的に「パラ 1.5g」「ミロ 0.8g」を表示する。
       */
      .delivery-table th:nth-child(4),
      .delivery-table td:nth-child(4) {
        text-align: center;
        white-space: normal;
        overflow-wrap: anywhere;
      }

      .delivery-table td.used-material-cell {
        line-height: 1.5;
      }

      /*
       * 数量
       *
       * 既存幅の5%を維持。
       * 文字が広がって列幅を押し広げないようにする。
       */
      .delivery-table th:nth-child(5),
      .delivery-table td:nth-child(5) {
        text-align: center;
        padding-left: 2px;
        padding-right: 2px;
        white-space: nowrap;
      }

      /*
       * 単価
       */
      .delivery-table th:nth-child(6),
      .delivery-table td:nth-child(6) {
        text-align: right;
      }

      /*
       * 金額
       */
      .delivery-table th:nth-child(7),
      .delivery-table td:nth-child(7) {
        text-align: right;
      }

      .delivery-table td.tooth-cell {
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

      .summary-footer {
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 24px;
        margin-top: 18px;
        font-size: 12px;
      }

      .overview {
        flex: 1 1 auto;
        min-width: 0;
        text-align: left;
      }

      .overview-title {
        font-weight: 700;
        margin-bottom: 8px;
      }

      .overview-material-row {
        display: flex;
        gap: 22px;
        margin-top: 5px;
        white-space: nowrap;
      }

      .total-panel {
        flex: 0 0 auto;
        min-width: 250px;
      }

      .total-row {
        display: grid;
        grid-template-columns:
          auto
          minmax(110px, auto);
        column-gap: 18px;
        align-items: baseline;
        justify-content: end;
        margin-top: 6px;
      }

      .total-row:first-child {
        margin-top: 0;
      }

      .total-row span:last-child {
        text-align: right;
      }

      .total-divider {
        border-top: 1px solid #222222;
        margin-top: 8px;
        margin-bottom: 4px;
      }

      .total-row-grand {
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
            <div>
              納品書番号：
              <span>${escapeHtml(
                data.delivery_no
              )}</span>
            </div>

            <div>
              納品日：
              <span>${escapeHtml(
                data.delivery_date
              )}</span>
            </div>
          </div>

          <div class="customer-name">
            ${escapeHtml(
              data.customer_name
            )} 様
          </div>

        </section>

        <section class="lab-info">
          <div class="lab-name">
            町田歯科技工所
          </div>

          <div>〒547-0034</div>
          <div>
            大阪府大阪市平野区背戸口2-1-18
          </div>
          <div>
            TEL/FAX：06-7504-6229
          </div>
        </section>

      </header>

      <div class="separator"></div>

      <table class="delivery-table">

        <!--
          列幅をここで完全固定
          15% + 31.5% + 20% + 9% + 5% + 9.75% + 9.75% = 100%
        -->
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

      <div class="summary-footer">

        <section class="overview">
          <div class="overview-title">
            概要
          </div>

          ${materialSummaryHtml}
        </section>

        <div class="total-panel">
          ${totalHtml}
        </div>

      </div>

    </main>
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

  const deliveryId = parsePositiveInteger(
    resolvedParams.id
  );

  if (deliveryId === null) {
    return NextResponse.json(
      { error: "Invalid delivery id" },
      { status: 400 }
    );
  }

  let browser:
    | Awaited<
        ReturnType<typeof puppeteer.launch>
      >
    | null = null;

  try {
    const data =
      await fetchDeliveryPdfData(deliveryId);

    if (!data) {
      return NextResponse.json(
        { error: "Delivery not found" },
        { status: 404 }
      );
    }

    const html = createDeliveryHtml(data);

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

    const fileName =
      `${data.delivery_no || `delivery-${data.id}`}.pdf`;

    return new Response(
      new Uint8Array(pdfBuffer),
      {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition":
            `inline; filename*=UTF-8''${encodeURIComponent(
              fileName
            )}`,
          "Cache-Control":
            "private, no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "Failed to generate delivery PDF",
      error
    );

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
