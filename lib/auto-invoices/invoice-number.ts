type InvoiceNumberTransactionClient = {
  invoices: {
    findMany: (args: {
      where: {
        invoice_date: Date;
        invoice_no: {
          startsWith: string;
        };
      };
      select: {
        invoice_no: true;
      };
    }) => Promise<Array<{ invoice_no: string | null }>>;
  };
};

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

export async function generateNextInvoiceNo(
  transaction: InvoiceNumberTransactionClient,
  invoiceDate: Date
) {
  const prefix = `INV-${formatDate(invoiceDate)}-`;
  const existingInvoiceRows =
    await transaction.invoices.findMany({
      where: {
        invoice_date: invoiceDate,
        invoice_no: {
          startsWith: prefix,
        },
      },
      select: {
        invoice_no: true,
      },
    });

  return createNextInvoiceNo(
    invoiceDate,
    existingInvoiceRows.flatMap((row) =>
      row.invoice_no ? [row.invoice_no] : []
    )
  );
}
