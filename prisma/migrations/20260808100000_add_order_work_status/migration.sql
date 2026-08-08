ALTER TABLE "orders"
ADD COLUMN "work_status" VARCHAR(20) NOT NULL DEFAULT 'pending';

ALTER TABLE "orders"
ADD CONSTRAINT "orders_work_status_check"
CHECK ("work_status" IN ('pending', 'in_progress', 'completed'));