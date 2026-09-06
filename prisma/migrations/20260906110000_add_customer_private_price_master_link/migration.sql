ALTER TABLE "customer_private_prices"
ADD COLUMN "private_item_master_id" INTEGER;

CREATE UNIQUE INDEX "uq_customer_private_prices_customer_private_item_master"
ON "customer_private_prices"("customer_id", "private_item_master_id");

ALTER TABLE "customer_private_prices"
ADD CONSTRAINT "fk_customer_private_prices_private_item_master"
FOREIGN KEY ("private_item_master_id")
REFERENCES "private_item_masters"("id")
ON DELETE NO ACTION
ON UPDATE NO ACTION;
