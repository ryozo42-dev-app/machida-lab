import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AutoInvoiceTaxRateMismatchError } from "./auto-invoice-errors";
import { generateNextInvoiceNo } from "./invoice-number";
import { buildAutoInvoiceSnapshot } from "./invoice-snapshot";

class AutoInvoiceCreateSkip extends Error {
  constructor(
    message: string,
    readonly status: "already_issued" | "no_deliveries"
  ) {
    super(message);
  }
}

type CreateAutoInvoiceForCustomerInput = {
  customerId: number;
  periodStart: Date;
  periodEnd: Date;
  invoiceDate: Date;
};

type CreateAutoInvoiceIssuedResult = {
  status: "issued";
  invoiceId: number;
  invoiceNo: string;
  displayInvoiceNo: string;
  customerId: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  invoiceDate: Date | null;
  deliveryCount: number;
  itemCount: number;
};

type CreateAutoInvoiceSkipResult = {
  status: "already_issued" | "no_deliveries";
  customerId: number;
  periodStart: Date;
  periodEnd: Date;
  invoiceDate: Date;
  reason: string;
};

export type CreateAutoInvoiceForCustomerResult =
  | CreateAutoInvoiceIssuedResult
  | CreateAutoInvoiceSkipResult;

export async function createAutoInvoiceForCustomer({
  customerId,
  periodStart,
  periodEnd,
  invoiceDate,
}: CreateAutoInvoiceForCustomerInput): Promise<CreateAutoInvoiceForCustomerResult> {
  try {
    return await prisma.$transaction(
      async (transaction) => {
        const customer = await transaction.customers.findUnique({
          where: {
            id: customerId,
          },
          select: {
            id: true,
            name: true,
          },
        });

        if (!customer) {
          throw new Error("歯科医院が存在しません");
        }

        const existingInvoice =
          await transaction.invoices.findFirst({
            where: {
              customer_id: customerId,
              period_start: periodStart,
              period_end: periodEnd,
            },
            select: {
              id: true,
              display_invoice_no: true,
              invoice_no: true,
            },
          });

        if (existingInvoice) {
          throw new AutoInvoiceCreateSkip(
            existingInvoice.display_invoice_no ??
              existingInvoice.invoice_no ??
              `invoice_id=${existingInvoice.id}`,
            "already_issued"
          );
        }

        const alreadyInvoicedRows =
          await transaction.invoice_deliveries.findMany({
            select: {
              delivery_id: true,
            },
          });
        const alreadyInvoicedDeliveryIds =
          alreadyInvoicedRows.map((row) => row.delivery_id);

        const deliveries = await transaction.deliveries.findMany({
          where: {
            customer_id: customerId,
            delivery_date: {
              gte: periodStart,
              lte: periodEnd,
            },
            ...(alreadyInvoicedDeliveryIds.length > 0
              ? {
                  id: {
                    notIn: alreadyInvoicedDeliveryIds,
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
          throw new AutoInvoiceCreateSkip(
            "請求対象となる未請求の納品書がありません",
            "no_deliveries"
          );
        }

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
          throw new AutoInvoiceTaxRateMismatchError(
            "請求対象に異なる税率の納品書が含まれています"
          );
        }

        const taxRate = new Prisma.Decimal(taxRateStrings[0]);
        const deliveryItems = deliveries.flatMap((delivery) =>
          delivery.delivery_items.map((item) => ({
            ...item,
            delivery_id: delivery.id,
            delivery_date: delivery.delivery_date,
          }))
        );
        const orderItemIds = deliveryItems.map(
          (item) => item.order_item_id
        );

        const orderItems = await transaction.order_items.findMany({
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
          throw new Error("請求対象の受注明細が存在しません");
        }

        const orderIds = [
          ...new Set(orderItems.map((item) => item.order_id)),
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
        const patientIds = [
          ...new Set(orders.map((order) => order.patient_id)),
        ];
        const patients = await transaction.patients.findMany({
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
        const orderTeeth = await transaction.order_teeth.findMany({
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
            depositMaterials.map((row) => row.material_id)
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

        const {
          invoiceItems,
          subtotal,
          taxAmount,
          totalAmount,
          baseUpSupportAmount,
        } = buildAutoInvoiceSnapshot({
          customerId,
          taxRate,
          deliveries,
          orderItems,
          orders,
          patients,
          orderTeeth,
          insuranceItems,
          privateItems,
          materialTransactions,
          depositMaterials,
          materials,
        });

        const nextInvoiceNo = await generateNextInvoiceNo(
          transaction,
          invoiceDate
        );
        const displayInvoiceNo = nextInvoiceNo;
        const createdInvoice =
          await transaction.invoices.create({
            data: {
              invoice_no: nextInvoiceNo,
              display_invoice_no: displayInvoiceNo,
              customer_id: customerId,
              period_start: periodStart,
              period_end: periodEnd,
              closing_date: periodEnd,
              invoice_date: invoiceDate,
              subtotal,
              tax_rate: taxRate,
              tax_amount: taxAmount,
              base_up_support_amount: baseUpSupportAmount,
              total_amount: totalAmount,
              paid: false,
              issue_source: "auto",
              auto_issued_at: new Date(),
            },
          });

        await transaction.invoice_deliveries.createMany({
          data: deliveries.map((delivery) => ({
            invoice_id: createdInvoice.id,
            delivery_id: delivery.id,
          })),
        });

        await transaction.invoice_items.createMany({
          data: invoiceItems.map((item) => ({
            invoice_id: createdInvoice.id,
            delivery_id: item.delivery_id,
            order_item_id: item.order_item_id,
            delivery_date: item.delivery_date,
            patient_name: item.patient_name,
            work_name: item.work_name,
            tooth_display: item.tooth_display,
            tooth_snapshot: item.tooth_snapshot ?? Prisma.JsonNull,
            material_usage_text: item.material_usage_text,
            quantity: item.quantity,
            unit_price: item.unit_price,
            amount: item.amount,
            sort_order: item.sort_order,
          })),
        });

        return {
          status: "issued",
          invoiceId: createdInvoice.id,
          invoiceNo: createdInvoice.invoice_no ?? "",
          displayInvoiceNo:
            createdInvoice.display_invoice_no ?? "",
          customerId: createdInvoice.customer_id,
          periodStart: createdInvoice.period_start,
          periodEnd: createdInvoice.period_end,
          invoiceDate: createdInvoice.invoice_date,
          deliveryCount: deliveries.length,
          itemCount: invoiceItems.length,
        };
      },
      {
        isolationLevel: "Serializable",
      }
    );
  } catch (error) {
    if (error instanceof AutoInvoiceCreateSkip) {
      return {
        status: error.status,
        customerId,
        periodStart,
        periodEnd,
        invoiceDate,
        reason: error.message,
      };
    }

    throw error;
  }
}
