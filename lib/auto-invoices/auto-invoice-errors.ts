import { Prisma } from "@/lib/generated/prisma/client";

export type AutoInvoiceFailureStatus =
  | "already_invoiced_conflict"
  | "relation_conflict"
  | "transaction_conflict"
  | "tax_rate_mismatch"
  | "unexpected_error";

export type AutoInvoiceErrorSummary = {
  status: AutoInvoiceFailureStatus;
  prismaCode: string | null;
  message: string;
};

export class AutoInvoiceTaxRateMismatchError extends Error {
  readonly status = "tax_rate_mismatch";
}

export function classifyAutoInvoiceError(
  error: unknown
): AutoInvoiceErrorSummary {
  if (error instanceof AutoInvoiceTaxRateMismatchError) {
    return {
      status: error.status,
      prismaCode: null,
      message: error.message,
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return {
        status: "already_invoiced_conflict",
        prismaCode: error.code,
        message:
          "請求対象の納品書がすでに別の請求書へ登録されています",
      };
    }

    if (error.code === "P2003") {
      return {
        status: "relation_conflict",
        prismaCode: error.code,
        message: "請求書作成中に関連データの不整合が発生しました",
      };
    }

    if (error.code === "P2034") {
      return {
        status: "transaction_conflict",
        prismaCode: error.code,
        message: "請求書作成中にデータ競合が発生しました",
      };
    }
  }

  return {
    status: "unexpected_error",
    prismaCode: null,
    message:
      error instanceof Error
        ? error.message
        : "予期しないエラーが発生しました",
  };
}
