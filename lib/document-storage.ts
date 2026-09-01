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
    relativePath: path.join(
      kind,
      safeCustomerName,
      safeYear,
      safeFileName
    ),
  };
}

const legacyDocumentStorageRoot = path.resolve(
  "/opt/machida-lab"
);

function isPathInsideDirectory(filePath: string, directory: string) {
  const relativePath = path.relative(directory, filePath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") &&
      !path.isAbsolute(relativePath))
  );
}

function resolveStorageRelativePath(relativePath: string) {
  const storageRoot = path.resolve(getDocumentStorageRoot());
  const normalizedRelativePath = path.normalize(relativePath);

  if (
    path.isAbsolute(normalizedRelativePath) ||
    normalizedRelativePath === ".." ||
    normalizedRelativePath.startsWith(`..${path.sep}`)
  ) {
    return null;
  }

  const resolvedPath = path.resolve(
    storageRoot,
    normalizedRelativePath
  );

  return isPathInsideDirectory(resolvedPath, storageRoot)
    ? resolvedPath
    : null;
}

function extractLegacyDocumentRelativePath(filePath: string) {
  const resolvedPath = path.resolve(filePath);

  if (
    !isPathInsideDirectory(resolvedPath, legacyDocumentStorageRoot)
  ) {
    return null;
  }

  const relativePath = path.relative(
    legacyDocumentStorageRoot,
    resolvedPath
  );
  const firstSegment = relativePath.split(path.sep)[0];

  if (firstSegment !== "invoices" && firstSegment !== "deliveries") {
    return null;
  }

  return relativePath;
}

function createReadPathCandidates(filePath: string) {
  const candidates = [];
  const storageRoot = path.resolve(getDocumentStorageRoot());

  if (path.isAbsolute(filePath)) {
    const resolvedPath = path.resolve(filePath);

    if (
      isPathInsideDirectory(resolvedPath, storageRoot) ||
      extractLegacyDocumentRelativePath(resolvedPath)
    ) {
      candidates.push(resolvedPath);
    }

    const legacyRelativePath =
      extractLegacyDocumentRelativePath(resolvedPath);
    const fallbackPath = legacyRelativePath
      ? resolveStorageRelativePath(legacyRelativePath)
      : null;

    if (fallbackPath) {
      candidates.push(fallbackPath);
    }
  } else {
    const resolvedPath = resolveStorageRelativePath(filePath);

    if (resolvedPath) {
      candidates.push(resolvedPath);
    }
  }

  return [...new Set(candidates)];
}

export async function readPdfIfExists(
  filePath: string | null | undefined
) {
  if (!filePath) {
    return null;
  }

  for (const candidate of createReadPathCandidates(filePath)) {
    try {
      return await fs.readFile(candidate);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }

      throw error;
    }
  }

  return null;
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
