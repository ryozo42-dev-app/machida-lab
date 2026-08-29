import fs from "node:fs/promises";
import path from "node:path";

export type DocumentKind = "invoices" | "deliveries";

type BuildDocumentPathInput = {
  kind: DocumentKind;
  customerName: string;
  fallbackCustomerSegment: string;
  year: string;
  fileName: string;
};

export function getDocumentStorageRoot() {
  return (
    process.env.DOCUMENT_STORAGE_ROOT ||
    path.join(process.cwd(), "storage")
  );
}

export function sanitizePathSegment(
  value: string,
  fallback: string
) {
  const sanitized = value
    .replace(/[\/\\:*?"<>|\x00-\x1F\x7F]/g, "_")
    .trim();

  if (!sanitized || sanitized === "." || sanitized === "..") {
    return fallback;
  }

  return sanitized;
}

export function buildDocumentStoragePath({
  kind,
  customerName,
  fallbackCustomerSegment,
  year,
  fileName,
}: BuildDocumentPathInput) {
  const safeCustomerName = sanitizePathSegment(
    customerName,
    fallbackCustomerSegment
  );
  const safeYear = sanitizePathSegment(year, "unknown-year");
  const safeFileName = sanitizePathSegment(
    fileName,
    `${kind}-${Date.now()}.pdf`
  );

  const directory = path.join(
    getDocumentStorageRoot(),
    kind,
    safeCustomerName,
    safeYear
  );

  return {
    directory,
    fileName: safeFileName,
    filePath: path.join(directory, safeFileName),
  };
}

export async function readPdfIfExists(
  filePath: string | null | undefined
) {
  if (!filePath) {
    return null;
  }

  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

export async function writePdfIfMissing(
  filePath: string,
  pdfBuffer: Uint8Array
) {
  await fs.mkdir(path.dirname(filePath), {
    recursive: true,
  });

  try {
    await fs.writeFile(filePath, pdfBuffer, {
      flag: "wx",
    });

    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      return false;
    }

    throw error;
  }
}
