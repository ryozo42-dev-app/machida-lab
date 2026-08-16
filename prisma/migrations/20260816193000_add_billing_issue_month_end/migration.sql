-- Add month-end option for billing issue date
ALTER TABLE "customers"
ADD COLUMN "billing_issue_month_end" BOOLEAN NOT NULL DEFAULT false;
