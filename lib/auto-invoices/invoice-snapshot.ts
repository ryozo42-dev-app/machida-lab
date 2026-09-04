import { Prisma } from "@/lib/generated/prisma/client";

const AUTO_BASE_UP_SUPPORT_AMOUNT_PER_ITEM = 136;

export type AutoInvoiceSnapshotDelivery = {
  id: number;
  delivery_date: Date;
  delivery_items: AutoInvoiceSnapshotDeliveryItem[];
};

export type AutoInvoiceSnapshotDeliveryItem = {
  order_item_id: number;
  quantity: number;
  unit_price: Prisma.Decimal;
  amount: Prisma.Decimal;
};

export type AutoInvoiceSnapshotOrderItem = {
  id: number;
  order_id: number;
  insurance_item_id: number | null;
  private_item_id: number | null;
  work_name: string | null;
  base_up_support_target: boolean;
  quantity: number | null;
};

export type AutoInvoiceSnapshotOrder = {
  id: number;
  patient_id: number;
  customer_id: number;
};

export type AutoInvoiceSnapshotPatient = {
  id: number;
  patient_name: string;
};

export type AutoInvoiceSnapshotTooth = {
  order_id: number;
  tooth_no: string;
  is_bridge: boolean;
};

export type AutoInvoiceSnapshotNamedItem = {
  id: number;
  item_name: string;
};

export type AutoInvoiceSnapshotMaterialTransaction = {
  deposit_material_id: number;
  transaction_type: string;
  quantity: Prisma.Decimal;
  order_item_id: number | null;
};

export type AutoInvoiceSnapshotDepositMaterial = {
  id: number;
  material_id: number;
};

export type AutoInvoiceSnapshotMaterial = {
  id: number;
  name: string;
};

export type AutoInvoiceItemSnapshot = {
  delivery_id: number;
  order_item_id: number | null;
  delivery_date: Date;
  patient_name: string;
  work_name: string;
  tooth_display: string | null;
  tooth_snapshot: Prisma.InputJsonValue | null;
  material_usage_text: string | null;
  quantity: number;
  unit_price: Prisma.Decimal;
  amount: Prisma.Decimal;
  sort_order: number;
};

export type BuildAutoInvoiceSnapshotInput = {
  customerId: number;
  taxRate: Prisma.Decimal;
  deliveries: AutoInvoiceSnapshotDelivery[];
  orderItems: AutoInvoiceSnapshotOrderItem[];
  orders: AutoInvoiceSnapshotOrder[];
  patients: AutoInvoiceSnapshotPatient[];
  orderTeeth: AutoInvoiceSnapshotTooth[];
  insuranceItems: AutoInvoiceSnapshotNamedItem[];
  privateItems: AutoInvoiceSnapshotNamedItem[];
  materialTransactions: AutoInvoiceSnapshotMaterialTransaction[];
  depositMaterials: AutoInvoiceSnapshotDepositMaterial[];
  materials: AutoInvoiceSnapshotMaterial[];
};

export type AutoInvoiceSnapshotResult = {
  invoiceItems: AutoInvoiceItemSnapshot[];
  subtotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  baseUpSupportAmount: Prisma.Decimal;
};

function formatMaterialQuantity(value: Prisma.Decimal) {
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 3,
  }).format(Number(value));
}

function formatMaterialLabel(name: string) {
  if (name.includes("ミロ")) {
    return "ミロ";
  }

  if (
    name.includes("パラ") ||
    name.includes("金銀パラジウム")
  ) {
    return "パラ";
  }

  return name;
}

function createToothDisplay(toothNos: string[]) {
  if (toothNos.length === 0) {
    return "";
  }

  return toothNos.join(", ");
}

function createMaterialUsageByOrderItemId({
  materialTransactions,
  depositMaterials,
  materials,
}: Pick<
  BuildAutoInvoiceSnapshotInput,
  "materialTransactions" | "depositMaterials" | "materials"
>) {
  const materialNameById = new Map(
    materials.map((material) => [material.id, material.name])
  );
  const depositMaterialById = new Map(
    depositMaterials.map((row) => [row.id, row])
  );
  const materialUsageByOrderItemId = new Map<
    number,
    Map<string, Prisma.Decimal>
  >();

  for (const row of materialTransactions) {
    if (row.order_item_id === null) {
      continue;
    }

    const depositMaterial = depositMaterialById.get(
      row.deposit_material_id
    );

    if (!depositMaterial) {
      continue;
    }

    const materialName = materialNameById.get(
      depositMaterial.material_id
    );

    if (!materialName) {
      continue;
    }

    const label = formatMaterialLabel(materialName);
    const materialMap =
      materialUsageByOrderItemId.get(row.order_item_id) ??
      new Map<string, Prisma.Decimal>();
    const current =
      materialMap.get(label) ?? new Prisma.Decimal(0);
    const signedQuantity =
      row.transaction_type === "use"
        ? row.quantity
        : row.quantity.negated();

    materialMap.set(label, current.add(signedQuantity));
    materialUsageByOrderItemId.set(
      row.order_item_id,
      materialMap
    );
  }

  return materialUsageByOrderItemId;
}

