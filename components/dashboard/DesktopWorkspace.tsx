"use client";

import { useState } from "react";
import DockLauncher, { type DockItem } from "./DockLauncher";
import ModalDisplayArea from "./ModalDisplayArea";

const dockItems: DockItem[] = [
  { id: "order", iconSrc: "/icons/order.svg", iconAlt: "受注入力", label: "受注入力" },
  { id: "work", iconSrc: "/icons/work.svg", iconAlt: "作業時入力", label: "作業時入力" },
  { id: "delivery", iconSrc: "/icons/delivery.svg", iconAlt: "納品書", label: "納品書" },
  { id: "invoice", iconSrc: "/icons/invoice.svg", iconAlt: "請求書", label: "請求書" },
  { id: "manage", iconSrc: "/icons/manage.svg", iconAlt: "管理", label: "管理" },
];

export default function DesktopWorkspace() {
  const [activeId, setActiveId] = useState("order");

  const activeItem = dockItems.find((item) => item.id === activeId);
  const activeLabel = activeItem?.label ?? "受注入力";

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-3 sm:px-6 sm:pb-6">
      <div className="flex min-h-0 flex-[3] items-center justify-center">
        <ModalDisplayArea title={activeLabel} />
      </div>

      <div className="flex flex-[1] items-end justify-center overflow-visible pt-3 sm:pt-4">
        <DockLauncher
          items={dockItems}
          activeId={activeId}
          onSelect={setActiveId}
        />
      </div>
    </section>
  );
}
