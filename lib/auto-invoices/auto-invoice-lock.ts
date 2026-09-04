import { Client } from "pg";
import type { Prisma } from "@/lib/generated/prisma/client";

const AUTO_INVOICE_LOCK_KEY_1 = 20260905;
const AUTO_INVOICE_LOCK_KEY_2 = 1;

type AutoInvoiceLockAcquiredResult<T> = {
  status: "acquired";
  result: T;
};

type AutoInvoiceLockAlreadyRunningResult = {
  status: "already_running";
  reason: string;
};

export type AutoInvoiceLockResult<T> =
  | AutoInvoiceLockAcquiredResult<T>
  | AutoInvoiceLockAlreadyRunningResult;

type AdvisoryLockRow = {
  acquired: boolean;
};

type AdvisoryLockStatusRow = {
  locked: boolean;
};

type AutoInvoiceTransactionLockClient = Pick<
  Prisma.TransactionClient,
  "$queryRaw"
>;

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return databaseUrl;
}

async function unlockAutoInvoice(client: Client) {
  await client.query(
    "SELECT pg_advisory_unlock($1, $2)",
    [AUTO_INVOICE_LOCK_KEY_1, AUTO_INVOICE_LOCK_KEY_2]
  );
}

export async function tryAcquireAutoInvoiceTransactionLock(
  transaction: AutoInvoiceTransactionLockClient
) {
  const lockResult = await transaction.$queryRaw<AdvisoryLockRow[]>`
    SELECT pg_try_advisory_xact_lock(${AUTO_INVOICE_LOCK_KEY_1}, ${AUTO_INVOICE_LOCK_KEY_2}) AS acquired
  `;

  return lockResult[0]?.acquired === true;
}

export async function isAutoInvoiceLockHeld() {
  const client = new Client({
    connectionString: getDatabaseUrl(),
  });

  await client.connect();

  try {
    const lockStatusResult =
      await client.query<AdvisoryLockStatusRow>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM pg_locks
            WHERE locktype = 'advisory'
              AND granted = true
              AND database = (
                SELECT oid
                FROM pg_database
                WHERE datname = current_database()
              )
              AND classid = $1::oid
              AND objid = $2::oid
              AND objsubid = 2
          ) AS locked
        `,
        [AUTO_INVOICE_LOCK_KEY_1, AUTO_INVOICE_LOCK_KEY_2]
      );

    return lockStatusResult.rows[0]?.locked === true;
  } finally {
    await client.end();
  }
}

export async function withAutoInvoiceLock<T>(
  callback: () => Promise<T>
): Promise<AutoInvoiceLockResult<T>> {
  const client = new Client({
    connectionString: getDatabaseUrl(),
  });

  let lockAcquired = false;

  await client.connect();

  try {
    const lockResult = await client.query<AdvisoryLockRow>(
      "SELECT pg_try_advisory_lock($1, $2) AS acquired",
      [AUTO_INVOICE_LOCK_KEY_1, AUTO_INVOICE_LOCK_KEY_2]
    );

    if (!lockResult.rows[0]?.acquired) {
      return {
        status: "already_running",
        reason: "別の自動発行処理が実行中です",
      };
    }

    lockAcquired = true;
    const result = await callback();

    return {
      status: "acquired",
      result,
    };
  } finally {
    try {
      if (lockAcquired) {
        await unlockAutoInvoice(client);
      }
    } finally {
      await client.end();
    }
  }
}