export function buildAutoInvoiceSnapshot({
  customerId,
  taxRate,
  deliveries,
  orderItems,
  orders,
  patients,
  orderTeeth,
  insuranceItems,
  privateItems,
  materialTransactions,
  depositMaterials,
  materials,
}: BuildAutoInvoiceSnapshotInput): AutoInvoiceSnapshotResult {
  const deliveryItems = deliveries.flatMap((delivery) =>
    delivery.delivery_items.map((item) => ({
      ...item,
      delivery_id: delivery.id,
      delivery_date: delivery.delivery_date,
    }))
  );
  const orderItemById = new Map(
    orderItems.map((item) => [item.id, item])
  );
  const orderById = new Map(
    orders.map((order) => [order.id, order])
  );
  const patientNameById = new Map(
    patients.map((patient) => [
      patient.id,
      patient.patient_name,
    ])
  );
  const insuranceNameById = new Map(
    insuranceItems.map((item) => [item.id, item.item_name])
  );
  const privateNameById = new Map(
    privateItems.map((item) => [item.id, item.item_name])
  );
  const teethByOrderId = new Map<
    number,
    Array<{
      tooth_no: string;
      is_bridge: boolean;
    }>
  >();

  for (const tooth of orderTeeth) {
    const current = teethByOrderId.get(tooth.order_id) ?? [];

    current.push({
      tooth_no: tooth.tooth_no,
      is_bridge: tooth.is_bridge,
    });

    teethByOrderId.set(tooth.order_id, current);
  }

  const materialUsageByOrderItemId =
    createMaterialUsageByOrderItemId({
      materialTransactions,
      depositMaterials,
      materials,
    });

  const invoiceItems: AutoInvoiceItemSnapshot[] =
    deliveryItems.map((deliveryItem, index) => {
      const orderItem = orderItemById.get(
        deliveryItem.order_item_id
      );

      if (!orderItem) {
        throw new Error(
          `order_item ${deliveryItem.order_item_id} が存在しません`
        );
      }

      const order = orderById.get(orderItem.order_id);

      if (!order) {
        throw new Error(`order ${orderItem.order_id} が存在しません`);
      }

      if (order.customer_id !== customerId) {
        throw new Error("異なる歯科医院の明細が含まれています");
      }

      const patientName =
        patientNameById.get(order.patient_id) ?? "未登録";
      const workName =
        orderItem.work_name?.trim() ||
        (orderItem.insurance_item_id !== null
          ? insuranceNameById.get(orderItem.insurance_item_id) ??
            "未登録"
          : orderItem.private_item_id !== null
            ? privateNameById.get(orderItem.private_item_id) ??
              "未登録"
            : "未登録");
      const toothSnapshotRows = teethByOrderId.get(order.id) ?? [];
      const toothDisplay = createToothDisplay(
        toothSnapshotRows.map((tooth) => tooth.tooth_no)
      );
      const toothSnapshot: Prisma.InputJsonValue | null =
        toothSnapshotRows.length > 0
          ? toothSnapshotRows.map((tooth) => ({
              tooth_no: tooth.tooth_no,
              is_bridge: tooth.is_bridge,
            }))
          : null;
      const materialUsage = materialUsageByOrderItemId.get(
        orderItem.id
      );
      const materialUsageText = materialUsage
        ? [...materialUsage.entries()]
            .filter(([, quantity]) => quantity.greaterThan(0))
            .map(
              ([label, quantity]) =>
                `${label} ${formatMaterialQuantity(quantity)}g`
            )
            .join("\n")
        : "";

      return {
        delivery_id: deliveryItem.delivery_id,
        order_item_id: deliveryItem.order_item_id,
        delivery_date: deliveryItem.delivery_date,
        patient_name: patientName,
        work_name: workName,
        tooth_display: toothDisplay || null,
        tooth_snapshot: toothSnapshot,
        material_usage_text: materialUsageText || null,
        quantity: deliveryItem.quantity,
        unit_price: deliveryItem.unit_price,
        amount: deliveryItem.amount,
        sort_order: index,
      };
    });

  const baseUpSupportQuantity = orderItems.reduce(
    (total, orderItem) => {
      if (!orderItem.base_up_support_target) {
        return total;
      }

      return total + (orderItem.quantity ?? 1);
    },
    0
  );
  const baseUpSupportAmount = new Prisma.Decimal(
    AUTO_BASE_UP_SUPPORT_AMOUNT_PER_ITEM
  ).mul(baseUpSupportQuantity);

  if (baseUpSupportQuantity > 0) {
    const lastDelivery = deliveries[deliveries.length - 1];

    invoiceItems.push({
      delivery_id: lastDelivery.id,
      order_item_id: null,
      delivery_date: lastDelivery.delivery_date,
      patient_name: "",
      work_name: "BUS",
      tooth_display: null,
      tooth_snapshot: null,
      material_usage_text: null,
      quantity: baseUpSupportQuantity,
      unit_price: new Prisma.Decimal(
        AUTO_BASE_UP_SUPPORT_AMOUNT_PER_ITEM
      ),
      amount: baseUpSupportAmount,
      sort_order: invoiceItems.length,
    });
  }

  const subtotal = invoiceItems.reduce(
    (total, item) => total.add(item.amount),
    new Prisma.Decimal(0)
  );
  const taxAmount = subtotal
    .mul(taxRate)
    .div(100)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  const totalAmount = subtotal.add(taxAmount);

  return {
    invoiceItems,
    subtotal,
    taxAmount,
    totalAmount,
    baseUpSupportAmount,
  };
}
