ALTER TABLE "order_items"
ADD COLUMN "private_item_master_id" INTEGER;

ALTER TABLE "order_items"
ADD CONSTRAINT "fk_order_items_private_item_master"
FOREIGN KEY ("private_item_master_id")
REFERENCES "private_item_masters"("id")
ON DELETE NO ACTION
ON UPDATE NO ACTION;
