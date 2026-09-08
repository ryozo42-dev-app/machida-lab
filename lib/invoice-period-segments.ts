/**
 * 請求期間分割用の純粋関数。
 *
 * DB/Prismaへは一切アクセスしない。日付はすべてUTC正午基準ではなく
 * UTC 00:00:00 の「日付のみ」として扱い、タイムゾーンによるズレを防ぐ
 * （プロジェクト内の既存コード（例: parseDeliveryDate）と同じ
 * `new Date(\`\${value}T00:00:00.000Z\`)` 相当の運用を前提とする）。
 */

export type InvoicePeriodSegment = {
  periodStart: Date;
  periodEnd: Date;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toUtcMidnight(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/**
 * 通常請求期間(periodStart〜periodEnd)を、期間内に存在する
 * BUS/税率のeffective_fromで分割する。
 *
 * - periodStartと同日のeffective_fromは分割を発生させない
 * - periodEndと同日のeffective_fromは有効な境界（末尾1日だけのsegmentになる）
 * - 範囲外(period外)のeffective_fromは無視する
 * - 重複する日付は1つにまとめる
 * - 入力順に依存せず日付昇順で処理する
 */
export function splitInvoicePeriodByEffectiveDates(
  periodStart: Date,
  periodEnd: Date,
  effectiveFromDates: Date[]
): InvoicePeriodSegment[] {
  const normalizedStart = toUtcMidnight(periodStart);
  const normalizedEnd = toUtcMidnight(periodEnd);

  if (normalizedStart.getTime() > normalizedEnd.getTime()) {
    throw new Error("periodStart must not be after periodEnd");
  }

  const boundaryTimestamps = new Set<number>();

  for (const effectiveFrom of effectiveFromDates) {
    const normalized = toUtcMidnight(effectiveFrom);
    const time = normalized.getTime();

    if (time > normalizedStart.getTime() && time <= normalizedEnd.getTime()) {
      boundaryTimestamps.add(time);
    }
  }

  const boundaries = [...boundaryTimestamps]
    .sort((first, second) => first - second)
    .map((time) => new Date(time));

  const segments: InvoicePeriodSegment[] = [];
  let currentStart = normalizedStart;

  for (const boundary of boundaries) {
    segments.push({
      periodStart: currentStart,
      periodEnd: addUtcDays(boundary, -1),
    });

    currentStart = boundary;
  }

  segments.push({
    periodStart: currentStart,
    periodEnd: normalizedEnd,
  });

  return segments;
}
