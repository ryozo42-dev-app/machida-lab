import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * 手動請求/自動請求のSerializableトランザクション内から利用するための
 * 最小クライアント型（prismaグローバルは使わず、呼び出し元のtransactionを受け取る）。
 */
export type InvoiceEffectiveSettingsClient = Pick<
  Prisma.TransactionClient,
  "taxRate" | "baseUpSupportRate"
>;

export type ApplicableTaxRate = {
  tax_rate: Prisma.Decimal;
  effective_from: Date;
};

export type ApplicableBaseUpSupportRate = {
  amount: number;
  effective_from: Date;
};

/**
 * 指定日に有効な税率を取得する（effective_from <= targetDate の最新1件）。
 * 見つからない場合はnullを返す（業務エラーはthrowしない）。
 */
export async function getApplicableTaxRate(
  transaction: InvoiceEffectiveSettingsClient,
  targetDate: Date
): Promise<ApplicableTaxRate | null> {
  const row = await transaction.taxRate.findFirst({
    where: {
      effective_from: {
        lte: targetDate,
      },
    },
    orderBy: {
      effective_from: "desc",
    },
    select: {
      tax_rate: true,
      effective_from: true,
    },
  });

  return row ?? null;
}

/**
 * 指定日に有効なBUS単価を取得する（effective_from <= targetDate の最新1件）。
 * 見つからない場合はnullを返す（業務エラーはthrowしない）。
 */
export async function getApplicableBaseUpSupportRate(
  transaction: InvoiceEffectiveSettingsClient,
  targetDate: Date
): Promise<ApplicableBaseUpSupportRate | null> {
  const row = await transaction.baseUpSupportRate.findFirst({
    where: {
      effective_from: {
        lte: targetDate,
      },
    },
    orderBy: {
      effective_from: "desc",
    },
    select: {
      amount: true,
      effective_from: true,
    },
  });

  return row ?? null;
}

/**
 * 指定請求期間(periodStart < effective_from <= periodEnd)に存在する
 * TaxRate/BaseUpSupportRateの変更境界日を、重複除去した日付昇順で返す。
 */
export async function getInvoiceEffectiveBoundaryDates(
  transaction: InvoiceEffectiveSettingsClient,
  periodStart: Date,
  periodEnd: Date
): Promise<Date[]> {
  const [taxRates, busRates] = await Promise.all([
    transaction.taxRate.findMany({
      where: {
        effective_from: {
          gt: periodStart,
          lte: periodEnd,
        },
      },
      select: {
        effective_from: true,
      },
    }),
    transaction.baseUpSupportRate.findMany({
      where: {
        effective_from: {
          gt: periodStart,
          lte: periodEnd,
        },
      },
      select: {
        effective_from: true,
      },
    }),
  ]);

  const uniqueTimestamps = new Set<number>();

  for (const row of [...taxRates, ...busRates]) {
    uniqueTimestamps.add(row.effective_from.getTime());
  }

  return [...uniqueTimestamps]
    .sort((first, second) => first - second)
    .map((time) => new Date(time));
}
