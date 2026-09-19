ALTER TABLE "orders"
ADD COLUMN "deleted_at" TIMESTAMP(6),
ADD COLUMN "deleted_by" INTEGER;

CREATE INDEX "orders_deleted_at_idx" ON "orders"("deleted_at");

CREATE INDEX "orders_deleted_by_idx" ON "orders"("deleted_by");

ALTER TABLE "orders"
ADD CONSTRAINT "orders_deleted_by_fkey"
FOREIGN KEY ("deleted_by")
REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE NO ACTION;
