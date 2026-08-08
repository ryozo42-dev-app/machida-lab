CREATE TABLE "delivery_items" (
    "id" SERIAL NOT NULL,
    "delivery_id" INTEGER NOT NULL,
    "order_item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_items_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "delivery_items_unit_price_check" CHECK ("unit_price" >= 0),
    CONSTRAINT "delivery_items_amount_check" CHECK ("amount" >= 0),
    CONSTRAINT "delivery_items_amount_calculation_check" CHECK ("amount" = "quantity" * "unit_price")
);

CREATE UNIQUE INDEX "delivery_items_delivery_id_order_item_id_key"
ON "delivery_items"("delivery_id", "order_item_id");

ALTER TABLE "delivery_items"
ADD CONSTRAINT "delivery_items_delivery_id_fkey"
FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "delivery_items"
ADD CONSTRAINT "delivery_items_order_item_id_fkey"
FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;