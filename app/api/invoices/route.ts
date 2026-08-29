import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const BASE_UP_SUPPORT_AMOUNT_PER_ITEM = 136;
type BaseUpSupportTaxMode =
  | "included_in_taxable_subtotal"
  | "outside_taxable_subtotal";

/**
 * BUS（ベースアップ支援金）の税計算方式
 *
 * included_in_taxable_subtotal:
 *   BUSを税抜合計へ含め、その合計に対して消費税を計算する
 *
 * outside_taxable_subtotal:
 *   BUSを消費税計算の対象外として、税込金額へ最後に加算する
 *
 * 税務上の扱いが確定したら、この1行だけ変更する。
 */
const BASE_UP_SUPPORT_TAX_MODE: BaseUpSupportTaxMode =
  "included_in_taxable_subtotal";

class InvoiceRequestError extends Error {
  constructor(
    message: string,
    readonly status: number = 400
  ) {
    super(message);
  }
}

function parsePositiveInteger(value: unknown, fieldName: string) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvoiceRequestError(`${fieldName} must be a positive integer`);
  }

  return parsed;
}

function parseDate(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvoiceRequestError(`${fieldName} must be YYYY-MM-DD`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new InvoiceRequestError(`${fieldName} is invalid`);
  }

  return date;
}

function parseBillingYear(value: unknown) {
  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 1900 ||
    parsed > 9999
  ) {
    throw new InvoiceRequestError(
      "billing_year must be a valid year"
    );
  }

  return parsed;
}

function parseBillingMonth(value: unknown) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
    throw new InvoiceRequestError(
      "billing_month must be 1-12"
    );
  }

  return parsed;
}

function createUtcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function getDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

type CustomerBillingSettings = {
  billing_closing_day: number | null;
  billing_closing_month_end: boolean;
  billing_issue_day: number | null;
  billing_issue_month_end: boolean;
};

function calculateBillingPeriod(
  customer: CustomerBillingSettings,
  billingYear: number,
  billingMonth: number
) {
  if (customer.billing_closing_month_end) {
    return {
      periodStart: createUtcDate(billingYear, billingMonth, 1),
      periodEnd: createUtcDate(
        billingYear,
        billingMonth,
        getDaysInMonth(billingYear, billingMonth)
      ),
      closingDayForIssue: getDaysInMonth(
        billingYear,
        billingMonth
      ),
    };
  }

  const closingDay = customer.billing_closing_day;

  if (
    closingDay === null ||
    !Number.isInteger(closingDay) ||
    closingDay < 1 ||
    closingDay > 31
  ) {
    throw new InvoiceRequestError(
      "請求締日設定が不正です",
      409
    );
  }

  const previousMonth = billingMonth === 1 ? 12 : billingMonth - 1;
  const previousMonthYear =
    billingMonth === 1 ? billingYear - 1 : billingYear;
  const previousClosingDay = Math.min(
    closingDay,
    getDaysInMonth(previousMonthYear, previousMonth)
  );
  const currentClosingDay = Math.min(
    closingDay,
    getDaysInMonth(billingYear, billingMonth)
  );

  return {
    periodStart: createUtcDate(
      previousMonthYear,
      previousMonth,
      previousClosingDay + 1
    ),
    periodEnd: createUtcDate(
      billingYear,
      billingMonth,
      currentClosingDay
    ),
    closingDayForIssue: currentClosingDay,
  };
}

function calculateInvoiceDate(
  customer: CustomerBillingSettings,
  billingYear: number,
  billingMonth: number,
  closingDayForIssue: number
) {
  if (customer.billing_issue_month_end) {
    return createUtcDate(
      billingYear,
      billingMonth,
      getDaysInMonth(billingYear, billingMonth)
    );
  }

  const issueDay = customer.billing_issue_day;

  if (
    issueDay === null ||
    !Number.isInteger(issueDay) ||
    issueDay < 1 ||
    issueDay > 31
  ) {
    throw new InvoiceRequestError(
      "請求書発行日設定が不正です",
      409
    );
  }

  const issueMonth =
    issueDay > closingDayForIssue
      ? billingMonth
      : billingMonth === 12
        ? 1
        : billingMonth + 1;
  const issueYear =
    issueDay > closingDayForIssue
      ? billingYear
      : billingMonth === 12
        ? billingYear + 1
        : billingYear;
  const safeIssueDay = Math.min(
    issueDay,
    getDaysInMonth(issueYear, issueMonth)
  );

  return createUtcDate(issueYear, issueMonth, safeIssueDay);
}

