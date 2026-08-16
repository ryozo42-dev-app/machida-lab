-- Add billing and delivery-note settings to customers
ALTER TABLE "customers"
ADD COLUMN "billing_closing_day" INTEGER,
ADD COLUMN "billing_closing_month_end" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "billing_issue_day" INTEGER,
ADD COLUMN "show_material_on_delivery" BOOLEAN NOT NULL DEFAULT false;
