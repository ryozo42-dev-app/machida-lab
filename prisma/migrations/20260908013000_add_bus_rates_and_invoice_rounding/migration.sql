CREATE TABLE "base_up_support_rates" (
    "id" SERIAL NOT NULL,
    "amount" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "base_up_support_rates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "base_up_support_rates_amount_check" CHECK ("amount" >= 0)
);

CREATE UNIQUE INDEX "uq_base_up_support_rates_effective_from"
ON "base_up_support_rates"("effective_from");

ALTER TABLE "customers"
ADD COLUMN "invoice_rounding_unit" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "customers"
ADD CONSTRAINT "chk_customers_invoice_rounding_unit"
CHECK ("invoice_rounding_unit" IN (0, 10, 100));
