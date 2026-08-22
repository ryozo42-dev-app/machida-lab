import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const MAX_PDF_SIZE = 10 * 1024 * 1024;

const orderFilesDirectory = path.join(
  process.cwd(),
  "storage",
  "order-files"
);

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

function parseOptionalPositiveDecimal(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Number(parsed.toFixed(2));
}

function parseBoolean(value: unknown, defaultValue = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true" || normalized === "1") {
      return true;
    }

    if (normalized === "false" || normalized === "0" || normalized === "") {
      return false;
    }
  }

  return defaultValue;
}

function formatOrderNoDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

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

    work_name: String(
      formData.get("work_name") ?? ""
    ),

    base_up_support_target: parseBoolean(
      formData.get("base_up_support_target"),
      false
    ),

    price: formData.get("price"),

    quantity: formData.get("quantity"),

    tooth_numbers: formData
      .getAll("tooth_numbers")
      .map(String),

    /*
     * ブリッジ判定
     *
     * FormDataから bridge を受け取る。
     * 未送信の場合は false。
     */
    bridge: parseBoolean(
      formData.get("bridge"),
      false
    ),

    order_date:
      formData.get("order_date") ||
      new Date().toISOString(),

    delivery_date:
      formData.get("delivery_date") ||
      new Date().toISOString(),

    insurance_type: String(
      formData.get("insurance_type") ?? "保険"
    ),

    remarks: String(
      formData.get("remarks") ?? ""
    ),

    pdf:
      pdf instanceof File && pdf.size > 0
        ? pdf
        : null,
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
    console.error("[POST /orders] START body:", JSON.stringify({
      customer_id: body.customer_id,
      patient_id: body.patient_id,
      insurance_item_id: body.insurance_item_id,
      private_item_id: body.private_item_id,
      work_name: body.work_name,
      base_up_support_target: body.base_up_support_target,
      price: body.price,
      quantity: body.quantity,
      tooth_numbers: body.tooth_numbers,
      bridge: body.bridge,
      insurance_type: body.insurance_type,
      delivery_date: body.delivery_date,
      remarks: body.remarks,
    }, null, 2));

    const orderDate = new Date(body.order_date);

    if (Number.isNaN(orderDate.getTime())) {
      console.error("[POST /orders] validation failed: invalid order_date", {
        order_date: body.order_date,
      });

      return NextResponse.json(
        {
          error: "Invalid order_date",
        },
        {
          status: 400,
        }
      );
    }

    const insuranceItemId =
      parseOptionalPositiveInt(
        body.insurance_item_id
      );

    const privateItemId =
      parseOptionalPositiveInt(
        body.private_item_id
      );

    const unitPrice =
      parseOptionalPositiveDecimal(
        body.price
      );

    const quantity =
      parseOptionalPositiveInt(
        body.quantity
      ) ?? 1;

    const rawToothNumbers: unknown[] =
      Array.isArray(body.tooth_numbers)
        ? body.tooth_numbers
        : [];

    const toothNumbers: string[] = [
      ...new Set(
        rawToothNumbers.map((toothNumber) =>
          String(toothNumber)
        )
      ),
    ];

    /*
     * 歯式チェック
     *
     * 上顎・下顎
     * 11〜18
     * 21〜28
     * 31〜38
     * 41〜48
     */
    const validToothNumbers = new Set([
      ...[1, 2, 3, 4].flatMap((quadrant) =>
        Array.from(
          {
            length: 8,
          },
          (_, index) =>
            `${quadrant}${index + 1}`
        )
      ),

      ...[5, 6, 7, 8].flatMap((quadrant) =>
        Array.from(
          {
            length: 5,
          },
          (_, index) =>
            `${quadrant}${index + 1}`
        )
      ),
    ]);

    const pdf =
      body.pdf instanceof File
        ? body.pdf
        : null;

    /*
     * PDFチェック
     */
    if (
      pdf &&
      (
        pdf.type !== "application/pdf" ||
        pdf.size > MAX_PDF_SIZE
      )
    ) {
      return NextResponse.json(
        {
          error: "Invalid PDF file",
        },
        {
          status: 400,
        }
      );
    }

    let pdfBuffer: Buffer | null = null;

    let storedFileName: string | null = null;

    if (pdf) {
      pdfBuffer = Buffer.from(
        await pdf.arrayBuffer()
      );

      /*
       * PDFヘッダー確認
       */
      if (
        pdfBuffer
          .subarray(0, 5)
          .toString("ascii") !== "%PDF-"
      ) {
        return NextResponse.json(
          {
            error: "Invalid PDF file",
          },
          {
            status: 400,
          }
        );
      }

      storedFileName = `${randomUUID()}.pdf`;

      temporaryFilePath = path.join(
        orderFilesDirectory,
        `${storedFileName}.tmp`
      );

      savedFilePath = path.join(
        orderFilesDirectory,
        storedFileName
      );

      await mkdir(
        orderFilesDirectory,
        {
          recursive: true,
        }
      );

      await writeFile(
        temporaryFilePath,
        pdfBuffer,
        {
          flag: "wx",
        }
      );
    }

    /*
     * 保険 / 自費
     *
     * 必ずどちらか一方だけ。
     */
    const hasInsuranceItem =
      insuranceItemId !== null;

    const hasPrivateItem =
      privateItemId !== null;

    if (
      hasInsuranceItem ===
      hasPrivateItem
    ) {
      return NextResponse.json(
        {
          error:
            "Exactly one of insurance_item_id or private_item_id must be specified",
        },
        {
          status: 400,
        }
      );
    }

    const selectedInsuranceType =
      hasInsuranceItem
        ? "保険"
        : "自費";

    const workName =
      typeof body.work_name === "string"
        ? body.work_name.trim()
        : "";

    /*
     * insurance_type確認
     */
    if (
      body.insurance_type !== undefined &&
      body.insurance_type !== null &&
      String(body.insurance_type)
        .trim()
        .length > 0 &&
      String(body.insurance_type) !==
        selectedInsuranceType
    ) {
      return NextResponse.json(
        {
          error:
            "insurance_type does not match selected work item type",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * 歯式確認
     */
    if (
      toothNumbers.some(
        (toothNumber) =>
          !validToothNumbers.has(
            toothNumber
          )
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid tooth_numbers",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * 保険項目存在確認
     */
    if (hasInsuranceItem) {
      const [insuranceItem] =
        await prisma.$queryRaw<Array<{ id: number }>>`
          SELECT id
          FROM insurance_item_masters
          WHERE id = ${insuranceItemId}
          LIMIT 1
        `;

      if (!insuranceItem) {
        return NextResponse.json(
          {
            error:
              "Invalid insurance_item_id",
          },
          {
            status: 400,
          }
        );
      }
    }

    /*
     * 自費項目存在確認
     */
    if (hasPrivateItem) {
      const privateItem =
        await prisma.private_items.findUnique(
          {
            where: {
              id: privateItemId!,
            },

            select: {
              id: true,
            },
          }
        );

      if (!privateItem) {
        return NextResponse.json(
          {
            error:
              "Invalid private_item_id",
          },
          {
            status: 400,
          }
        );
      }
    }

    /*
     * ==========================================
     * DB TRANSACTION
     * ==========================================
     */
    const order =
      await prisma.$transaction(
        async (transaction) => {
          try {
            console.error("[POST /orders] transaction step: start");

            /*
             * 受注番号
             */
            const orderNoDate =
              formatOrderNoDate(
                orderDate
              );

            const orderNoPrefix =
              `ORD-${orderNoDate}-`;

            console.error("[POST /orders] transaction step: ordering no generation", {
              orderNoDate,
              orderNoPrefix,
            });

            const [sequenceRow] =
              await transaction.$queryRaw<
                Array<{
                  max_seq: number;
                }>
              >`
                SELECT
                  COALESCE(
                    MAX(
                      CAST(
                        RIGHT(order_no, 3)
                        AS INTEGER
                      )
                    ),
                    0
                  ) AS max_seq
                FROM orders
                WHERE order_no LIKE ${`${orderNoPrefix}%`}
              `;

            const nextSequence =
              (sequenceRow?.max_seq ?? 0) + 1;

            const orderNo =
              `${orderNoPrefix}${String(
                nextSequence
              ).padStart(3, "0")}`;

            console.error("[POST /orders] transaction step: generated order_no", { orderNo, nextSequence });

            /*
             * orders
             */
            console.error("[POST /orders] transaction step: orders.create() start", {
              customer_id: body.customer_id,
              patient_id: body.patient_id,
              order_no: orderNo,
            });

            const createdOrder =
              await transaction.orders.create({
                data: {
                  order_no: orderNo,

                  customer_id:
                    body.customer_id,

                  patient_id:
                    body.patient_id,

                  order_date:
                    orderDate,

                  delivery_date:
                    body.delivery_date
                      ? new Date(
                          body.delivery_date
                        )
                      : null,

                  insurance_type:
                    selectedInsuranceType,

                  remarks:
                    body.remarks,
                },
              });

            console.error("[POST /orders] transaction step: orders.create() success", { createdOrderId: createdOrder.id });

          /*
           * ======================================
           * 医院別保険価格
           * ======================================
           *
           * ★ここを修正
           *
           * insurance_item_masters_id
           *       ↓
           * insurance_item_id
           *
           * schema.prisma / DB と一致させる。
           */
          if (
            hasInsuranceItem &&
            unitPrice !== null
          ) {
            const existingCustomerPrice =
              await transaction.$queryRaw<
                Array<{
                  exists: boolean;
                }>
              >`
                SELECT EXISTS (
                  SELECT 1
                  FROM customer_insurance_prices
                  WHERE
                    customer_id =
                      ${body.customer_id}
                    AND
                    insurance_item_id =
                      ${insuranceItemId}
                ) AS exists
              `;

            if (
              !existingCustomerPrice[0]
                ?.exists
            ) {
              console.error("[POST /orders] transaction step: customer_insurance_prices insert start", {
                customer_id: body.customer_id,
                insurance_item_id: insuranceItemId,
                price: unitPrice,
              });

              await transaction.$executeRaw`
                INSERT INTO
                  customer_insurance_prices
                  (
                    customer_id,
                    insurance_item_id,
                    price
                  )
                VALUES
                  (
                    ${body.customer_id},
                    ${insuranceItemId},
                    ${unitPrice}
                  )
              `;

              console.error("[POST /orders] transaction step: customer_insurance_prices insert success");
            } else {
              console.error("[POST /orders] transaction step: customer_insurance_prices already exists", {
                customer_id: body.customer_id,
                insurance_item_id: insuranceItemId,
              });
            }
          }

          /*
           * order_items
           */
          console.error("[POST /orders] transaction step: order_items.create() start", {
            order_id: createdOrder.id,
            insurance_item_id: hasInsuranceItem ? insuranceItemId : null,
            private_item_id: hasPrivateItem ? privateItemId : null,
            quantity,
            unit_price: unitPrice ?? undefined,
          });

          await transaction.order_items.create(
            {
              data: {
                order_id:
                  createdOrder.id,

                insurance_item_id:
                  hasInsuranceItem
                    ? insuranceItemId
                    : null,

                private_item_id:
                  hasPrivateItem
                    ? privateItemId
                    : null,

                work_name:
                  workName.length > 0
                    ? workName
                    : null,

                base_up_support_target:
                  parseBoolean(
                    body.base_up_support_target,
                    false
                  ),

                quantity,

                unit_price:
                  unitPrice ??
                  undefined,
              },
            }
          );

          console.error("[POST /orders] transaction step: order_items.create() success");

          /*
           * ======================================
           * order_teeth
           * ======================================
           *
           * ★ブリッジ状態も保存
           *
           * bridge = true
           *       ↓
           * is_bridge = true
           *
           * bridge = false
           *       ↓
           * is_bridge = false
           */
          if (
            toothNumbers.length > 0
          ) {
            console.error("[POST /orders] transaction step: order_teeth.createMany() start", {
              order_id: createdOrder.id,
              toothNumbers,
              bridge: parseBoolean(body.bridge, false),
            });

            await transaction.order_teeth.createMany(
              {
                data:
                  toothNumbers.map(
                    (toothNumber) => ({
                      order_id:
                        createdOrder.id,

                      tooth_no:
                        toothNumber,

                      is_bridge:
                        parseBoolean(
                          body.bridge,
                          false
                        ),
                    })
                  ),
              }
            );

            console.error("[POST /orders] transaction step: order_teeth.createMany() success");
          }

          /*
           * ======================================
           * PDF
           * ======================================
           */
          if (
            pdf &&
            storedFileName &&
            temporaryFilePath &&
            savedFilePath
          ) {
            console.error("[POST /orders] transaction step: order_files.create() start", {
              order_id: createdOrder.id,
              file_name: pdf.name,
              storedFileName,
            });

            await rename(
              temporaryFilePath,
              savedFilePath
            );

            temporaryFilePath = null;

            await transaction.order_files.create(
              {
                data: {
                  order_id:
                    createdOrder.id,

                  file_name:
                    pdf.name,

                  file_path:
                    path.posix.join(
                      "storage",
                      "order-files",
                      storedFileName
                    ),
                },
              }
            );

            console.error("[POST /orders] transaction step: order_files.create() success");
          }

          console.error("[POST /orders] transaction step: complete");
          return createdOrder;
        } catch (transactionError) {
          console.error("[POST /orders] transaction step: FAILED with exact error object:", transactionError);
          console.error("[POST /orders] transaction step: FAILED error stack:", transactionError instanceof Error ? transactionError.stack : undefined);
          throw transactionError;
        }
      }
      );

    return NextResponse.json(
      order
    );
  } catch (error) {
    const maybePrismaError =
      error && typeof error === "object"
        ? (error as {
            code?: string;
            meta?: unknown;
            name?: string;
            message?: string;
            stack?: string;
          })
        : null;

    console.error(
      "========== ORDER POST ERROR =========="
    );
    console.error("[POST /orders] full error object:", error);
    console.error("[POST /orders] error is Error:", error instanceof Error);
    console.error("[POST /orders] error name:", error instanceof Error ? error.name : maybePrismaError?.name ?? "unknown");
    console.error("[POST /orders] error message:", error instanceof Error ? error.message : maybePrismaError?.message ?? String(error));
    console.error("[POST /orders] error stack:", error instanceof Error ? error.stack : maybePrismaError?.stack ?? undefined);
    console.error("[POST /orders] error JSON:", JSON.stringify(error, Object.getOwnPropertyNames(error as object), 2));

    if (maybePrismaError && ("code" in maybePrismaError || "meta" in maybePrismaError)) {
      console.error("[POST /orders] Prisma error code:", maybePrismaError.code);
      console.error("[POST /orders] Prisma error meta:", maybePrismaError.meta);
    }

    if (maybePrismaError && maybePrismaError.name) {
      console.error("[POST /orders] Prisma error name:", maybePrismaError.name);
    }

    const errorMessage =
      error instanceof Error
        ? error.message
        : maybePrismaError?.message ?? String(error);

    console.error(
      "ERROR MESSAGE:",
      errorMessage
    );
    console.error(
      "======================================"
    );

    /*
     * PDF cleanup
     */
    await Promise.all(
      [
        temporaryFilePath,
        savedFilePath,
      ]
        .filter(
          (
            filePath
          ): filePath is string =>
            filePath !== null
        )
        .map(
          (filePath) =>
            rm(
              filePath,
              {
                force: true,
              }
            ).catch(
              (cleanupError) => {
                console.error(
                  "Failed to clean up order PDF",
                  cleanupError
                );
              }
            )
        )
    );

    return NextResponse.json(
      {
        error:
          "Order registration failed",
      },
      {
        status: 500,
      }
    );
  }
}