-- Baseline the existing database. This migration is recorded as applied only.
CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "customer_insurance_prices" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "insurance_item_id" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_insurance_prices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_private_prices" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "private_item_id" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_private_prices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deliveries" (
    "id" SERIAL NOT NULL,
    "delivery_no" VARCHAR(50),
    "customer_id" INTEGER NOT NULL,
    "delivery_date" DATE NOT NULL,
    "total_amount" DECIMAL(12,2),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "insurance_items" (
    "id" SERIAL NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "item_name" VARCHAR(200) NOT NULL,
    "material" VARCHAR(100),
    "points" DECIMAL(10,2),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "sub_type" VARCHAR(200),
    CONSTRAINT "insurance_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "invoice_no" VARCHAR(50),
    "customer_id" INTEGER NOT NULL,
    "closing_date" DATE,
    "invoice_date" DATE,
    "subtotal" DECIMAL(12,2),
    "tax_rate" DECIMAL(5,2),
    "tax_amount" DECIMAL(12,2),
    "total_amount" DECIMAL(12,2),
    "paid" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_files" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "file_name" VARCHAR(255),
    "file_path" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_items" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "insurance_item_id" INTEGER,
    "private_item_id" INTEGER,
    "quantity" INTEGER DEFAULT 1,
    "unit_price" DECIMAL(10,2),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_teeth" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "tooth_no" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_teeth_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
    "id" SERIAL NOT NULL,
    "order_no" VARCHAR(50),
    "customer_id" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "order_date" DATE NOT NULL,
    "delivery_date" DATE,
    "insurance_type" VARCHAR(20),
    "remarks" TEXT,
    "billed" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "patients" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "patient_name" VARCHAR(100) NOT NULL,
    "patient_kana" VARCHAR(100),
    "gender" VARCHAR(10),
    "birthday" DATE,
    "memo" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "private_items" (
    "id" SERIAL NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "item_name" VARCHAR(200) NOT NULL,
    "material" VARCHAR(100),
    "standard_price" DECIMAL(10,2),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "sub_type" VARCHAR(200),
    CONSTRAINT "private_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "login_id" VARCHAR(100),
    "user_name" VARCHAR(100),
    "password_hash" TEXT,
    "role" VARCHAR(20),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");
CREATE UNIQUE INDEX "users_login_id_key" ON "users"("login_id");