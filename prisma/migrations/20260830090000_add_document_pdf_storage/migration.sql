ALTER TABLE "invoices"
ADD COLUMN "pdf_path" TEXT,
ADD COLUMN "pdf_filename" TEXT,
ADD COLUMN "pdf_saved_at" TIMESTAMP(6);

ALTER TABLE "deliveries"
ADD COLUMN "pdf_path" TEXT,
ADD COLUMN "pdf_filename" TEXT,
ADD COLUMN "pdf_saved_at" TIMESTAMP(6);