function formatDate(date: Date, separator = "") {
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

function createNextInvoiceNo(
  invoiceDate: Date,
  existingInvoiceNos: string[]
) {
  const dateKey = formatDate(invoiceDate);
  const prefix = `INV-${dateKey}-`;
  const pattern = new RegExp(`^${prefix}(\\d+)$`);

  const maxSequence = existingInvoiceNos.reduce((max, value) => {
    const match = value.match(pattern);

    if (!match) {
      return max;
    }

    const sequence = Number(match[1]);

    if (!Number.isInteger(sequence) || sequence <= max) {
      return max;
    }

    return sequence;
  }, 0);

  return `${prefix}${String(maxSequence + 1).padStart(3, "0")}`;
}

function formatMaterialQuantity(value: Prisma.Decimal) {
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 3,
  }).format(Number(value));
}

function formatMaterialLabel(name: string) {
  if (name.includes("ミロ")) {
    return "ミロ";
  }

  if (
    name.includes("パラ") ||
    name.includes("金銀パラジウム")
  ) {
    return "パラ";
  }

  return name;
}

function createToothDisplay(toothNos: string[]) {
  if (toothNos.length === 0) {
    return "";
  }

  return toothNos.join(", ");
}

/**
 * GET
 *
 * 作成済み請求書一覧
 */
export async function GET() {
  try {
    const invoices = await prisma.invoices.findMany({
      orderBy: {
        created_at: "desc",
      },

      select: {
        id: true,
        invoice_no: true,
        display_invoice_no: true,
        customer_id: true,
        period_start: true,
        period_end: true,
        closing_date: true,
        invoice_date: true,
        subtotal: true,
        tax_rate: true,
        tax_amount: true,
        base_up_support_amount: true,
        total_amount: true,
        paid: true,
        created_at: true,
        updated_at: true,
      },
    });

    const customerIds = [
      ...new Set(invoices.map((invoice) => invoice.customer_id)),
    ];

    const customers =
      customerIds.length === 0
        ? []
        : await prisma.customers.findMany({
            where: {
              id: {
                in: customerIds,
              },
            },

            select: {
              id: true,
              name: true,
            },
          });

    const customerNameById = new Map(
      customers.map((customer) => [
        customer.id,
        customer.name,
      ])
    );

    const result = invoices.map((invoice) => ({
      ...invoice,

      customer_name:
        customerNameById.get(invoice.customer_id) ??
        "未登録",
    }));

    return NextResponse.json({
      invoices: result,
    });
  } catch (error) {
    console.error("GET /api/invoices failed", error);

    return NextResponse.json(
      {
        error: "Failed to fetch invoices",
      },
      {
        status: 500,
      }
    );
  }
}

/**
 * POST
 *
 * 指定医院・請求期間の
 * 「未請求納品書」をまとめて請求書として確定する。
 *
 * 作成するもの：
 *
 * invoices
 * invoice_deliveries
 * invoice_items
 */
