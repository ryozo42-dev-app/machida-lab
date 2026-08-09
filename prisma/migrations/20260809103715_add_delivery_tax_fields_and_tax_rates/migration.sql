-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "tax_amount" DECIMAL(12,2),
ADD COLUMN     "tax_rate" DECIMAL(5,2),
ADD COLUMN     "total_amount_including_tax" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" SERIAL NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_rates_effective_from_idx" ON "tax_rates"("effective_from");
