ALTER TABLE "invoices"
ADD COLUMN "issue_source" TEXT,
ADD COLUMN "auto_issued_at" TIMESTAMP(6),
ADD COLUMN "auto_notice_seen_at" TIMESTAMP(6);