export async function POST(request: NextRequest) {
  try {
    const parsedBody: unknown = await request.json();

    if (
      typeof parsedBody !== "object" ||
      parsedBody === null ||
      Array.isArray(parsedBody)
    ) {
      throw new InvoiceRequestError(
        "Request body must be an object"
      );
    }

    const body = parsedBody as Record<string, unknown>;

    const customerId = parsePositiveInteger(
      body.customer_id,
      "customer_id"
    );

    const billingYear = parseBillingYear(
      body.billing_year
    );
    const billingMonth = parseBillingMonth(
      body.billing_month
    );

    const invoice = await prisma.$transaction(
      async (transaction) => {
        /*
         * --------------------------------------------------
         * 医院確認
         * --------------------------------------------------
         */
        const customer = await transaction.customers.findUnique({
          where: {
            id: customerId,
          },

          select: {
            id: true,
            name: true,
            billing_closing_day: true,
            billing_closing_month_end: true,
            billing_issue_day: true,
            billing_issue_month_end: true,
          },
        });

        if (!customer) {
          throw new InvoiceRequestError(
            "歯科医院が存在しません",
            404
          );
        }

        const {
          periodStart,
          periodEnd,
          closingDayForIssue,
        } = calculateBillingPeriod(
          customer,
          billingYear,
          billingMonth
        );
        const invoiceDate = calculateInvoiceDate(
          customer,
          billingYear,
          billingMonth,
          closingDayForIssue
        );

        /*
         * --------------------------------------------------
         * すでに請求書へ使用された delivery_id
         * --------------------------------------------------
         */
        const alreadyInvoicedRows =
          await transaction.invoice_deliveries.findMany({
            select: {
              delivery_id: true,
            },
          });

        const alreadyInvoicedDeliveryIds =
          alreadyInvoicedRows.map(
            (row) => row.delivery_id
          );

        /*
         * --------------------------------------------------
         * 請求対象納品書
         * --------------------------------------------------
         */
        const deliveries =
          await transaction.deliveries.findMany({
            where: {
              customer_id: customerId,

              delivery_date: {
                gte: periodStart,
                lte: periodEnd,
              },

              ...(alreadyInvoicedDeliveryIds.length > 0
                ? {
                    id: {
                      notIn:
                        alreadyInvoicedDeliveryIds,
                    },
                  }
                : {}),
            },

            include: {
              delivery_items: {
                orderBy: {
                  id: "asc",
                },
              },
            },

            orderBy: [
              {
                delivery_date: "asc",
              },
              {
                id: "asc",
              },
            ],
          });

        if (deliveries.length === 0) {
          throw new InvoiceRequestError(
            "請求対象となる未請求の納品書がありません",
            409
          );
        }

        /*
         * --------------------------------------------------
         * 税率確認
         *
         * 現時点では1請求書につき1税率。
         * --------------------------------------------------
         */
        const taxRateStrings = [
          ...new Set(
            deliveries.flatMap((delivery) =>
              delivery.tax_rate === null
                ? []
                : [delivery.tax_rate.toString()]
            )
          ),
        ];

        if (taxRateStrings.length !== 1) {
          throw new InvoiceRequestError(
            "請求対象に異なる税率の納品書が含まれています",
            409
          );
        }

        const taxRate = new Prisma.Decimal(
          taxRateStrings[0]
        );

        /*
         * --------------------------------------------------
         * 全 delivery_item
         * --------------------------------------------------
         */
        const deliveryItems = deliveries.flatMap(
          (delivery) =>
            delivery.delivery_items.map((item) => ({
              ...item,

              delivery_id: delivery.id,
              delivery_date: delivery.delivery_date,
            }))
        );

        const orderItemIds = deliveryItems.map(
          (item) => item.order_item_id
        );

        /*
         * --------------------------------------------------
         * order_items
         * --------------------------------------------------
         */
        const orderItems =
          await transaction.order_items.findMany({
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

        if (orderItems.length !== orderItemIds.length) {
          throw new InvoiceRequestError(
            "請求対象の受注明細が存在しません",
            409
          );
        }

        const orderItemById = new Map(
          orderItems.map((item) => [item.id, item])
        );

        /*
         * --------------------------------------------------
         * orders
         * --------------------------------------------------
         */
        const orderIds = [
          ...new Set(
            orderItems.map((item) => item.order_id)
          ),
        ];

        const orders = await transaction.orders.findMany({
          where: {
            id: {
              in: orderIds,
            },
          },

          select: {
            id: true,
            patient_id: true,
            customer_id: true,
          },
        });

        const orderById = new Map(
          orders.map((order) => [order.id, order])
        );

        /*
         * --------------------------------------------------
         * patients
         * --------------------------------------------------
         */
        const patientIds = [
          ...new Set(
            orders.map((order) => order.patient_id)
          ),
        ];

        const patients =
          await transaction.patients.findMany({
            where: {
              id: {
                in: patientIds,
              },
            },

            select: {
              id: true,
              patient_name: true,
            },
          });

        const patientNameById = new Map(
          patients.map((patient) => [
            patient.id,
            patient.patient_name,
          ])
        );

        /*
         * --------------------------------------------------
         * 歯式
         * --------------------------------------------------
         */
        const orderTeeth =
          await transaction.order_teeth.findMany({
            where: {
              order_id: {
                in: orderIds,
              },
            },

            orderBy: [
              {
                order_id: "asc",
              },
              {
                id: "asc",
              },
            ],

            select: {
              order_id: true,
              tooth_no: true,
              is_bridge: true,
            },
          });

        const teethByOrderId = new Map<
          number,
          Array<{
            tooth_no: string;
            is_bridge: boolean;
          }>
        >();

        for (const tooth of orderTeeth) {
          const current =
            teethByOrderId.get(tooth.order_id) ?? [];

          current.push({
            tooth_no: tooth.tooth_no,
            is_bridge: tooth.is_bridge,
          });

          teethByOrderId.set(
            tooth.order_id,
            current
          );
        }

        /*
         * --------------------------------------------------
         * 保険作業名称
         * --------------------------------------------------
         */
        const insuranceItemIds = [
          ...new Set(
            orderItems.flatMap((item) =>
              item.insurance_item_id === null
                ? []
                : [item.insurance_item_id]
            )
          ),
        ];

        const insuranceItems =
          insuranceItemIds.length === 0
            ? []
            : await transaction.$queryRawUnsafe<
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
              );

        const insuranceNameById = new Map(
          insuranceItems.map((item) => [
            item.id,
            item.item_name,
          ])
        );

        /*
         * --------------------------------------------------
         * 自費作業名称
         * --------------------------------------------------
         */
        const privateItemIds = [
          ...new Set(
            orderItems.flatMap((item) =>
              item.private_item_id === null
                ? []
                : [item.private_item_id]
            )
          ),
        ];

        const privateItems =
          privateItemIds.length === 0
            ? []
            : await transaction.private_items.findMany({
                where: {
                  id: {
                    in: privateItemIds,
                  },
                },

                select: {
                  id: true,
                  item_name: true,
                },
              });

        const privateNameById = new Map(
          privateItems.map((item) => [
            item.id,
            item.item_name,
          ])
        );

        /*
         * --------------------------------------------------
         * 預かり材料使用履歴
         * --------------------------------------------------
         */
        const materialTransactions =
          await transaction.customer_deposit_material_transactions.findMany(
            {
              where: {
                order_item_id: {
                  in: orderItemIds,
                },

                transaction_type: {
                  in: ["use", "use_reversal"],
                },
              },

              select: {
                deposit_material_id: true,
                transaction_type: true,
                quantity: true,
                order_item_id: true,
              },
            }
          );

        const depositMaterialIds = [
          ...new Set(
            materialTransactions.map(
              (row) => row.deposit_material_id
            )
          ),
        ];

        const depositMaterials =
          depositMaterialIds.length === 0
            ? []
            : await transaction.customer_deposit_materials.findMany(
                {
                  where: {
                    id: {
                      in: depositMaterialIds,
                    },
                  },

                  select: {
                    id: true,
                    material_id: true,
                  },
                }
              );

        const materialIds = [
          ...new Set(
            depositMaterials.map(
              (row) => row.material_id
            )
          ),
        ];

        const materials =
          materialIds.length === 0
            ? []
            : await transaction.materials.findMany({
                where: {
                  id: {
                    in: materialIds,
                  },
                },

                select: {
                  id: true,
                  name: true,
                },
              });

        const materialNameById = new Map(
          materials.map((material) => [
            material.id,
            material.name,
          ])
        );

        const depositMaterialById = new Map(
          depositMaterials.map((row) => [
            row.id,
            row,
          ])
        );

        /*
         * order_item_id
         *   ↓
         * 材料名
         *   ↓
         * 有効使用量
         */
        const materialUsageByOrderItemId =
          new Map<
            number,
            Map<string, Prisma.Decimal>
          >();

        for (const row of materialTransactions) {
          if (row.order_item_id === null) {
            continue;
          }

          const depositMaterial =
            depositMaterialById.get(
              row.deposit_material_id
            );

          if (!depositMaterial) {
            continue;
          }

          const materialName =
            materialNameById.get(
              depositMaterial.material_id
            );

          if (!materialName) {
            continue;
          }

          const label =
            formatMaterialLabel(materialName);

          const materialMap =
            materialUsageByOrderItemId.get(
              row.order_item_id
            ) ?? new Map<string, Prisma.Decimal>();

          const current =
            materialMap.get(label) ??
            new Prisma.Decimal(0);

          const signedQuantity =
            row.transaction_type === "use"
              ? row.quantity
              : row.quantity.negated();

          materialMap.set(
            label,
            current.add(signedQuantity)
          );

          materialUsageByOrderItemId.set(
            row.order_item_id,
            materialMap
          );
        }

        /*
         * --------------------------------------------------
         * 請求明細スナップショット作成
         * --------------------------------------------------
         */
        type InvoiceItemRow = {
          delivery_id: number;
          order_item_id: number | null;
          delivery_date: Date;
          patient_name: string;
          work_name: string;
          tooth_display: string | null;
          tooth_snapshot: Prisma.InputJsonValue | null;
          material_usage_text: string | null;
          quantity: number;
          unit_price: Prisma.Decimal;
          amount: Prisma.Decimal;
          sort_order: number;
        };

        const invoiceItemRows: InvoiceItemRow[] = deliveryItems.map(
          (deliveryItem, index) => {
            const orderItem = orderItemById.get(
              deliveryItem.order_item_id
            );

            if (!orderItem) {
              throw new InvoiceRequestError(
                `order_item ${deliveryItem.order_item_id} が存在しません`,
                409
              );
            }

            const order = orderById.get(
              orderItem.order_id
            );

            if (!order) {
              throw new InvoiceRequestError(
                `order ${orderItem.order_id} が存在しません`,
                409
              );
            }

            if (order.customer_id !== customerId) {
              throw new InvoiceRequestError(
                "異なる歯科医院の明細が含まれています",
                409
              );
            }

            const patientName =
              patientNameById.get(
                order.patient_id
              ) ?? "未登録";

            const workName =
              orderItem.work_name?.trim() ||
              (orderItem.insurance_item_id !== null
                ? insuranceNameById.get(
                    orderItem.insurance_item_id
                  ) ?? "未登録"
                : orderItem.private_item_id !== null
                  ? privateNameById.get(
                      orderItem.private_item_id
                    ) ?? "未登録"
                  : "未登録");

            const toothDisplay =
              createToothDisplay(
                (teethByOrderId.get(order.id) ?? []).map(
                  (tooth) => tooth.tooth_no
                )
              );
            const toothSnapshot =
              teethByOrderId.get(order.id) ?? [];

            const materialUsage =
              materialUsageByOrderItemId.get(
                orderItem.id
              );

            const materialUsageText =
              materialUsage
                ? [...materialUsage.entries()]
                    .filter(([, quantity]) =>
                      quantity.greaterThan(0)
                    )
                    .map(
                      ([label, quantity]) =>
                        `${label} ${formatMaterialQuantity(
                          quantity
                        )}g`
                    )
                    .join("\n")
                : "";

            return {
              delivery_id:
                deliveryItem.delivery_id,

              order_item_id:
                deliveryItem.order_item_id,

              delivery_date:
                deliveryItem.delivery_date,

              patient_name: patientName,

              work_name: workName,

              tooth_display:
                toothDisplay || null,

              tooth_snapshot:
                toothSnapshot.length > 0
                  ? toothSnapshot
                  : null,

              material_usage_text:
                materialUsageText || null,

              quantity: deliveryItem.quantity,

              unit_price:
                deliveryItem.unit_price,

              amount:
                deliveryItem.amount,

              sort_order: index,
            };
          }
        );

        /*
         * ベースアップ支援金
         *
         * 136円 × 対象数量を、通常明細と同じ請求明細行として扱う。
         */
        const baseUpSupportQuantity =
          orderItems.reduce((total, orderItem) => {
            if (!orderItem.base_up_support_target) {
              return total;
            }

            return total + (orderItem.quantity ?? 1);
          }, 0);

        const baseUpSupportAmount = new Prisma.Decimal(
          BASE_UP_SUPPORT_AMOUNT_PER_ITEM
        ).mul(baseUpSupportQuantity);

        if (baseUpSupportQuantity > 0) {
          const lastDelivery =
            deliveries[deliveries.length - 1];

          invoiceItemRows.push({
            delivery_id: lastDelivery.id,
            order_item_id: null,
            delivery_date: lastDelivery.delivery_date,
            patient_name: "",
            work_name: "BUS",
            tooth_display: null,
            tooth_snapshot: null,
            material_usage_text: null,
            quantity: baseUpSupportQuantity,
            unit_price: new Prisma.Decimal(
              BASE_UP_SUPPORT_AMOUNT_PER_ITEM
            ),
            amount: baseUpSupportAmount,
            sort_order: invoiceItemRows.length,
          });
        }

        /*
         * --------------------------------------------------
         * 金額集計
         * --------------------------------------------------
         */
        const subtotal =
          invoiceItemRows.reduce(
            (total, item) =>
              total.add(item.amount),
            new Prisma.Decimal(0)
          );

        const taxAmount = subtotal
          .mul(taxRate)
          .div(100)
          .toDecimalPlaces(
            0,
            Prisma.Decimal.ROUND_HALF_UP
          );

        const totalAmount = subtotal
          .add(taxAmount);

        /*
         * --------------------------------------------------
         * 請求番号
         * --------------------------------------------------
         */
        const existingInvoiceRows =
          await transaction.invoices.findMany({
            where: {
              invoice_date: invoiceDate,

              invoice_no: {
                startsWith: `INV-${formatDate(
                  invoiceDate
                )}-`,
              },
            },

            select: {
              invoice_no: true,
            },
          });

        const nextInvoiceNo =
          createNextInvoiceNo(
            invoiceDate,
            existingInvoiceRows.flatMap(
              (row) =>
                row.invoice_no
                  ? [row.invoice_no]
                  : []
            )
          );

        /*
         * --------------------------------------------------
         * invoices 作成
         * --------------------------------------------------
         */
        const createdInvoice =
          await transaction.invoices.create({
            data: {
              invoice_no: nextInvoiceNo,

              /*
               * 表面表示用番号は今後別管理できるよう
               * 現時点では内部番号と同じ値で開始。
               */
              display_invoice_no:
                nextInvoiceNo,

              customer_id: customerId,

              period_start: periodStart,
              period_end: periodEnd,

              closing_date: periodEnd,
              invoice_date: invoiceDate,

              subtotal,

              tax_rate: taxRate,

              tax_amount: taxAmount,

              base_up_support_amount:
                baseUpSupportAmount,

              total_amount: totalAmount,

              paid: false,
            },
          });

        /*
         * --------------------------------------------------
         * invoice_deliveries
         * --------------------------------------------------
         */
        await transaction.invoice_deliveries.createMany(
          {
            data: deliveries.map((delivery) => ({
              invoice_id: createdInvoice.id,
              delivery_id: delivery.id,
            })),
          }
        );

        /*
         * --------------------------------------------------
         * invoice_items
         * --------------------------------------------------
         */
        await transaction.invoice_items.createMany({
          data: invoiceItemRows.map((item) => ({
            invoice_id: createdInvoice.id,

            delivery_id: item.delivery_id,

            order_item_id:
              item.order_item_id,

            delivery_date:
              item.delivery_date,

            patient_name:
              item.patient_name,

            work_name:
              item.work_name,

            tooth_display:
              item.tooth_display,

            tooth_snapshot:
              item.tooth_snapshot ?? Prisma.JsonNull,

            material_usage_text:
              item.material_usage_text,

            quantity:
              item.quantity,

            unit_price:
              item.unit_price,

            amount:
              item.amount,

            sort_order:
              item.sort_order,
          })),
        });

        return {
          id: createdInvoice.id,

          invoice_no:
            createdInvoice.invoice_no,

          display_invoice_no:
            createdInvoice.display_invoice_no,

          customer_id:
            createdInvoice.customer_id,

          customer_name:
            customer.name,

          period_start:
            createdInvoice.period_start,

          period_end:
            createdInvoice.period_end,

          invoice_date:
            createdInvoice.invoice_date,

          subtotal:
            createdInvoice.subtotal,

          tax_rate:
            createdInvoice.tax_rate,

          tax_amount:
            createdInvoice.tax_amount,

          base_up_support_amount:
            createdInvoice.base_up_support_amount,

          total_amount:
            createdInvoice.total_amount,

          delivery_count:
            deliveries.length,

          item_count:
            invoiceItemRows.length,
        };
      },
      {
        isolationLevel: "Serializable",
      }
    );

    return NextResponse.json(
      invoice,
      {
        status: 201,
      }
    );
  } catch (error) {
    if (error instanceof InvoiceRequestError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: error.status,
        }
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error: "Invalid JSON body",
        },
        {
          status: 400,
        }
      );
    }

    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2003", "P2034"].includes(
        error.code
      )
    ) {
      if (error.code === "P2002") {
        return NextResponse.json(
          {
            error:
              "請求対象の納品書がすでに別の請求書へ登録されています。画面を更新してください。",
          },
          {
            status: 409,
          }
        );
      }

      return NextResponse.json(
        {
          error:
            "請求書作成中にデータ競合が発生しました",
        },
        {
          status: 409,
        }
      );
    }

    console.error(
      "POST /api/invoices failed",
      error
    );

    return NextResponse.json(
      {
        error: "Database Error",
      },
      {
        status: 500,
      }
    );
  }
}
